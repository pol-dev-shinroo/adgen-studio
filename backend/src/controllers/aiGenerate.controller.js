import { randomUUID } from 'node:crypto'
import { getAllAds } from '../services/sheets/sheets.service.js'
import { getAllProducts } from '../services/sheets/productSheets.service.js'
import { downloadImageAsBase64, uploadGeneratedImage } from '../services/generation/imageIO.service.js'
import { segmentReferenceAd } from '../services/generation/adSegmentation.service.js'
import { findBrandDef, firstLink, resolveProductReferenceImageUrl } from '../services/generation/helpers.js'
import { analyzeReferenceAd } from '../services/generation/visionAnalysis.service.js'
import { findCounterFacts } from '../services/generation/counterFacts.service.js'
import { writeReplacementCopy } from '../services/generation/copywriting.service.js'
import { renderConversationalImage } from '../services/generation/renderImage.service.js'
import { buildConversationalInstructions } from '../services/generation/conversationalInstructions.js'
import { appendGeneratedRow } from '../services/sheets/generatedSheets.service.js'
import { mapGeneratedAd } from '../mappers/generatedAd.mapper.js'

// Part EE: 생성 AI's segmentation step — resolves a single reference ad's
// archived image the exact same way run.js's own render loop does
// (Archived Image Links -> Archived Thumbnail -> Image Links fallback chain,
// shared via helpers.js's firstLink rather than reimplemented here), then
// runs the new bounding-box segmentation call. Returns the resolved image
// URL alongside the segments so the frontend can render the highlight
// overlay without a second lookup — same raw (Drive webViewLink) form every
// other backend response already returns; the frontend's own
// toEmbeddableImageUrl converts it for actual <img> use, same as adaptAd.js/
// adaptProduct.js already do for every other Drive-sourced URL.
//
// CC-2-style deps: getAllAdsFn/downloadImageAsBase64Fn/segmentReferenceAdFn
// are injected (defaulting to the real implementations) purely so this is
// unit-testable without a real Sheets/OpenAI call.
export async function postSegment(req, res, next, {
  getAllAdsFn = getAllAds, downloadImageAsBase64Fn = downloadImageAsBase64, segmentReferenceAdFn = segmentReferenceAd,
} = {}) {
  const { refAdId } = req.body ?? {}
  if (!refAdId) {
    return res.status(400).json({ error: '"refAdId" is required' })
  }

  try {
    const ads = await getAllAdsFn()
    const ad = ads.find((a) => String(a['Ad Archive ID']) === String(refAdId))
    if (!ad) return res.status(404).json({ error: `No reference ad found for id "${refAdId}"` })

    const imageLink = firstLink(ad['Archived Image Links']) || ad['Archived Thumbnail'] || firstLink(ad['Image Links'])
    if (!imageLink) return res.status(400).json({ error: 'Reference ad has no image available to segment' })

    const { base64 } = await downloadImageAsBase64Fn(imageLink)
    const { segments } = await segmentReferenceAdFn(base64)

    res.json({ segments, imageUrl: imageLink })
  } catch (err) {
    next(err)
  }
}

// Part EE §7 step 2: visionAnalysis's identified_texts carry no stable IDs
// of their own — its own replacements array (from writeReplacementCopy)
// only lines up with adSegmentation's stable-ID'd text segments by exact
// transcribed text content. Only overrides a replacement's new_text when
// the decision actually names a concrete value to use (a picked factual
// value for mode:'keep', or the user's own words for mode:'custom') — a
// mode:'replace' text decision is a STYLING reference (handled separately,
// as a copy-style material image), never a content override. A segment
// that fails to correlate (no replacements entry shares its exact text)
// logs a warning and is left alone, falling back to whatever
// writeReplacementCopy already suggested for it, rather than throwing —
// same "never abort over a soft-fail" posture the rest of this pipeline
// already follows (see AA-2/AA-3's own per-item try/catch precedent).
// Exported and pure so this correlation logic is unit-testable on its own.
export function applyTextDecisionOverrides(replacements, textSegments, decisionsTexts) {
  const result = replacements.map((r) => ({ ...r }))
  for (const segment of textSegments) {
    const decision = decisionsTexts?.[segment.id]
    if (!decision || decision.mode === 'replace' || !decision.value) continue
    const match = result.find((r) => r.original_text === segment.text)
    if (match) {
      match.new_text = decision.value
    } else {
      console.warn(
        `생성 AI render: could not correlate text segment "${segment.id}" (text: "${segment.text}") with any ` +
        'copywriting replacement — using the copywriting service\'s own suggestion for it instead.'
      )
    }
  }
  return result
}

function validateRenderBody(body) {
  const { refAdId, brand, formats, quantity, decisions } = body ?? {}
  if (!refAdId) return '"refAdId" is required'
  if (!brand || typeof brand.key !== 'string' || (typeof brand.productId !== 'string' && typeof brand.productId !== 'number')) {
    return '"brand" must include "key" and "productId"'
  }
  if (!Array.isArray(formats) || formats.length === 0) return '"formats" must be a non-empty array'
  const qty = Number(quantity)
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) return '"quantity" must be an integer between 1 and 10'
  if (!decisions || typeof decisions !== 'object') return '"decisions" is required'
  return null
}

// Part EE §7: 생성 AI's single-ad, single-product render — runs the exact
// same vision-analysis + counter-facts + copywriting pipeline run.js's
// runJob already runs per reference ad (steps computed ONCE here too, same
// "expensive stages run once, only the render itself repeats per format x
// quantity" principle), then calls renderConversationalImage once per
// (format x quantity) combination — same math as StudioContext's
// refAdConfigs entries, just for exactly one ad/product instead of a batch.
// Partial per-render failures don't abort the whole request (same posture
// as run.js's own per-render try/catch); the response summarizes what
// succeeded/failed instead of polling, since this is a single synchronous
// request-response, not a background job (see AIStudioContext.jsx's own
// comment on why no job-polling infra was built for this screen).
export async function postRender(req, res, next, {
  getAllAdsFn = getAllAds,
  getAllProductsFn = getAllProducts,
  downloadImageAsBase64Fn = downloadImageAsBase64,
  uploadGeneratedImageFn = uploadGeneratedImage,
  analyzeReferenceAdFn = analyzeReferenceAd,
  findCounterFactsFn = findCounterFacts,
  writeReplacementCopyFn = writeReplacementCopy,
  renderConversationalImageFn = renderConversationalImage,
  appendGeneratedRowFn = appendGeneratedRow,
} = {}) {
  const validationError = validateRenderBody(req.body)
  if (validationError) return res.status(400).json({ error: validationError })

  const { refAdId, refBrand, brand, formats, quantity, decisions, segments } = req.body
  const qty = Number(quantity)
  const textSegments = (Array.isArray(segments) ? segments : []).filter((s) => s?.type === 'text')

  try {
    const brandDef = findBrandDef(brand.key)
    if (!brandDef) return res.status(400).json({ error: `Unknown brand "${brand.key}"` })

    const ads = await getAllAdsFn()
    const ad = ads.find((a) => String(a['Ad Archive ID']) === String(refAdId))
    if (!ad) return res.status(404).json({ error: `No reference ad found for id "${refAdId}"` })
    const referenceAdImageLink = firstLink(ad['Archived Image Links']) || ad['Archived Thumbnail'] || firstLink(ad['Image Links'])
    if (!referenceAdImageLink) return res.status(400).json({ error: 'Reference ad has no image available' })

    const allProducts = await getAllProductsFn()
    const product = allProducts.find((p) => p['Brand'] === brandDef.name && p['Product ID'] === String(brand.productId))
    if (!product) return res.status(400).json({ error: `No product "${brand.productId}" found for brand "${brand.key}"` })

    const productImageOverride = decisions.product?.mode === 'replace' ? decisions.product.value : null
    const productImageUrl = resolveProductReferenceImageUrl(product, productImageOverride)
    if (!productImageUrl) {
      return res.status(400).json({
        error: `제품 "${product['Product Name'] || brand.productId}"에는 아직 참조 이미지가 추출되지 않았습니다 — 상품관리에서 먼저 추출해주세요.`,
      })
    }

    // §7 step 4: at most ONE copy-style material image total, even if more
    // than one text segment picked 'replace' — the first one wins. A richer
    // multi-copy-reference render is explicitly out of scope for this pass.
    const copyStyleUrl = Object.values(decisions.texts || {}).find((d) => d?.mode === 'replace')?.value || null
    const backgroundUrl = decisions.background?.mode === 'replace' ? decisions.background.value : null
    const modelFaceUrl = decisions.model?.mode === 'replace' ? decisions.model.value : null

    const [referenceImage, productImage, backgroundImage, modelFaceImage, copyStyleImage] = await Promise.all([
      downloadImageAsBase64Fn(referenceAdImageLink),
      downloadImageAsBase64Fn(productImageUrl),
      backgroundUrl ? downloadImageAsBase64Fn(backgroundUrl) : Promise.resolve(null),
      modelFaceUrl ? downloadImageAsBase64Fn(modelFaceUrl) : Promise.resolve(null),
      copyStyleUrl ? downloadImageAsBase64Fn(copyStyleUrl) : Promise.resolve(null),
    ])

    const materialImages = []
    if (backgroundImage) materialImages.push({ role: 'background', imageBase64: backgroundImage.base64 })
    if (modelFaceImage) materialImages.push({ role: 'model-face', imageBase64: modelFaceImage.base64 })
    if (copyStyleImage) materialImages.push({ role: 'copy-style', imageBase64: copyStyleImage.base64 })

    const analysis = await analyzeReferenceAdFn(referenceImage.base64)
    const { counter_facts } = await findCounterFactsFn(brandDef.key, analysis.identified_texts)
    // Part EE: this screen has no style-intensity slider — every text
    // decision is already explicit per segment, so this base copywriting
    // pass just needs a neutral, non-presumptuous tier. MEDIUM (50) is used
    // deliberately rather than LOW/HIGH, since neither extreme reflects
    // this screen's own per-segment explicitness any better than the other;
    // whatever this suggests per text element is then overridden per-
    // segment below wherever a decision names a concrete value.
    const { replacements: baseReplacements } = await writeReplacementCopyFn(analysis.identified_texts, counter_facts, 50)
    const replacements = applyTextDecisionOverrides(baseReplacements, textSegments, decisions.texts)

    const instructions = buildConversationalInstructions(decisions, { productInstances: analysis.product_instances, replacements })

    const succeeded = []
    const failures = []

    for (const format of formats) {
      for (let i = 0; i < qty; i += 1) {
        try {
          const resultBase64 = await renderConversationalImageFn({
            referenceImageBase64: referenceImage.base64,
            productImageBase64: productImage.base64,
            materialImages,
            productInstances: analysis.product_instances,
            replacements,
            format,
            instructions,
          })

          const generationId = randomUUID()
          const imageUrl = await uploadGeneratedImageFn(resultBase64, { brandKey: brandDef.key, fileName: `${generationId}.png` })

          await appendGeneratedRowFn(mapGeneratedAd({
            generationId,
            brand: brandDef.name,
            refBrand,
            referenceAdId: refAdId,
            format,
            styleIntensity: '',
            instructions: '',
            imageUrl,
            productId: String(brand.productId),
            replacements,
            referenceAdImageUrl: referenceAdImageLink,
            productReferenceImageUrl: productImageUrl,
            styleReferenceImageUrl: copyStyleUrl || backgroundUrl || modelFaceUrl || '',
          }))

          succeeded.push(generationId)
        } catch (err) {
          console.warn(`생성 AI render failed (ad ${refAdId}, format ${format}): ${err.message}`)
          failures.push({ format, error: err.message })
        }
      }
    }

    res.json({
      generationId: succeeded[0] || null,
      resultIds: succeeded,
      succeeded: succeeded.length,
      failed: failures.length,
      failures,
    })
  } catch (err) {
    next(err)
  }
}
