import OpenAI from 'openai'
import { config } from '../../config/index.js'
import { createCachedClient } from '../cachedApiClient.js'

// AA-6: maxRetries retries connection errors + 408/409/429/5xx with the
// SDK's own built-in exponential backoff — same convention as every other
// OpenAI-backed service in this codebase.
const getClient = createCachedClient(() => config.openaiApiKey, (apiKey) => new OpenAI({ apiKey, maxRetries: 2 }))

const MODEL = 'gpt-5.5'

// Part EE: nothing in this codebase produces bounding boxes today —
// visionAnalysis.service.js's analyzeReferenceAd locates elements with a
// free-text `location` description, and productImageExtraction.service.js
// isolates entities via a generative re-render, not a pixel crop from known
// coordinates. This is a new, dedicated call whose whole purpose is a
// normalized-fraction bounding box per segment, so 생성 AI's chat can drive
// an on-image highlight overlay as each dialog is asked.
// The 'background' segment's own box is a nominal placeholder, not something
// the frontend ever renders directly — AIImagePane.jsx derives the "what is
// background" highlight by dimming every OTHER (text/product/model)
// segment's box and leaving the rest of the image at full brightness, which
// communicates "background = whatever isn't foreground" far more clearly
// than trying to box-highlight one sample patch of it ever could. So the
// prompt below just asks for the full-image box for background, rather than
// spending model effort hunting for "a representative background area" that
// nothing downstream actually uses.
const SYSTEM_PROMPT = `You are an expert Ad Layout Analyst. Inspect this advertisement image and break it into distinct visual segments, so each can be individually highlighted and discussed.

Identify:
1. Exactly ONE "background" segment — the region of the image that is background/backdrop, not overlaid text, not the product, not a human model. Its bounding box should always be the full image ({"x":0,"y":0,"width":1,"height":1}) — the actual background area is derived downstream from where the OTHER segments are, not from this box.
2. Every overlaid marketing text element (banners, discount badges, headlines, speech bubbles, floating text) — same criteria as identifying overlaid copy: ignore any text printed ON the product packaging itself.
3. Every instance of the advertised product.
4. A human model, if one is visibly holding, using, or posing with the product. Omit this entirely if no person appears in the image.

For each segment, output a bounding box as fractions of the image's full width/height (0.0 to 1.0, top-left origin) — approximate is fine, this drives a highlight overlay, not a precision crop.

Output ONLY valid JSON matching this exact structure:
{
  "segments": [
    {
      "type": "background" | "text" | "product" | "model",
      "label": "short Korean label for this segment, e.g. '배경', '가격 배지: 최대 71% 할인', '제품', '모델'",
      "text": "exact transcribed text — ONLY present when type is \\"text\\"",
      "box": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 }
    }
  ]
}`

const USER_PROMPT = 'Analyze the provided advertisement image according to the system instructions. ' +
  'Output ONLY a valid JSON object.'

const ALLOWED_TYPES = new Set(['background', 'text', 'product', 'model'])

function clamp01(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.min(1, Math.max(0, num))
}

// Pure and exported so the shape-normalization logic (unknown types, missing
// label/box, out-of-range coordinates, the zero-segments fallback) is
// unit-testable against fake JSON text without any real OpenAI call — same
// pattern as productImageExtraction.service.js's parseDetectionResult.
// Assigns each surviving segment a stable id (`${type}-${rawIndex}`, indexed
// against the raw model output, not the post-filter array) since nothing
// upstream provides one and the chat/highlight-overlay state needs something
// stable to key off of.
export function parseSegmentationResult(rawText) {
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch (err) {
    throw new Error(`Ad segmentation returned invalid JSON: ${err.message}`)
  }

  const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : []
  const segments = rawSegments
    .map((s, index) => {
      if (!s || typeof s !== 'object') return null
      if (!ALLOWED_TYPES.has(s.type)) return null
      if (typeof s.label !== 'string' || !s.label.trim()) return null
      if (!s.box || typeof s.box !== 'object') return null

      const box = {
        x: clamp01(s.box.x),
        y: clamp01(s.box.y),
        width: clamp01(s.box.width),
        height: clamp01(s.box.height),
      }
      const segment = { id: `${s.type}-${index}`, type: s.type, label: s.label.trim(), box }
      // "text" is additive, present only for type: 'text' segments — a
      // background/product/model segment has no transcribable text of its
      // own worth carrying.
      if (s.type === 'text' && typeof s.text === 'string' && s.text.trim()) {
        segment.text = s.text.trim()
      }
      return segment
    })
    .filter(Boolean)

  // Never return an empty array — a photo the model failed to segment at
  // all still has SOME background, so this falls back to one full-image
  // background segment rather than leaving the chat with nothing to ask
  // about at all.
  if (segments.length === 0) {
    segments.push({ id: 'background-0', type: 'background', label: '배경', box: { x: 0, y: 0, width: 1, height: 1 } })
  }

  return { segments }
}

// imageBase64: raw base64 (no data: prefix), same convention as
// visionAnalysis.service.js's analyzeReferenceAd. getClientFn is injected
// (defaulting to the real getClient) purely so this is unit-testable
// without a real OpenAI call — same DI convention used elsewhere in this
// codebase.
export async function segmentReferenceAd(imageBase64, { getClientFn = getClient } = {}) {
  const response = await getClientFn().responses.create({
    model: MODEL,
    text: { format: { type: 'json_object' } },
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: USER_PROMPT },
          { type: 'input_image', image_url: `data:image/jpeg;base64,${imageBase64}` },
        ],
      },
    ],
  })

  return parseSegmentationResult(response.output_text)
}
