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

// extractedTexts: visionAnalysis's identified_texts array.
// counterFacts: counterFacts.service's counter_facts array.
export async function writeReplacementCopy(extractedTexts, counterFacts) {
  const userPrompt = `Here is the Vision Analyst's report (Competitor's Original Text):
${JSON.stringify(extractedTexts)}

Here is the Research Specialist's data (Our Brand Facts):
${JSON.stringify(counterFacts)}

Based on these two pieces of information, generate the final JSON replacement map perfectly matching the length and tone constraints.`

  const response = await getClient().responses.create({
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
