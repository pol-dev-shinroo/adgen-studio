import OpenAI from 'openai'
import { config } from '../../config/index.js'
import { extractGeneratedImageBase64 } from '../../utils/gptImage.js'
import { sizeForFormat } from '../../utils/formatSize.js'
import { createCachedClient } from '../cachedApiClient.js'

// AA-6: maxRetries retries connection errors + 408/409/429/5xx with the
// SDK's own built-in exponential backoff (never other 4xx, e.g.
// content-policy rejections) — simpler than wrapping every real call site
// by hand, and applies to every call this client makes automatically.
const getClient = createCachedClient(() => config.openaiApiKey, (apiKey) => new OpenAI({ apiKey, maxRetries: 2 }))

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
//
// Part DD: styleReferenceType is the extracted-reference `type` the third
// image was actually sourced from ('model', 'badge', etc. — see
// productImageExtraction.service.js's storedTypeFor). Pushing the slider
// all the way to its true maximum (100, not just "in the 67-99 HIGH range")
// with a real model-type reference selected means something qualitatively
// different from HIGH's "lean toward our own styling": a full face
// replacement. Checked as its own tier, before the LOW/MEDIUM/HIGH chain,
// since it's a more specific case of "high" — a badge/logo/text reference
// at max intensity (or a model reference below max intensity) still falls
// through to the existing HIGH wording unchanged.
function styleInstructionFor(styleIntensity, hasStyleReference, styleReferenceType) {
  if (styleIntensity === 100 && hasStyleReference && styleReferenceType === 'model') {
    return 'Style intensity: MAXIMUM. A third image is our own brand\'s extracted model reference photo. ' +
      'Completely replace the face of the human model shown in the first image (the original competitor ad) with ' +
      'the face shown in the third image — a full face swap, not a styling influence. Keep the original ad\'s ' +
      'body pose, hand position, clothing, framing, lighting, and background exactly as they are; change ONLY the ' +
      'face/head to match the third image\'s model. If the third image shows the face at a different angle than ' +
      'the original pose, adapt it naturally to match the original\'s head angle and lighting rather than pasting ' +
      'it in unchanged.'
  }
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
//
// Part DD: styleReferenceType distinguishes a model-type third image (a
// face-swap source, per styleInstructionFor's MAXIMUM tier) from every
// other kind (badge/logo/text — a generic styling influence) — this
// sentence's own wording needs to say so explicitly, or the model has no
// way to know the second image (our product) and third image (our model's
// face) play completely different roles despite both being "our own"
// material.
function productSwapInstructionFor(productInstances, hasStyleReference, styleReferenceType) {
  const instanceList = productInstances.length
    ? productInstances.map((p, i) => `${i + 1}. ${p.location} — ${p.description}`).join('\n')
    : 'The single instance of the advertised product visible in the scene.'

  let framing = 'The first image is the original reference ad. The second image is our own product\'s reference photo.'
  if (hasStyleReference) {
    framing += styleReferenceType === 'model'
      ? ' A third image is also provided — our own brand\'s model reference photo, used for a face swap (see the ' +
        'separate instruction below), NOT another product image. Do not confuse the second image (product) with ' +
        'the third image (face reference).'
      : ' A third image is also provided — see the separate instruction below for its role.'
  }

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
// instruction text, unchanged framing sentence. styleReferenceType (Part
// DD): the extracted-reference `type` styleReferenceImageBase64 was sourced
// from ('model', 'badge', ...) — only meaningful when a style reference is
// actually present; see styleInstructionFor's MAXIMUM tier.
//
// getClientFn is injected (defaulting to the real getClient) purely so this
// can be unit-tested without a real OpenAI call — same DI convention as
// sheets.service.js's getClientFn.
//
// Returns raw base64 PNG (no prefix).
export async function renderFinalImage({
  referenceImageBase64, productImageBase64, styleReferenceImageBase64, styleReferenceType, productInstances,
  replacements, format, styleIntensity, instructions,
}, { getClientFn = getClient } = {}) {
  const hasStyleReference = !!styleReferenceImageBase64

  const parts = [
    replacementInstructionFor(replacements),
    productSwapInstructionFor(productInstances, hasStyleReference, styleReferenceType),
    styleInstructionFor(styleIntensity, hasStyleReference, styleReferenceType),
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
