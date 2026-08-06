import { randomUUID } from 'node:crypto'
import { config } from '../config/index.js'
import { createJobStore } from '../utils/jobStore.js'
import { getAllAds } from './sheets.service.js'
import { getAllProducts } from './productSheets.service.js'
import { downloadImageAsBase64, uploadGeneratedImage } from './imageIO.service.js'
import { analyzeReferenceAd } from './visionAnalysis.service.js'
import { findCounterFacts } from './counterFacts.service.js'
import { writeReplacementCopy } from './copywriting.service.js'
import { renderFinalImage } from './renderImage.service.js'
import { appendGeneratedRow } from './generatedSheets.service.js'
import { mapGeneratedAd } from '../mappers/generatedAd.mapper.js'

const jobStore = createJobStore()
const RECENT_ITEMS_LIMIT = 20

function firstLink(newlineJoined) {
  return (newlineJoined || '').split('\n').find(Boolean) || ''
}

function findBrandDef(brandKey) {
  return config.brands.find((b) => b.key === brandKey)
}

// Part M: 'Extracted Image URL' (single value) is replaced by 'Extracted
// References JSON' (an array of { type: 'product'|'model', imageUrl, ... }
// entries, since a photo can now yield more than one distinct product plus
// a human model). Malformed/missing JSON (older rows, or rows that were
// never extracted) safely yields [], same "not extracted yet" outcome
// prepareInputs already handled for the old single-field case.
function productTypeReferences(product) {
  let references
  try {
    references = JSON.parse(product['Extracted References JSON'] || '[]')
  } catch {
    return []
  }
  return Array.isArray(references) ? references.filter((r) => r?.type === 'product') : []
}

// Sane default when nothing more specific is picked: the first product-type
// entry.
function firstProductReferenceImageUrl(product) {
  return productTypeReferences(product)[0]?.imageUrl || null
}

// Part S: extracts a Drive file ID from either URL form this app produces
// for the same file — a sheet-stored webViewLink ("/file/d/<id>/view") or
// the thumbnail-endpoint form the frontend actually sends ("?id=<id>...",
// from adaptProduct.js's toEmbeddableImageUrl) — so the two are comparable
// despite never matching as plain strings.
function driveFileIdFrom(url) {
  if (typeof url !== 'string') return null
  const viewMatch = url.match(/\/file\/d\/([^/]+)/)
  if (viewMatch) return viewMatch[1]
  const idParamMatch = url.match(/[?&]id=([^&]+)/)
  return idParamMatch ? idParamMatch[1] : null
}

// Part S: resolves which of a product's own type:'product' entries to
// render with, honoring a client-supplied `productImageOverrides[productId]`
// URL only when it's independently verifiable against that product's own
// real 'Extracted References JSON' — matched by Drive file ID (see
// driveFileIdFrom above), never trusted as a raw string. No match (absent,
// malformed, or pointing at a file that isn't actually one of this
// product's own real product-type entries) falls back to the exact same
// firstProductReferenceImageUrl default as before this part — identical
// behavior for every existing call site that never sends an override.
function resolveProductReferenceImageUrl(product, overrideImageUrl) {
  const overrideId = driveFileIdFrom(overrideImageUrl)
  if (overrideId) {
    const match = productTypeReferences(product).find((r) => driveFileIdFrom(r.imageUrl) === overrideId)
    if (match) return match.imageUrl
  }
  return firstProductReferenceImageUrl(product)
}

// Pure — no reason this needs the real job/products/ads plumbing to verify,
// so it's split out and exported on its own.
export function computeTotalRenders(products, refAds, formats, quantity) {
  return products.length * refAds.length * formats.length * quantity
}

// Part P: converts Step 3's ad-selection panel's { price, promotion,
// adHooks } into the exact counter_facts shape findCounterFacts already
// produces ([{category, fact}]), so writeReplacementCopy needs zero
// changes — it already just JSON.stringifies whatever counter_facts array
// it's handed. Real, user-picked copy from the brand's own past ads is
// more reliable than a Pinecone semantic guess, so when present this
// replaces (not supplements) the Pinecone lookup for the run.
//
// Returns null — not []  — for "no usable override", covering both "no
// override object at all" and "an override object with every field empty"
// (a malformed/stale payload the frontend shouldn't send per its own
// contract, but this backend never trusts the frontend as the only gate —
// see prepareInputs's own comment on the same principle). null is the
// signal callers use to fall through to the existing Pinecone path
// unchanged; an override that resolves to zero facts is treated exactly
// the same as no override, not as "replace with nothing."
export function counterFactsFromAdCopyOverride(override) {
  if (!override || typeof override !== 'object') return null

  const facts = []
  if (typeof override.price === 'string' && override.price.trim()) {
    facts.push({ category: '가격', fact: override.price.trim() })
  }
  if (typeof override.promotion === 'string' && override.promotion.trim()) {
    facts.push({ category: '프로모션', fact: override.promotion.trim() })
  }
  for (const hook of Array.isArray(override.adHooks) ? override.adHooks : []) {
    if (typeof hook === 'string' && hook.trim()) {
      facts.push({ category: '광고 후킹 카피', fact: hook.trim() })
    }
  }

  return facts.length > 0 ? facts : null
}

// Synchronous (well, awaited-but-fast) validation before any job/money is
// committed: unknown brand, unknown/unextracted product(s), or no matching
// reference ads all fail here with `.badRequest = true` rather than only
// surfacing after a job has already started (and, worse, after the
// expensive per-ad stages have already run). Enforced independently of the
// frontend's own pre-check (Studio Step 3/StudioContext.jsx's goNext also
// blocks on missing extraction) — the frontend can't be trusted as the only
// gate on a real-money endpoint.
//
// getAllProductsFn/getAllAdsFn are injected (defaulting to the real
// services) purely so this can be unit-tested without hitting Google
// Sheets — same pattern as analyzeProduct.service.js's pineconeService
// injection.
export async function prepareInputs(
  { refAdIds, brand },
  { getAllProductsFn = getAllProducts, getAllAdsFn = getAllAds } = {}
) {
  const brandDef = findBrandDef(brand?.key)
  if (!brandDef) {
    const err = new Error(`Unknown brand "${brand?.key}"`)
    err.badRequest = true
    throw err
  }

  const productIds = brand?.productIds || []
  if (productIds.length === 0) {
    const err = new Error('선택된 제품이 없습니다.')
    err.badRequest = true
    throw err
  }

  const allProducts = await getAllProductsFn()
  const brandProducts = allProducts.filter((p) => p['Brand'] === brandDef.name)

  const missingIds = []
  const resolved = []
  for (const productId of productIds) {
    const product = brandProducts.find((p) => p['Product ID'] === String(productId))
    if (!product) {
      missingIds.push(String(productId))
    } else {
      resolved.push({ productId: String(productId), product })
    }
  }
  if (missingIds.length > 0) {
    const err = new Error(
      `제품을 찾을 수 없습니다 (브랜드 "${brand.key}"): ${missingIds.join(', ')}`
    )
    err.badRequest = true
    throw err
  }

  // Part S: brand.productImageOverrides is an optional { [productId]: url }
  // map — see resolveProductReferenceImageUrl above for the verification
  // this goes through before an override is actually trusted.
  const productImageOverrides = brand?.productImageOverrides || {}
  const withFirstProductRef = resolved.map(({ productId, product }) => (
    { productId, product, extractedImageUrl: resolveProductReferenceImageUrl(product, productImageOverrides[productId]) }
  ))

  const unextracted = withFirstProductRef.filter(({ extractedImageUrl }) => !extractedImageUrl)
  if (unextracted.length > 0) {
    const names = unextracted.map(({ productId, product }) => product['Product Name'] || productId)
    const err = new Error(
      `다음 제품은 아직 참조 이미지가 추출되지 않았습니다 — 상품관리에서 먼저 추출해주세요: ${names.join(', ')}`
    )
    err.badRequest = true
    throw err
  }

  const products = withFirstProductRef.map(({ productId, extractedImageUrl }) => ({ productId, extractedImageUrl }))

  const allAds = await getAllAdsFn()
  const adsById = new Map(allAds.map((a) => [String(a['Ad Archive ID']), a]))
  const refAds = (refAdIds || []).map((id) => adsById.get(String(id))).filter(Boolean)
  if (refAds.length === 0) {
    const err = new Error('선택한 레퍼런스 광고를 찾을 수 없습니다.')
    err.badRequest = true
    throw err
  }

  return { brandDef, products, refAds }
}

// Input: { refBrand, refAdIds, brand:{key,productIds}, formats, quantity,
// styleIntensity, instructions, adCopyOverride, referenceSheetImageUrl }.
// formats: array of format strings (see renderImage.service.js's
// FORMAT_SIZE keys). quantity: plain integer (frontend converts its
// '2장'-style chip value before calling this). productIds: array — Step 3
// allows selecting more than one of a brand's own products, each producing
// its own full render pass. referenceSheetImageUrl (Part Q): string | null
// — URL of one of our own brand's Part N/O composed reference sheets, used
// as a third, supplementary style-reference image in every render this job
// produces; null preserves the exact pre-Part-Q two-image render.
//
// Runs the expensive per-reference-ad stages (vision analysis, counter-fact
// research, copywriting) exactly once per selected reference ad and caches
// the result — that cache is keyed on the reference ad, not the product, so
// every selected product reuses it rather than re-paying for those three
// calls per product. Only the render step itself (and the one-time-per-
// product reference-image download) repeats per product.
export async function startGeneration(input) {
  const {
    refBrand, refAdIds, brand, formats, quantity, styleIntensity, instructions, adCopyOverride, referenceSheetImageUrl,
  } = input
  const { brandDef, products, refAds } = await prepareInputs({ refAdIds, brand })

  const totalRenders = computeTotalRenders(products, refAds, formats, quantity)

  return jobStore.startJob(
    {
      status: 'running',
      refBrand,
      brandKey: brandDef.key,
      brandName: brandDef.name,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      progress: {
        phase: 'analyzing',
        totalRenders,
        rendersDone: 0,
        recentItems: [],
      },
      summary: {
        totalRenders,
        succeeded: 0,
        failed: 0,
        failures: [],
        resultIds: [],
      },
    },
    (job) => runJob(
      job,
      { refAds, products, brandDef, formats, quantity, styleIntensity, instructions, adCopyOverride, referenceSheetImageUrl }
    ),
    (job, err) => {
      job.status = 'failed'
      job.error = err.message
      job.finishedAt = new Date().toISOString()
    }
  )
}

export function getJob(jobId) {
  return jobStore.getJob(jobId)
}

async function runJob(
  job,
  { refAds, products, brandDef, formats, quantity, styleIntensity, instructions, adCopyOverride, referenceSheetImageUrl }
) {
  const progress = job.progress
  const summary = job.summary

  // Part P: resolved once per job, not per reference ad — same as the
  // Pinecone-backed facts it can replace, this has always been one shared
  // fact set applied uniformly across every selected reference ad, never
  // varied per ad.
  const overrideFacts = counterFactsFromAdCopyOverride(adCopyOverride)

  // Part Q: resolved once per job — an even broader scope than counter_facts
  // above, since this doesn't vary per product OR per reference ad either;
  // it's one shared supplementary style image for the whole run. A download
  // failure here is deliberately non-fatal — this image is a nice-to-have
  // enhancement, never load-bearing the way the product's own extracted
  // reference image is, so every render in the job just proceeds without a
  // third image rather than the whole job failing over an optional extra.
  let styleReferenceImageBase64 = null
  if (referenceSheetImageUrl) {
    try {
      styleReferenceImageBase64 = (await downloadImageAsBase64(referenceSheetImageUrl)).base64
    } catch (err) {
      console.warn(`Style-reference sheet download failed, proceeding without it: ${err.message}`)
    }
  }

  // Built exactly once regardless of how many products are selected —
  // vision/counter-fact/copywriting analysis is keyed on the reference ad,
  // not the product.
  const perAdContext = []
  for (const ad of refAds) {
    const adId = ad['Ad Archive ID']
    const imageLink = firstLink(ad['Archived Image Links']) || ad['Archived Thumbnail'] || firstLink(ad['Image Links'])

    if (!imageLink) {
      summary.failed += products.length * formats.length * quantity
      summary.failures.push({ adId, error: 'No image available for this reference ad' })
      continue
    }

    try {
      progress.phase = 'analyzing'
      const { base64: referenceImageBase64 } = await downloadImageAsBase64(imageLink)
      const analysis = await analyzeReferenceAd(referenceImageBase64)

      progress.phase = 'researching'
      // Real, user-picked copy from Step 3's ad-selection panel skips the
      // Pinecone/embedding lookup entirely when present — not just a
      // different source of facts, a cheaper path too.
      const counter_facts = overrideFacts ?? (await findCounterFacts(brandDef.key, analysis.identified_texts)).counter_facts

      progress.phase = 'writing'
      // Part U-2: same shared styleIntensity slider renderFinalImage
      // already receives below — same "competitor original vs our own
      // material" axis, applied to copy instead of image.
      const { replacements } = await writeReplacementCopy(analysis.identified_texts, counter_facts, styleIntensity)

      perAdContext.push({
        adId, imageLink, referenceImageBase64, productInstances: analysis.product_instances, replacements,
      })
    } catch (err) {
      summary.failed += products.length * formats.length * quantity
      summary.failures.push({ adId, error: err.message })
      console.warn(`Reference-ad analysis failed (ad ${adId}): ${err.message}`)
    }
  }

  let renderIndex = 0
  for (const productEntry of products) {
    // Downloaded once per product, reused across every (ad x format x
    // quantity) render for that product — not once per render.
    let productImageBase64
    try {
      const downloaded = await downloadImageAsBase64(productEntry.extractedImageUrl)
      productImageBase64 = downloaded.base64
    } catch (err) {
      summary.failed += perAdContext.length * formats.length * quantity
      summary.failures.push({
        productId: productEntry.productId,
        error: `Failed to download product reference image: ${err.message}`,
      })
      console.warn(`Product image download failed (product ${productEntry.productId}): ${err.message}`)
      continue
    }

    for (const ctx of perAdContext) {
      for (const format of formats) {
        for (let i = 0; i < quantity; i++) {
          renderIndex += 1
          progress.phase = `rendering (${renderIndex}/${progress.totalRenders})`

          try {
            const resultBase64 = await renderFinalImage({
              referenceImageBase64: ctx.referenceImageBase64,
              productImageBase64,
              styleReferenceImageBase64,
              productInstances: ctx.productInstances,
              replacements: ctx.replacements,
              format,
              styleIntensity,
              instructions,
            })

            progress.phase = 'saving'
            const generationId = randomUUID()
            const imageUrl = await uploadGeneratedImage(resultBase64, {
              brandKey: brandDef.key,
              fileName: `${generationId}.png`,
            })

            await appendGeneratedRow(mapGeneratedAd({
              generationId,
              brand: brandDef.name,
              referenceAdId: ctx.adId,
              format,
              styleIntensity,
              instructions,
              imageUrl,
              productId: productEntry.productId,
              replacements: ctx.replacements,
              // Part V: snapshotted at generation time, for the Gallery's
              // redesigned 비교 view — nothing to look up live for these.
              referenceAdImageUrl: ctx.imageLink,
              productReferenceImageUrl: productEntry.extractedImageUrl,
              styleReferenceImageUrl: referenceSheetImageUrl || '',
            }))

            summary.succeeded += 1
            summary.resultIds.push(generationId)
            progress.recentItems.unshift({
              adId: ctx.adId, format, productId: productEntry.productId, status: 'done', generationId,
            })
          } catch (err) {
            summary.failed += 1
            summary.failures.push({
              adId: ctx.adId, format, productId: productEntry.productId, error: err.message,
            })
            progress.recentItems.unshift({
              adId: ctx.adId, format, productId: productEntry.productId, status: 'failed',
            })
            console.warn(
              `Render failed (ad ${ctx.adId}, format ${format}, product ${productEntry.productId}): ${err.message}`
            )
          }

          progress.rendersDone = renderIndex
          progress.recentItems = progress.recentItems.slice(0, RECENT_ITEMS_LIMIT)
        }
      }
    }
  }

  progress.phase = 'done'
  job.status = 'done'
  job.finishedAt = new Date().toISOString()
}
