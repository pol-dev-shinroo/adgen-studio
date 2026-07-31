import OpenAI from 'openai'
import { config } from '../config/index.js'
import { getAllProducts, updateProductField } from './productSheets.service.js'
import { downloadImageAsBase64, uploadImage } from './imageIO.service.js'
import { extractGeneratedImageBase64 } from '../utils/gptImage.js'

let client = null
function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey })
  }
  return client
}

// The Responses API's hosted image_generation tool always renders/edits
// through OpenAI's current flagship image model (gpt-image-2 at time of
// writing) regardless of which mainline model orchestrates the call.
// gpt-4.1 and gpt-4o-mini both hit a 403 here; gpt-5.5 (OpenAI's current
// flagship mainline model) is used instead per official docs. The detection
// call below doesn't use the image_generation tool at all (vision + JSON
// only), but shares the same orchestrator model for consistency.
const ORCHESTRATOR_MODEL = 'gpt-5.5'

// Part M: two-stage pipeline. Stage 1 (this prompt) identifies what's
// actually in the photo — distinct product types plus an optional human
// model — before stage 2 isolates each one separately. Stage 1 replaces
// the old single "just isolate the one product" assumption, which silently
// discarded any second product or human model ever shown alongside it.
const DETECTION_SYSTEM_PROMPT = `You are an expert Product Photo Analyst. Inspect this product marketing
photo and identify every DISTINCT type of product visible — ignore multiple
instances/angles of the SAME product, only list genuinely different product
types (e.g. two different flavor/SKU bottles shown together). For each,
give a short Korean label and a brief visual description. Also identify
whether a human model (a person) is visibly present holding/using/posing
with the product(s); if so, describe their pose/framing briefly.

Output ONLY valid JSON:
{
  "products": [{ "label": "...", "description": "..." }],
  "human_model": { "present": true|false, "description": "..." }
}`

const DETECTION_USER_PROMPT = 'Analyze the provided product photo according to the system instructions. ' +
  'Output ONLY a valid JSON object.'

// Pure and exported so the shape-normalization logic (missing fields,
// malformed entries, the zero-products fallback) is unit-testable against
// fake JSON text without any real OpenAI call.
export function parseDetectionResult(rawText) {
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch (err) {
    throw new Error(`Entity detection returned invalid JSON: ${err.message}`)
  }

  const products = (Array.isArray(parsed.products) ? parsed.products : [])
    .filter((p) => p && typeof p.description === 'string' && p.description.trim())
    .map((p) => ({
      label: typeof p.label === 'string' && p.label.trim() ? p.label.trim() : '제품',
      description: p.description.trim(),
    }))

  // A photo the model failed to break into distinct products is still a
  // real single-product photo in practice (this was every photo's
  // assumption before Part M) — fall back to one generic entity rather
  // than isolating nothing at all.
  if (products.length === 0) {
    products.push({ label: '제품', description: 'the main product shown in this photo' })
  }

  return {
    products,
    human_model: {
      present: Boolean(parsed.human_model?.present),
      description: typeof parsed.human_model?.description === 'string' ? parsed.human_model.description.trim() : '',
    },
  }
}

// Adapts the pre-Part-M single-product prompt: scoped to one described
// entity when there's more than one product in the photo, otherwise the
// original unscoped wording (so a genuinely single-product photo's prompt
// — and cost/behavior — stays identical to before this part). Exported for
// direct unit testing of the scoping logic.
export function buildProductIsolationPrompt(entity, totalProducts) {
  const target = totalProducts > 1
    ? `Isolate ONLY the product described as: ${entity.description}. `
    : `Isolate ONLY the product from this photo. `
  return target +
    `Remove the background, any other products, hands, people, staging props, and marketing text overlays. ` +
    `Output the product centered on a plain solid white background, preserving its true shape, colors, ` +
    `proportions, and any text or label printed on the product's own packaging exactly as it appears. Do not ` +
    `crop off any part of the product, and do not add new shadows, reflections, or decorative elements.`
}

export const MODEL_ISOLATION_PROMPT = `Isolate ONLY the human model (person) from this photo. Remove the ` +
  `product(s), background, and props. Preserve their pose, clothing, and appearance exactly as shown. Output ` +
  `them centered on a plain solid white background.`

function findBrand(brandKey) {
  return config.brands.find((b) => b.key === brandKey)
}

async function detectEntities(imageBase64, mimeType) {
  const response = await getClient().responses.create({
    model: ORCHESTRATOR_MODEL,
    text: { format: { type: 'json_object' } },
    input: [
      { role: 'system', content: DETECTION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: DETECTION_USER_PROMPT },
          { type: 'input_image', image_url: `data:${mimeType};base64,${imageBase64}` },
        ],
      },
    ],
  })
  return parseDetectionResult(response.output_text)
}

async function isolateEntity(imageBase64, mimeType, prompt) {
  const response = await getClient().responses.create({
    model: ORCHESTRATOR_MODEL,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: `data:${mimeType};base64,${imageBase64}` },
        ],
      },
    ],
    tools: [{ type: 'image_generation', action: 'edit', background: 'opaque', quality: 'high' }],
  })
  return extractGeneratedImageBase64(response)
}

// Synchronous request/response by design — same as before Part M, just now
// 1 detection call + 1 isolation call per detected entity (product(s) plus
// an optional human model) instead of always exactly 1 call. Real money per
// call: a typical single-product, no-model photo now costs 2 calls where it
// used to cost 1. Invoked on demand from 상품관리, not a background job.
export async function extractProductImage(brandKey, productId) {
  const brand = findBrand(brandKey)
  if (!brand) {
    const err = new Error(`Unknown brand "${brandKey}"`)
    err.notFound = true
    throw err
  }

  const products = await getAllProducts()
  const product = products.find((p) => p['Brand'] === brand.name && p['Product ID'] === String(productId))
  if (!product) {
    const err = new Error(`No product "${productId}" found for brand "${brandKey}"`)
    err.notFound = true
    throw err
  }

  const rawImageUrl = (product['Image URL'] || '').split('\n')[0].trim()
  if (!rawImageUrl) {
    throw new Error(`Product "${productId}" has no raw image to extract a reference from.`)
  }

  const { base64, mimeType } = await downloadImageAsBase64(rawImageUrl)

  const detection = await detectEntities(base64, mimeType)
  const extractedAt = new Date().toISOString()
  const references = []

  for (let i = 0; i < detection.products.length; i++) {
    const entity = detection.products[i]
    const prompt = buildProductIsolationPrompt(entity, detection.products.length)
    const resultBase64 = await isolateEntity(base64, mimeType, prompt)
    const link = await uploadImage(resultBase64, {
      rootFolderName: 'AdGen Product References',
      subfolder: brandKey,
      fileName: `${productId}-product-${i}.png`,
    })
    references.push({ type: 'product', label: entity.label, imageUrl: link, extractedAt })
  }

  if (detection.human_model.present) {
    const resultBase64 = await isolateEntity(base64, mimeType, MODEL_ISOLATION_PROMPT)
    const link = await uploadImage(resultBase64, {
      rootFolderName: 'AdGen Product References',
      subfolder: brandKey,
      fileName: `${productId}-model.png`,
    })
    references.push({ type: 'model', label: '모델', imageUrl: link, extractedAt })
  }

  await updateProductField(String(productId), 'Extracted References JSON', JSON.stringify(references))

  return { references }
}
