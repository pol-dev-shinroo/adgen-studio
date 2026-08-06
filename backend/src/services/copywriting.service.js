import OpenAI from 'openai'
import { config } from '../config/index.js'

let client = null
function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey })
  }
  return client
}

const MODEL = 'gpt-5.5'

// Lead Copywriter system prompt carried over verbatim from the n8n workflow
// "3. 최종 이미지.json"'s "카피 치환 작성" node.
const SYSTEM_PROMPT = `You are a Lead Copywriter AI specializing in counter-marketing typography.

Tasks:

You will receive the competitor's original text/locations and our brand's data.

Replace ONLY specific hard facts (prices, discounts, USPs, product names) with our brand data.

Strictly preserve the original marketing hook, tone, and non-essential words so the design layout is not ruined.

Constraints (CRITICAL):

The new_text MUST be written in Korean (한국어) and match the tone of the original ad.

Length Matching: The character length of your new_text MUST be nearly identical to the original_text.

Do NOT wrap the JSON in markdown blocks. Output raw JSON only.

Output ONLY a valid JSON object in the exact format below:

{
"replacements": [
{
"location": "Top-right next to bottle",
"original_text": "오늘만 71% 특가",
"new_text": "오늘만 51% 특가"
}
]
}`

// Part U-2: the copy side of styleIntensity's redefined axis (see
// renderImage.service.js's own styleInstructionFor for the full framing —
// this is the same "competitor's original vs our own material" dial,
// applied to copy instead of image). SYSTEM_PROMPT above stays completely
// unmodified — it's carried over verbatim from the n8n workflow and is
// still correct as this tier's own baseline/LOW behavior — this is
// appended into the user prompt instead, same convention
// renderImage.service.js's styleInstructionFor already uses. Exported and
// independently unit-testable the same way.
//
// "Our own material" here specifically means override-sourced phrasing —
// a counterFacts entry that came from Step 3's adCopyOverride (a real
// hand-picked hook/promo/price), not a bare Pinecone-retrieved fact. LOW
// can't tell counterFacts apart by source (and doesn't need to — it's
// SYSTEM_PROMPT's existing unconditional behavior, unchanged), but
// MEDIUM/HIGH's wording is written assuming the caller may have passed
// override-sourced phrasing, since that's the only case where "use it
// close to verbatim" is even meaningful — a bare Pinecone fact has no
// particular wording of its own worth preserving verbatim in the first
// place.
export function styleIntensityInstructionFor(styleIntensity) {
  if (styleIntensity <= 33) {
    return 'Style intensity: LOW. Strictly preserve the original hook, tone, and wording — replace only the ' +
      'specific facts that must differ. Length Matching: new_text length must be nearly identical to ' +
      'original_text, exactly as required above.'
  }
  if (styleIntensity <= 66) {
    return 'Style intensity: MEDIUM. Preserve the original tone and hook where reasonable, but when the brand ' +
      'facts include real selected phrasing (not just a bare fact), let it come through closer to its own ' +
      'wording rather than tightly reshaping it to match the original\'s exact sentence. Length only needs to ' +
      'be reasonably close to original_text, not nearly identical.'
  }
  return 'Style intensity: HIGH. Prioritize our own brand voice — when the brand facts include real selected ' +
    'phrasing (not just a bare fact), use it close to verbatim rather than heavily adapting it to match the ' +
    'competitor original\'s tone or length. The length-matching constraint is loosened substantially: use each ' +
    'phrase\'s own natural length, not a forced character-count match to original_text.'
}

// extractedTexts: visionAnalysis's identified_texts array.
// counterFacts: counterFacts.service's counter_facts array.
// styleIntensity (Part U-2): 0-100, same slider renderImage.service.js's
// renderFinalImage already receives — see styleIntensityInstructionFor
// above for what each tier actually asks for.
//
// getClientFn is injected (defaulting to the real getClient) purely so
// this can be unit-tested without a real OpenAI call — same DI convention
// renderImage.service.js's renderFinalImage and sheets.service.js already
// use.
export async function writeReplacementCopy(
  extractedTexts, counterFacts, styleIntensity, { getClientFn = getClient } = {}
) {
  const userPrompt = `Here is the Vision Analyst's report (Competitor's Original Text):
${JSON.stringify(extractedTexts)}

Here is the Research Specialist's data (Our Brand Facts):
${JSON.stringify(counterFacts)}

Based on these two pieces of information, generate the final JSON replacement map perfectly matching the length and tone constraints.

${styleIntensityInstructionFor(styleIntensity)}`

  const response = await getClientFn().responses.create({
    model: MODEL,
    text: { format: { type: 'json_object' } },
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })

  let parsed
  try {
    parsed = JSON.parse(response.output_text)
  } catch (err) {
    throw new Error(`Copywriting step returned invalid JSON: ${err.message}`)
  }

  return { replacements: Array.isArray(parsed.replacements) ? parsed.replacements : [] }
}
