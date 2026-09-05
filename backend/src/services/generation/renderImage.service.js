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

// Part EE: extracted so renderConversationalImage's own model-face material
// image (§8 of that prompt) can reuse the exact same face-swap mechanics
// styleInstructionFor's MAXIMUM tier already uses below — the detail of
// HOW to do a full face swap doesn't change based on which screen/slider
// drove the decision to do one. Phrased in terms of "the model-face
// reference image" rather than "the third image" specifically, since
// renderConversationalImage's material images aren't always exactly the
// third one the way this old three-image scheme's style reference always is.
export const FACE_REPLACEMENT_DETAIL = 'Completely replace the face of the human model shown in the first image ' +
  '(the original competitor ad) with the face shown in the model-face reference image — a full face swap, not a ' +
  'styling influence. Keep the original ad\'s body pose, hand position, clothing, framing, lighting, and ' +
  'background exactly as they are; change ONLY the face/head to match the reference model. If the reference ' +
  'image shows the face at a different angle than the original pose, adapt it naturally to match the ' +
  'original\'s head angle and lighting rather than pasting it in unchanged.'

// Part U-2: redefines what the old 0-100 slider used to control alone. It
// used to be a pure artistic-license dial (low = stay close to the
// original's composition/lighting, high = reinterpret more freely) with no
// connection to WHOSE creative material the result actually leans on. Per
// the client directly, it's really a dial between two sources of creative
// material: the competitor reference ad's own original treatment vs our OWN
// reference material — a selected style-reference image (Part Q/T: a model
// shot, a promo-badge crop, etc.), when one's actually selected. See
// copywriting.service.js's own tier function for the copy side of this same
// axis.
//
// Part LL: per direct client feedback (a live walkthrough), this and the
// copy-side axis were actually 3 logically separate creative decisions
// silently forced together by one shared number — split into 2 independent
// checkbox-driven booleans here (a 3rd, verbatimCopy, belongs entirely to
// copywriting.service.js's own tier function and never reaches this one):
//
// - freeRestyle: whether image styling (lighting/color grading/background)
//   can be reinterpreted at all — false keeps it as close to the original
//   as possible (minor refinements still tolerated, folding in the old
//   MEDIUM tier's "minor stylistic refinements... acceptable" wording so
//   unchecking doesn't read as absolute-zero-tolerance), true allows free
//   reinterpretation (the old HIGH-with-no-reference wording).
// - strongReferenceInfluence: how strongly a selected style-reference image
//   should actually influence the result — false folds the old MEDIUM
//   tier's "supplementary guidance" wording into the minimal-influence side
//   (closer in spirit to minimal than to strong), true keeps the old HIGH
//   tier's "strong influence" wording. Entirely inert (no clause emitted at
//   all) whenever hasStyleReference is false — there's nothing to
//   reference an influence strength for.
//
// hasStyleReference: whether a third input_image is actually present this
// call. styleReferenceType (Part DD): the extracted-reference `type` the
// third image was actually sourced from ('model', 'badge', etc.) — a real
// model-type reference with strongReferenceInfluence checked means
// something qualitatively different from "strong influence": a full face
// replacement (MAXIMUM), checked before the freeRestyle/strongReferenceInfluence
// wording chain since it's a more specific case that supersedes it entirely
// — dropped the old `styleIntensity === 100` condition per Part LL, since
// the checkbox itself is now the explicit signal, not a slider-position
// coincidence. A badge/logo/text reference (or strongReferenceInfluence
// left unchecked even with a model reference) still falls through to the
// ordinary freeRestyle/strongReferenceInfluence wording unchanged.
function styleInstructionFor(freeRestyle, strongReferenceInfluence, hasStyleReference, styleReferenceType) {
  if (strongReferenceInfluence && hasStyleReference && styleReferenceType === 'model') {
    return 'Style intensity: MAXIMUM. A third image is our own brand\'s extracted model reference photo. ' +
      FACE_REPLACEMENT_DETAIL
  }

  const base = freeRestyle
    ? 'Style intensity: HIGH. You may reinterpret the lighting, color grading, and background styling more ' +
      'freely, as long as the overall layout structure and the text/product replacements described below are ' +
      'still clearly followed.'
    : 'Style intensity: LOW. Keep the layout, background, composition, color grading, and any depicted human ' +
      'model as close to the original reference ad as possible — apply the mandatory product swap and whatever ' +
      'specific facts must factually differ (e.g. price, promotion values); minor lighting/color refinements ' +
      'are still acceptable beyond that, but nothing more.'

  if (!hasStyleReference) return base

  const refClause = strongReferenceInfluence
    ? ' Actively prefer our own reference material where it conflicts with the competitor ad\'s original ' +
      'treatment. A third image is our own brand\'s style reference — treat it as a strong influence for ' +
      'whatever it depicts (model styling/pose, badge/sticker design).'
    : ' A third image is also provided as our own brand\'s style reference — use it only as light ' +
      'supplementary visual guidance (product photography style, color/badge treatment, and, if shown, model ' +
      'styling) without copying its layout or inserting elements from it that don\'t belong in this specific ad; ' +
      'the competitor ad\'s own original treatment should still win wherever the two conflict.'

  return base + refClause
}

// Text-replacement instruction, carrying over "3. 최종 이미지.json"'s GPT-5.5
// Renderer node's exact preservation language verbatim.
//
// Part EE: exported so renderConversationalImage (생성 AI's own render
// function) can reuse this unchanged — text-replacement mechanics don't
// change based on which screen drove the decision to replace text.
export function replacementInstructionFor(replacements) {
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
//
// Part EE: exported so renderConversationalImage can reuse this unchanged
// too — called with hasStyleReference=false there regardless of how many
// material images are actually present, since that screen builds its own,
// separate multi-image framing sentence (§8) rather than this function's
// old two/three-image-specific one; this call only contributes the reusable
// swap-mechanics paragraph (the instance list + "seamlessly replace..."
// wording), not framing.
export function productSwapInstructionFor(productInstances, hasStyleReference, styleReferenceType) {
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
    'Ensure each replaced instance perfectly inherits its own perspective, lighting, hand grip placement, finger occlusion, and relative size from the object it\'s replacing, so every swap looks completely authentic. Do not add or remove any product instances beyond what is listed.\n\n' +
    // Part MM: without this, "seamlessly replace... inherits perspective/
    // size from the object it's replacing" left the model no other way to
    // satisfy a competitor instance whose physical form (e.g. a torn-open
    // sachet) has no equivalent in our single reference photo (a sealed
    // box/bottle) than to fabricate a same-shaped sachet wearing our
    // branding — a real product that doesn't exist. Caught live by the
    // client in a 비교 modal screenshot.
    'CRITICAL: Our product must be rendered using EXACTLY the packaging shown in the second reference image — ' +
    'the same container type, shape, materials, and design for every single instance. NEVER invent, imagine, ' +
    'or fabricate a packaging form factor for our product that isn\'t depicted in that reference photo (e.g. ' +
    'if the competitor\'s original shows a torn-open sachet/pouch, loose powder, or a pill/tablet outside its ' +
    'container, and our reference photo only shows a sealed box or bottle, do NOT invent a sachet/loose-powder ' +
    'version of our branding). When an instance\'s physical form has no equivalent in our reference photo, ' +
    'render that instance as our actual product exactly as it appears in the reference photo instead — ' +
    'adapting only its perspective, scale, and lighting to fit the scene, even if its resulting shape doesn\'t ' +
    'exactly mirror the silhouette of the thing it\'s replacing.'
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
// Part LL: freeRestyle/strongReferenceInfluence replace the old single
// styleIntensity number as styleInstructionFor's actual branch-selection
// signal (see that function's own comment) — this function no longer reads
// styleIntensity at all; the frontend/run.js may still carry it alongside
// for record-keeping (the generated-row sheet column), but it plays no part
// in what gets rendered.
//
// Returns raw base64 PNG (no prefix).
export async function renderFinalImage({
  referenceImageBase64, productImageBase64, styleReferenceImageBase64, styleReferenceType, productInstances,
  replacements, format, freeRestyle, strongReferenceInfluence, instructions,
}, { getClientFn = getClient } = {}) {
  const hasStyleReference = !!styleReferenceImageBase64

  const parts = [
    replacementInstructionFor(replacements),
    productSwapInstructionFor(productInstances, hasStyleReference, styleReferenceType),
    styleInstructionFor(freeRestyle, strongReferenceInfluence, hasStyleReference, styleReferenceType),
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
    tools: [{ type: 'image_generation', action: 'edit', size: sizeForFormat(format), quality: 'high' }],
    input: [{ role: 'user', content }],
  })

  return extractGeneratedImageBase64(response)
}

const MATERIAL_ROLE_LABEL = {
  'background': 'our background reference — use its setting/backdrop instead of the original ad\'s background.',
  'model-face': 'our model\'s face reference — completely replace the original ad\'s model\'s face with this face, ' +
    'keeping the original pose/lighting/framing (see additional instruction below).',
  'copy-style': 'our brand\'s copy styling reference — match its font/color/badge treatment for the text ' +
    'replacements described below.',
}

// Part EE §8: 생성 AI's own render function, parallel to renderFinalImage
// above (which 생성 스튜디오 keeps using unchanged) — this screen has no
// style-intensity slider, every material image's role is explicit (keep vs.
// replace, per segment) rather than a single blended dial, so
// styleInstructionFor's tiered framing doesn't apply here at all.
//
// materialImages: array of { role: 'background' | 'model-face' | 'copy-style',
// imageBase64 } — 0 to 3 entries, order not significant (each is
// individually labeled in the prompt text by role, not by position).
//
// getClientFn is injected (defaulting to the real getClient) purely so this
// is unit-testable without a real OpenAI call — same DI convention as
// renderFinalImage above.
export async function renderConversationalImage({
  referenceImageBase64, productImageBase64, materialImages, productInstances, replacements, format, instructions,
}, { getClientFn = getClient } = {}) {
  const materials = materialImages || []

  // Dynamic framing sentence — §8: "Image 1 is the original reference ad.
  // Image 2 is our product's reference photo." plus one clause per material
  // image, in order, naming its actual role.
  const framingClauses = materials.map((m, i) => (
    `Image ${i + 3} is ${MATERIAL_ROLE_LABEL[m.role] || 'a supplementary reference image.'}`
  ))
  const framing = [
    'Image 1 is the original reference ad. Image 2 is our product\'s reference photo.',
    ...framingClauses,
  ].join(' ')

  const modelFaceMaterial = materials.find((m) => m.role === 'model-face')

  const parts = [
    framing,
    replacementInstructionFor(replacements),
    // hasStyleReference=false here deliberately — this call only wants the
    // reusable swap-instance-listing mechanics, not that function's own
    // two/three-image framing sentence, since the dynamic framing above
    // already introduces every image in this request. See
    // productSwapInstructionFor's own comment for why this is safe to reuse
    // as-is despite that parameter.
    productSwapInstructionFor(productInstances, false, null),
  ]
  if (modelFaceMaterial) parts.push(FACE_REPLACEMENT_DETAIL)
  if (instructions?.trim()) parts.push(instructions.trim())

  const content = [
    { type: 'input_image', image_url: `data:image/jpeg;base64,${referenceImageBase64}` },
    { type: 'input_image', image_url: `data:image/png;base64,${productImageBase64}` },
    ...materials.map((m) => ({ type: 'input_image', image_url: `data:image/png;base64,${m.imageBase64}` })),
  ]
  content.push({ type: 'input_text', text: parts.join('\n\n') })

  const response = await getClientFn().responses.create({
    model: MODEL,
    tools: [{ type: 'image_generation', action: 'edit', size: sizeForFormat(format), quality: 'high' }],
    input: [{ role: 'user', content }],
  })

  return extractGeneratedImageBase64(response)
}
