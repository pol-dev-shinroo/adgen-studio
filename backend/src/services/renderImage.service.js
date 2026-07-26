import OpenAI from 'openai'
import { config } from '../config/index.js'
import { extractGeneratedImageBase64 } from '../utils/gptImage.js'

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

// gpt-image-2 accepts any size meeting its own constraints (max edge
// <=3840px, both edges multiples of 16px, aspect ratio <=3:1, 655,360-
// 8,294,400 total pixels) rather than a fixed enum — these three are exact
// matches for the app's three format options.
const FORMAT_SIZE = {
  '1:1 피드': '1024x1024',
  '4:5 피드': '1024x1280',
  '9:16 스토리': '864x1536',
}
const DEFAULT_SIZE = '1024x1024'

// Qualitative bucketing of the 0-100 styleIntensity slider — exact wording/
// thresholds are this service's own judgment call, since neither n8n
// workflow had a style-intensity concept (both were single fixed-recipe
// transforms). Low = as-close-to-original as possible; high = the model can
// reinterpret more freely as long as the actual replacements still land.
function styleInstructionFor(styleIntensity) {
  if (styleIntensity <= 33) {
    return 'Style intensity: LOW. Keep the original layout, background, composition, and color grading as close to the original reference image as possible — apply ONLY the text and product replacements described below, nothing else.'
  }
  if (styleIntensity <= 66) {
    return 'Style intensity: MEDIUM. Keep the overall layout and background recognizable and faithful to the original, but minor stylistic refinements (lighting, color grading) are acceptable.'
  }
  return 'Style intensity: HIGH. You may reinterpret the lighting, color grading, and background styling more freely, as long as the overall layout structure and the text/product replacements described below are still clearly followed.'
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
function productSwapInstructionFor(productInstances) {
  const instanceList = productInstances.length
    ? productInstances.map((p, i) => `${i + 1}. ${p.location} — ${p.description}`).join('\n')
    : 'The single instance of the advertised product visible in the scene.'

  return 'The first image is the original reference ad. The second image is our own product\'s reference photo. Seamlessly replace EVERY instance of the competitor\'s product shown in the first image with OUR product from the second image, at these instances:\n' +
    `${instanceList}\n\n` +
    'Ensure each replaced instance perfectly inherits its own perspective, lighting, hand grip placement, finger occlusion, and relative size from the object it\'s replacing, so every swap looks completely authentic. Do not add or remove any product instances beyond what is listed.'
}

// referenceImageBase64/productImageBase64: raw base64 (no data: prefix).
// productImageBase64 MUST come from the product's extracted reference image
// (Part B), never the raw marketing photo — enforced by generation.service.js
// rejecting the job before this is ever reached if no extraction exists.
// productInstances/replacements: visionAnalysis/copywriting output arrays.
// Returns raw base64 PNG (no prefix).
export async function renderFinalImage({
  referenceImageBase64, productImageBase64, productInstances, replacements,
  format, styleIntensity, instructions,
}) {
  const parts = [
    replacementInstructionFor(replacements),
    productSwapInstructionFor(productInstances),
    styleInstructionFor(styleIntensity),
  ]
  if (instructions?.trim()) parts.push(instructions.trim())

  const response = await getClient().responses.create({
    model: MODEL,
    tools: [{ type: 'image_generation', action: 'edit', size: FORMAT_SIZE[format] || DEFAULT_SIZE }],
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_image', image_url: `data:image/jpeg;base64,${referenceImageBase64}` },
          { type: 'input_image', image_url: `data:image/png;base64,${productImageBase64}` },
          { type: 'input_text', text: parts.join('\n\n') },
        ],
      },
    ],
  })

  return extractGeneratedImageBase64(response)
}
