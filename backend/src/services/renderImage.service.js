import OpenAI from 'openai'
import { config } from '../config/index.js'
import { extractGeneratedImageBase64 } from '../utils/gptImage.js'
import { sizeForFormat } from '../utils/formatSize.js'

let client = null
function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey })
  }
  return client
}

// gpt-5.5 is the top-level Responses API model, not "gpt-image-2" — the
// hosted image_generation tool always renders through OpenAI's current
// flagship image model (gpt-image-2) regardless of which mainline model
// orchestrates the call, and gpt-5.5 is the one confirmed (via a real
// successful call in Part B) to actually be eligible to drive that tool on
// this account. gpt-4o-mini and gpt-4.1 both hit an identical 403.
const MODEL = 'gpt-5.5'

// Part U-2: redefines what this 0-100 slider actually controls. It used to
// be a pure artistic-license dial (low = stay close to the original's
// composition/lighting, high = reinterpret more freely) with no connection
// to WHOSE creative material the result actually leans on. Per the client
// directly, it's really a dial between two sources of creative material:
// the competitor reference ad's own original treatment vs our OWN reference
// material — a selected style-reference image (Part Q/T: a model shot, a
// promo-badge crop, etc.), when one's actually selected. Low minimizes our
// own material's influence (everything stays as the competitor's original
// except the mandatory product swap and whatever facts must factually
// differ); high actively prefers our own material where it conflicts with
// the original. See copywriting.service.js's own tier function for the
// copy side of this same axis.
//
// Merged with the old separate styleReferenceInstructionFor (Part Q) —
// the style-reference image's influence is now genuinely PART of this same
// axis (how much it should win, not just whether it's present at all), not
// an independent concern bolted on beside it. hasStyleReference: whether a
// third input_image is actually present this call — HIGH's wording
// deliberately still falls back to the pre-Part-U freer-reinterpretation
// framing when it's absent, since there's nothing of "ours" to lean into
// beyond the mandatory swap, and referencing a third image that doesn't
// exist would confuse the model.
function styleInstructionFor(styleIntensity, hasStyleReference) {
  if (styleIntensity <= 33) {
    const base = 'Style intensity: LOW. Keep the layout, background, composition, color grading, and any depicted ' +
      'human model as close to the original reference ad as possible — apply ONLY the mandatory product swap and ' +
      'whatever specific facts must factually differ (e.g. price, promotion values), nothing else.'
    if (!hasStyleReference) return base
    return base + ' A third image is also provided as our own brand\'s style reference, but at this intensity ' +
      'give it minimal to no influence — the competitor ad\'s own original treatment should win everywhere ' +
      'except the mandatory product swap and the facts that must differ.'
  }
  if (styleIntensity <= 66) {
    const base = 'Style intensity: MEDIUM. Keep the overall layout and background recognizable and faithful to ' +
      'the original, but minor stylistic refinements (lighting, color grading) are acceptable.'
    if (!hasStyleReference) return base
    return base + ' A third image, when provided, is a reference sheet of our own brand\'s past ad styling — ' +
      'use it as supplementary visual guidance for our brand\'s product photography style, color/badge ' +
      'treatment, and (if shown) model styling. Do not copy its layout or insert elements from it that don\'t ' +
      'belong in this specific ad.'
  }
  if (!hasStyleReference) {
    return 'Style intensity: HIGH. You may reinterpret the lighting, color grading, and background styling more ' +
      'freely, as long as the overall layout structure and the text/product replacements described below are ' +
      'still clearly followed.'
  }
  return 'Style intensity: HIGH. Actively prefer our own reference material where it conflicts with the ' +
    'competitor ad\'s original treatment. A third image is our own brand\'s style reference — treat it as a ' +
    'strong influence for whatever it depicts (model styling/pose, badge/sticker design). Lighting, color ' +
    'grading, and background are free to shift toward our own brand\'s look, informed by this reference.'
}

// Text-replacement instruction, carrying over "3. 최종 이미지.json"'s GPT-5.5
// Renderer node's exact preservation language verbatim.
function replacementInstructionFor(replacements) {
  if (!replacements.length) {
    return 'Do not change any text in the image — preserve every text element exactly as it appears in the original.'
  }
  return 'Analyze this advertisement image and apply the following text replacements exactly. For each item, replace the \'original_text\' with the \'new_text\' at the specified \'location\'. You MUST strictly preserve the exact original font style, size, color, angle, and background. Do NOT change, remove, or modify any other text, background elements, or product images.\n\n' +
    `Replacements: ${JSON.stringify(replacements)}`
}

// Product-swap instruction, carrying over "1. 제품 이미지 교체"'s instruction
// in spirit (that workflow hardcoded one competitor product name and two
// fixed hand descriptions for one specific ad; this generalizes it using
// whatever product_instances visionAnalysis.service.js actually found for
// THIS reference ad).
//
// hasStyleReference (Part Q): when true, a third input_image is present in
// the actual request — the two-image framing sentence here is the one
// place that names/counts the images, so it needs to acknowledge the third
// one exists (its actual role — now how much it should influence the
// result, per Part U-2 — is spelled out separately by styleInstructionFor
// below). When false, this sentence is byte-for-byte the original
// two-image wording.
function productSwapInstructionFor(productInstances, hasStyleReference) {
  const instanceList = productInstances.length
    ? productInstances.map((p, i) => `${i + 1}. ${p.location} — ${p.description}`).join('\n')
    : 'The single instance of the advertised product visible in the scene.'

  const framing = hasStyleReference
    ? 'The first image is the original reference ad. The second image is our own product\'s reference photo. A third image is also provided — see the separate instruction below for its role.'
    : 'The first image is the original reference ad. The second image is our own product\'s reference photo.'

  return `${framing} Seamlessly replace EVERY instance of the competitor's product shown in the first image with OUR product from the second image, at these instances:\n` +
    `${instanceList}\n\n` +
    'Ensure each replaced instance perfectly inherits its own perspective, lighting, hand grip placement, finger occlusion, and relative size from the object it\'s replacing, so every swap looks completely authentic. Do not add or remove any product instances beyond what is listed.'
}

// referenceImageBase64/productImageBase64: raw base64 (no data: prefix).
// productImageBase64 MUST come from the product's extracted reference image
// (Part B), never the raw marketing photo — enforced by generation.service.js
// rejecting the job before this is ever reached if no extraction exists.
// productInstances/replacements: visionAnalysis/copywriting output arrays.
//
// styleReferenceImageBase64 (Part Q): optional, raw base64 (no data: prefix)
// of one of our own brand's composed reference sheets (Part N/O) — a third,
// supplementary input_image, never a second literal product-swap source.
// Omitted entirely (undefined/null) reproduces the exact pre-Part-Q
// two-image request byte-for-byte — no third content entry, no extra
// instruction text, unchanged framing sentence.
//
// getClientFn is injected (defaulting to the real getClient) purely so this
// can be unit-tested without a real OpenAI call — same DI convention as
// sheets.service.js's getClientFn.
//
// Returns raw base64 PNG (no prefix).
export async function renderFinalImage({
  referenceImageBase64, productImageBase64, styleReferenceImageBase64, productInstances, replacements,
  format, styleIntensity, instructions,
}, { getClientFn = getClient } = {}) {
  const hasStyleReference = !!styleReferenceImageBase64

  const parts = [
    replacementInstructionFor(replacements),
    productSwapInstructionFor(productInstances, hasStyleReference),
    styleInstructionFor(styleIntensity, hasStyleReference),
  ]
  if (instructions?.trim()) parts.push(instructions.trim())

  const content = [
    { type: 'input_image', image_url: `data:image/jpeg;base64,${referenceImageBase64}` },
    { type: 'input_image', image_url: `data:image/png;base64,${productImageBase64}` },
  ]
  if (hasStyleReference) {
    content.push({ type: 'input_image', image_url: `data:image/png;base64,${styleReferenceImageBase64}` })
  }
  content.push({ type: 'input_text', text: parts.join('\n\n') })

  const response = await getClientFn().responses.create({
    model: MODEL,
    tools: [{ type: 'image_generation', action: 'edit', size: sizeForFormat(format) }],
    input: [{ role: 'user', content }],
  })

  return extractGeneratedImageBase64(response)
}
