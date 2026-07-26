import OpenAI from 'openai'
import { config } from '../config/index.js'

let client = null
function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey })
  }
  return client
}

// gpt-5.5 (not gpt-image-2) is the correct model here — gpt-image-2 is the
// image-generation model the hosted image_generation tool drives, not
// something you call directly for vision/text analysis. See
// renderImage.service.js for why gpt-5.5 (not gpt-4o-mini/gpt-4.1) is also
// the right orchestrator for the actual image_generation tool call.
const MODEL = 'gpt-5.5'

// Vision Analyst system prompt carried over verbatim from the n8n workflow
// "3. 최종 이미지.json"'s "경쟁사 텍스트 추출" node (task 1, the text-overlay
// extraction), extended with task 4 (product_instances) — that workflow
// never needed to locate the product itself, since it only ever handled
// text replacement. Product-instance identification is the concept from
// "1. 제품 이미지 교체"'s "replace EVERY instance" handling, folded in here
// since this app's pipeline does text-swap and product-swap from one
// combined analysis pass rather than two separate n8n workflows.
const SYSTEM_PROMPT = `You are an expert Vision Analyst AI. Your sole objective is to visually inspect the provided competitor's advertisement image and extract objective data for marketing copy replacement.

Tasks:
1. Identify all prominent OVERLAID marketing text elements (banners, speech bubbles, floating text, discount badges).
2. Note the precise visual location, background color/shape, and layout hierarchy of each text element.
3. If adjacent words have significantly different font sizes or styles (e.g., a small '최대' next to a large '71%'), extract them as separate items to preserve layout accuracy.
4. Identify every instance of the product being advertised in the scene. For each instance, note its visual location and describe its appearance, perspective, lighting, and (if held) hand grip/occlusion details. There may be more than one instance at different scales (e.g. one held in a foreground hand, another smaller in the background) — list every instance separately.

Constraints (CRITICAL):
- IGNORE PHYSICAL PRODUCTS FOR TEXT: Absolutely do NOT extract any text printed on the physical products, bottles, pill packaging, or background watermarks into identified_texts. Focus identified_texts ONLY on the overlaid marketing copy.
- EXACT OCR ACCURACY: Transcribe the text exactly as it appears. Pay extremely close attention to single numbers, symbols, and nuanced words (e.g., do not miss the '1' in '1등', do not confuse '지흡기' with '지방기').
- Do NOT rewrite, translate, or evaluate the marketing effectiveness.
- Output ONLY a valid JSON object matching the exact structure below:

{
  "identified_texts": [
    {
      "location": "Top-center within red-bordered box",
      "text": "런닝머신 갖다 버렸어요!!"
    }
  ],
  "product_instances": [
    {
      "location": "Held in the prominent foreground hand",
      "description": "Large white bottle, angled slightly right, bright studio lighting, gripped by thumb and index finger"
    }
  ]
}`

const USER_PROMPT = 'Analyze the provided advertisement image according to the system instructions. Extract all overlaid marketing text precisely, strictly ignoring product labels, and identify every instance of the advertised product. Output ONLY a valid JSON object.'

// imageBase64: raw base64 (no data: prefix), same as downloadImageAsBase64's
// output. Returns { identified_texts: [...], product_instances: [...] } —
// plural on both, matching how the render step needs to handle multiple
// text replacements and multiple product instances in one image.
export async function analyzeReferenceAd(imageBase64) {
  const response = await getClient().responses.create({
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

  let parsed
  try {
    parsed = JSON.parse(response.output_text)
  } catch (err) {
    throw new Error(`Vision analysis returned invalid JSON: ${err.message}`)
  }

  return {
    identified_texts: Array.isArray(parsed.identified_texts) ? parsed.identified_texts : [],
    product_instances: Array.isArray(parsed.product_instances) ? parsed.product_instances : [],
  }
}
