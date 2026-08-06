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
// flagship mainline model) is used instead per official docs. Used for
// every isolation call and, per Part T's real test below, detection too.
const ORCHESTRATOR_MODEL = 'gpt-5.5'

// Part T: the detection call below never invokes image_generation, so it
// isn't bound to gpt-5.5 the way isolation calls are — tried the
// materially cheaper 'gpt-5.4-mini' for real (a plain eligibility call
// succeeded, so it's not a 403 case like gpt-4o-mini/gpt-4.1 were for the
// image_generation tool), then a real side-by-side vision transcription
// test against the exact kind of rich, text-heavy photo this prompt needs
// to handle well. Result: gpt-5.4-mini dropped decorative glyphs (★ rating
// stars, 🚨 emoji) that gpt-5.5 preserved, and over-fragmented single
// coherent phrases into disconnected pieces — a real, material
// transcription-fidelity regression against this prompt's own "transcribe
// exactly, don't invent or omit" requirement. Falling back to gpt-5.5 for
// detection too, per this task's own explicit allowance for that outcome —
// not chasing savings at the cost of a real quality regression.
const DETECTION_MODEL = 'gpt-5.5'

const VALID_KINDS = new Set(['visual', 'text'])

// Part T: generalizes Part M's two-stage pipeline beyond product/model.
// Stage 1 (this prompt) now identifies every distinct, individually
// reusable element in the photo — not just product types and an optional
// human model — classifying each as "visual" (worth its own cropped image
// asset, isolated in stage 2 below) or "text" (just marketing copy,
// transcribed verbatim right here, no separate isolation call needed —
// same principle adImageExtraction.service.js's extractAdCopy already
// proved works well for price/promotion/adHooks). `type` is a free-form
// label the model chooses itself (seeded with examples below) rather than
// a fixed enum, since real ad creative varies in what's worth naming.
const DETECTION_SYSTEM_PROMPT = `You are an expert Product Photo Analyst. Inspect this product marketing photo and identify every distinct, individually reusable element in it.

For each element, classify it:
- "kind": "visual" if it should become its own cropped image asset (a distinct product, the human model, a promotion badge/sticker graphic, a logo, or any other visual worth isolating on its own), or "text" if it's just marketing copy with no standalone visual identity of its own (a headline, subheadline, promo phrase, or similar).
- "type": a short English category label. Use one of these when it genuinely fits: product, human_model, promo_badge, logo, headline_copy, subheadline_copy, promo_phrase — but choose a different label yourself if something present doesn't fit any of these.
- "label": a short Korean label for this element.
- For "kind": "visual" elements, a "description" of what it looks like and where it is in the photo (this feeds a later step that isolates it).
- For "kind": "text" elements, the exact "text" as it verbatim appears in the photo.

Rules:
- Ignore multiple instances/angles of the SAME product — list each genuinely distinct product type once.
- Ignore any text printed on a product's own packaging — that's part of the product's own visual, not a separate text element.
- Only include a human_model entity if a person is visibly holding, using, or posing with the product(s).
- Transcribe "text" values exactly as shown — do not paraphrase, translate, omit decorative symbols/emoji, or invent wording that isn't actually in the photo.
- If nothing else besides the product itself is present, that's fine — just return the product entity.

Output ONLY valid JSON:
{
  "entities": [
    { "kind": "visual"|"text", "type": "...", "label": "...", "description": "... (visual only)", "text": "... (text only)" }
  ]
}`

const DETECTION_USER_PROMPT = 'Analyze the provided product photo according to the system instructions. ' +
  'Output ONLY a valid JSON object.'

// Pure and exported so the shape-normalization logic (missing/invalid
// kind, malformed entries per kind, the zero-entities fallback) is
// unit-testable against fake JSON text without any real OpenAI call.
export function parseDetectionResult(rawText) {
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch (err) {
    throw new Error(`Entity detection returned invalid JSON: ${err.message}`)
  }

  const entities = (Array.isArray(parsed.entities) ? parsed.entities : [])
    .map((e) => {
      if (!e || typeof e !== 'object') return null
      // Missing/invalid kind defaults to 'visual' — the safer assumption
      // (every entity was visual before Part T), and avoids silently
      // discarding something the model deemed worth extracting just
      // because it didn't label kind correctly.
      const kind = VALID_KINDS.has(e.kind) ? e.kind : 'visual'
      const type = typeof e.type === 'string' && e.type.trim() ? e.type.trim() : 'product'
      const label = typeof e.label === 'string' && e.label.trim() ? e.label.trim() : '항목'

      if (kind === 'text') {
        if (typeof e.text !== 'string' || !e.text.trim()) return null
        return { kind, type, label, text: e.text.trim() }
      }
      if (typeof e.description !== 'string' || !e.description.trim()) return null
      return { kind, type, label, description: e.description.trim() }
    })
    .filter(Boolean)

  // A photo the model failed to break into distinct entities at all is
  // still a real single-product photo in practice (this was every photo's
  // assumption before Part M) — fall back to one generic visual product
  // entity rather than extracting nothing.
  if (entities.length === 0) {
    entities.push({ kind: 'visual', type: 'product', label: '제품', description: 'the main product shown in this photo' })
  }

  return { entities }
}

// Part T: generalizes the old product-only isolation prompt to any
// "visual"-kind entity (product, human_model, promo_badge, logo, or any
// other free-form visual type detection chose) — same isolation mechanic
// and preservation constraints, just parameterized by the entity's own
// type/label/description instead of hardcoding "product" wording. A
// single-visual-entity photo keeps the exact original unscoped wording
// (so a genuinely single-product photo's prompt, and cost/behavior, stays
// identical to before this part). Exported for direct unit testing of the
// scoping/wording logic.
export function buildProductIsolationPrompt(entity, totalVisualEntities) {
  const subject = entity.type === 'human_model'
    ? 'the human model (person)'
    : entity.type === 'product'
      ? 'the product'
      : `the ${entity.label || entity.type}`

  const target = totalVisualEntities > 1
    ? `Isolate ONLY ${subject} described as: ${entity.description}. `
    : `Isolate ONLY ${subject} from this photo. `
  return target +
    `Remove the background, any other products, hands, people, staging props, and marketing text overlays not part of this element. ` +
    `Output it centered on a plain solid white background, preserving its true shape, colors, ` +
    `proportions, and any text or label printed on it exactly as it appears. Do not ` +
    `crop off any part of it, and do not add new shadows, reflections, or decorative elements.`
}

function findBrand(brandKey) {
  return config.brands.find((b) => b.key === brandKey)
}

// Part T: detection labels the human model 'human_model' internally (a
// clearer prompt label than the pre-existing terse 'model'), but every
// already-extracted product's real sheet data, plus frontend badge/style
// logic and generation.service.js's style-reference selection, has always
// keyed the literal string 'model' for this exact concept. Normalizing
// here — rather than changing 'human_model' into the stored contract —
// keeps every existing real row and every downstream `type === 'model'`
// check working unchanged for freshly-extracted products too. Every other
// free-form type (there was no pre-existing contract for those before this
// part) is stored exactly as detection labeled it.
function storedTypeFor(entity) {
  return entity.type === 'human_model' ? 'model' : entity.type
}

// Drive/OS-safe filename fragment — a free-form detected type could
// contain spaces or characters a filename shouldn't (unlikely in practice
// given the prompt's own English-label instruction, but never trust model
// output verbatim in a filename).
function sanitizeForFilename(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-')
}

async function detectEntities(imageBase64, mimeType) {
  const response = await getClient().responses.create({
    model: DETECTION_MODEL,
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
// 1 detection call + 1 isolation call per detected VISUAL entity (product(s),
// an optional human model, and now any other visual worth its own asset —
// promo badges, logos, etc.) instead of always exactly 1 call. Detected
// TEXT entities (Part T: headlines, subheadlines, promo phrases) cost
// nothing extra — they're transcribed directly in the one detection call,
// same principle adImageExtraction.service.js's extractAdCopy already
// proved. Real money per call: a typical single-product, no-model, no-
// extra-visual photo still costs exactly 2 calls, same as before this
// part. Invoked on demand from 상품관리, not a background job.
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

  const visualEntities = detection.entities.filter((e) => e.kind === 'visual')
  let visualIndex = 0

  for (const entity of detection.entities) {
    // Part T: 'text' entities cost nothing extra — the exact string was
    // already transcribed in the one detection call above. No imageUrl,
    // by design (ProductReferenceGallery.jsx renders these as a text card
    // instead of a thumbnail).
    if (entity.kind === 'text') {
      references.push({ type: entity.type, label: entity.label, text: entity.text, extractedAt })
      continue
    }

    const prompt = buildProductIsolationPrompt(entity, visualEntities.length)
    const resultBase64 = await isolateEntity(base64, mimeType, prompt)
    const link = await uploadImage(resultBase64, {
      rootFolderName: 'AdGen Product References',
      subfolder: brandKey,
      fileName: `${productId}-${sanitizeForFilename(entity.type)}-${visualIndex}.png`,
    })
    references.push({ type: storedTypeFor(entity), label: entity.label, imageUrl: link, extractedAt })
    visualIndex += 1
  }

  await updateProductField(String(productId), 'Extracted References JSON', JSON.stringify(references))

  return { references }
}
