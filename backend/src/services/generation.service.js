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

// Pure — no reason this needs the real job/products/ads plumbing to verify,
// so it's split out and exported on its own.
export function computeTotalRenders(products, refAds, formats, quantity) {
  return products.length * refAds.length * formats.length * quantity
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

  const unextracted = resolved.filter(({ product }) => !product['Extracted Image URL'])
  if (unextracted.length > 0) {
    const names = unextracted.map(({ productId, product }) => product['Product Name'] || productId)
    const err = new Error(
      `다음 제품은 아직 참조 이미지가 추출되지 않았습니다 — 상품관리에서 먼저 추출해주세요: ${names.join(', ')}`
    )
    err.badRequest = true
    throw err
  }

  const products = resolved.map(({ productId, product }) => ({
    productId,
    extractedImageUrl: product['Extracted Image URL'],
  }))

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
// styleIntensity, instructions }. formats: array of format strings (see
// renderImage.service.js's FORMAT_SIZE keys). quantity: plain integer
// (frontend converts its '2장'-style chip value before calling this).
// productIds: array — Step 3 allows selecting more than one of a brand's
// own products, each producing its own full render pass.
//
// Runs the expensive per-reference-ad stages (vision analysis, counter-fact
// research, copywriting) exactly once per selected reference ad and caches
// the result — that cache is keyed on the reference ad, not the product, so
// every selected product reuses it rather than re-paying for those three
// calls per product. Only the render step itself (and the one-time-per-
// product reference-image download) repeats per product.
export async function startGeneration(input) {
  const { refBrand, refAdIds, brand, formats, quantity, styleIntensity, instructions } = input
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
    (job) => runJob(job, { refAds, products, brandDef, formats, quantity, styleIntensity, instructions }),
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

async function runJob(job, { refAds, products, brandDef, formats, quantity, styleIntensity, instructions }) {
  const progress = job.progress
  const summary = job.summary

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
      const { counter_facts } = await findCounterFacts(brandDef.key, analysis.identified_texts)

      progress.phase = 'writing'
      const { replacements } = await writeReplacementCopy(analysis.identified_texts, counter_facts)

      perAdContext.push({
        adId, referenceImageBase64, productInstances: analysis.product_instances, replacements,
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
