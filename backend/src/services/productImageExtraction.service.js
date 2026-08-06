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

// Part V: reverses Part T's visual/text cost split entirely, per direct
// client instruction — a phrase's exact font/color/size/badge treatment is
// itself part of what's worth reusing, not just its words, so every
// detected entity (including phrases) now goes through the same
// isolation-call-and-upload path product/human_model already used. Real
// cost consequence, stated plainly: a rich photo with a headline,
// subheadline, and promo phrase now costs 3 MORE real image_generation
// calls than it did under Part T's design. The "text" field survives
// (additively) for entities that are inherently textual, since the exact
// transcription is still useful on its own for Step 3's 후킹 카피 chips,
// and it costs nothing extra — detection already reads the whole photo.
const DETECTION_SYSTEM_PROMPT = `You are an expert Product Photo Analyst. Inspect this product marketing photo and identify every distinct, individually reusable element in it — every one of these will be isolated as its own cropped image asset, so be thorough.

For each element:
- "type": a short English category label. Use one of these when it genuinely fits: product, human_model, promo_badge, authority_badge, logo, headline_copy, subheadline_copy, promo_phrase — but choose a different label yourself if something present doesn't fit any of these.
  - "promo_badge" is specifically a price/discount callout graphic (e.g. "Up to 46%").
  - "authority_badge" is a credential/endorsement graphic instead — an expert's photo+title (e.g. a "피부과 의사" stamp), a certification mark, or an "전문가 추천" stamp. This is a distinct concept from promo_badge, worth its own type.
- "label": a short Korean label for this element.
- "description": what this element looks like and exactly where it is in the photo — this feeds a later step that isolates it as its own image. For a phrase (headline/subheadline/promo phrase), describe its exact font, color, size, and any badge/highlight graphic around it, not just its wording — the isolated asset needs to look like it does on the ad, not just say the same words in an arbitrary font.
- "text": ONLY when this element is inherently textual (a headline, subheadline, or promo phrase) — the exact text as it verbatim appears in the photo. Omit this field for a product, human model, badge, or logo, which has no transcribable text of its own worth capturing.

Rules:
- Ignore multiple instances/angles of the SAME product — list each genuinely distinct product type once.
- Ignore any text printed on a product's own packaging — that's part of the product's own visual, not a separate element.
- Only include a human_model entity if a person is visibly holding, using, or posing with the product(s).
- When a "text" field is present, transcribe it exactly as shown — do not paraphrase, translate, omit decorative symbols/emoji, or invent wording that isn't actually in the photo.
- If nothing else besides the product itself is present, that's fine — just return the product entity.

Output ONLY valid JSON:
{
  "entities": [
    { "type": "...", "label": "...", "description": "...", "text": "... (only for a headline/subheadline/promo phrase)" }
  ]
}`

const DETECTION_USER_PROMPT = 'Analyze the provided product photo according to the system instructions. ' +
  'Output ONLY a valid JSON object.'

// Pure and exported so the shape-normalization logic (malformed entries,
// the optional text field, the zero-entities fallback) is unit-testable
// against fake JSON text without any real OpenAI call.
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
      // Every entity is isolated as its own image now (Part V), so a
      // description is required unconditionally — an entity without one
      // can't be isolated at all and is dropped.
      if (typeof e.description !== 'string' || !e.description.trim()) return null
      const type = typeof e.type === 'string' && e.type.trim() ? e.type.trim() : 'product'
      const label = typeof e.label === 'string' && e.label.trim() ? e.label.trim() : '항목'

      const entity = { type, label, description: e.description.trim() }
      // "text" is additive, present only for inherently textual entities
      // (headline/subheadline/promo phrase) — still transcribed for free
      // in this same detection call, for Step 3's 후킹 카피 chips.
      if (typeof e.text === 'string' && e.text.trim()) entity.text = e.text.trim()
      return entity
    })
    .filter(Boolean)

  // A photo the model failed to break into distinct entities at all is
  // still a real single-product photo in practice (this was every photo's
  // assumption before Part M) — fall back to one generic product entity
  // rather than extracting nothing.
  if (entities.length === 0) {
    entities.push({ type: 'product', label: '제품', description: 'the main product shown in this photo' })
  }

  return { entities }
}

// Part T: generalizes the old product-only isolation prompt to any
// detected entity (product, human_model, promo_badge, authority_badge,
// logo, a phrase, or any other free-form type detection chose) — same
// isolation mechanic and preservation constraints, just parameterized by
// the entity's own type/label/description instead of hardcoding "product"
// wording. A single-entity photo keeps the exact original unscoped wording
// (so a genuinely single-product photo's prompt, and cost/behavior, stays
// identical to before Part M). Exported for direct unit testing of the
// scoping/wording logic.
export function buildProductIsolationPrompt(entity, totalEntities) {
  const subject = entity.type === 'human_model'
    ? 'the human model (person)'
    : entity.type === 'product'
      ? 'the product'
      : `the ${entity.label || entity.type}`

  const target = totalEntities > 1
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
// 1 detection call + 1 isolation call per detected entity (product(s), an
// optional human model, badges, logos, and — as of Part V — phrases too:
// headline/subheadline/promo copy is isolated as its own image asset like
// everything else, not transcribed-for-free the way Part T had it, per
// direct client instruction that a phrase's actual font/color/badge
// treatment is worth reusing, not just its words. Real cost consequence:
// a rich photo with a headline, subheadline, and promo phrase now costs 3
// MORE real image_generation calls than it did under Part T. A typical
// single-product, no-model, no-extra-element photo still costs exactly 2
// calls (1 detection + 1 isolation), same as before Part M. Invoked on
// demand from 상품관리, not a background job.
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

  const totalEntities = detection.entities.length

  for (let i = 0; i < detection.entities.length; i += 1) {
    const entity = detection.entities[i]
    const prompt = buildProductIsolationPrompt(entity, totalEntities)
    const resultBase64 = await isolateEntity(base64, mimeType, prompt)
    const link = await uploadImage(resultBase64, {
      rootFolderName: 'AdGen Product References',
      subfolder: brandKey,
      fileName: `${productId}-${sanitizeForFilename(entity.type)}-${i}.png`,
    })
    const reference = { type: storedTypeFor(entity), label: entity.label, imageUrl: link, extractedAt }
    // Part V: additive — a phrase entity still carries its exact
    // transcription alongside its new imageUrl, since Step 3's 후킹 카피
    // chips reuse the plain text independently of the image.
    if (entity.text) reference.text = entity.text
    references.push(reference)
  }

  await updateProductField(String(productId), 'Extracted References JSON', JSON.stringify(references))

  return { references }
}
