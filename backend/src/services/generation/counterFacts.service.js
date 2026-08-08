import OpenAI from 'openai'
import { config } from '../../config/index.js'
import { embedText } from './embeddings.service.js'
import { queryFewShot } from './pinecone.service.js'
import { createCachedClient } from '../cachedApiClient.js'

// AA-6: maxRetries retries connection errors + 408/409/429/5xx with the
// SDK's own built-in exponential backoff (never other 4xx, e.g.
// content-policy rejections) — simpler than wrapping every real call site
// by hand, and applies to every call this client makes automatically.
const getClient = createCachedClient(() => config.openaiApiKey, (apiKey) => new OpenAI({ apiKey, maxRetries: 2 }))

// AA-5: tried gpt-4o-mini for real (same real-comparison discipline as
// productImageExtraction.service.js's DETECTION_MODEL below) — same
// SYSTEM_PROMPT, same real retrieved Pinecone facts (4 matches), same
// competitor-text input, only the chat model varied. Result: given the
// exact same 4 retrieved facts, gpt-5.5 synthesized all 5 relevant
// categories (가격/할인, 핵심 USP, 권위/신뢰, 효과효능, 광고 후킹 카피)
// while gpt-4o-mini only produced 2 (가격/할인, 핵심 USP), silently
// dropping the other 3 despite having the same source data available — a
// real, material completeness regression in this step's actual output,
// not just a formatting/JSON-validity difference. Downstream copywriting
// only has as much brand material to work with as this step hands it, so
// a real regression here is a real regression against the whole pipeline.
// Keeping gpt-5.5, per this task's own explicit allowance for that
// outcome — not chasing savings at the cost of a real quality regression.
const MODEL = 'gpt-5.5'
const TOP_K = 5

// Research Specialist system prompt carried over verbatim from the n8n
// workflow "3. 최종 이미지.json"'s "DB 검색" node. That node let the model
// call a live Pinecone tool itself (agentic retrieval via LangChain's
// vectorStorePinecone node); this service applies the same simplification
// already used in analyzeProduct.service.js — one embedding + one top-K
// query up front, with the retrieved facts hand-fed to the model in the
// user message instead of a tool-calling loop. The system prompt's own
// "use the Vector Database tool" sentence is technically vestigial under
// this mechanics (the facts are already in the prompt, nothing to call),
// but it's kept verbatim per instruction rather than edited to match.
const SYSTEM_PROMPT = `You are a Research Specialist AI equipped with a Pinecone Vector Database tool.

Tasks:

You will receive a breakdown of a competitor's ad copy and their visual locations.

Use the Vector Database tool to search for our brand's corresponding data to counter their claims (e.g., if they say "71%", find our maximum discount rate; if they say "아마존 1등", find our equivalent core USP).

Summarize the retrieved data points into a strict JSON format.

Constraints (CRITICAL):

All output facts MUST be written in Korean (한국어).

Only return factual data retrieved from the vector database. Do not invent information.

Do NOT include any conversational filler.

Do NOT wrap the output in markdown code blocks (\`\`\`json). Return raw JSON only.

Output ONLY a valid JSON object matching the exact structure below:

{
"counter_facts": [
{
"category": "가격 및 할인",
"fact": "특별 링크 사용 시 최대 51% 할인"
},
{
"category": "핵심 USP",
"fact": "피부과 전문의 참여 개발"
}
]
}`

// brandKey: internal brand key (Pinecone namespace), not the display name.
// extractedTexts: visionAnalysis's identified_texts array. Retrieval
// failures/empty namespaces aren't swallowed here the way
// analyzeProduct.service.js's few-shot lookup does — an empty brand
// namespace just means retrievedFacts is [], and the system prompt's own
// "do not invent" constraint makes the model return an empty counter_facts
// array rather than hallucinating, so no special-casing is needed.
export async function findCounterFacts(brandKey, extractedTexts) {
  const lookupText = extractedTexts.map((t) => t.text).filter(Boolean).join('\n')
  const embedding = await embedText(lookupText || '(no competitor text found)')
  const matches = await queryFewShot(brandKey, embedding, TOP_K)

  const retrievedFacts = matches
    .map((m) => {
      try {
        return JSON.parse(m.metadata?.aiAnalysis || '')
      } catch {
        return null
      }
    })
    .filter(Boolean)

  const userPrompt = `Here is the Vision Analyst's report (Competitor Data):
${JSON.stringify(extractedTexts)}

Here is data already retrieved from our brand's product database (no tool call needed — use this directly):
${JSON.stringify(retrievedFacts)}

Summarize the relevant counter-data and output ONLY a valid JSON object according to the system constraints.`

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
    throw new Error(`Counter-fact research returned invalid JSON: ${err.message}`)
  }

  return { counter_facts: Array.isArray(parsed.counter_facts) ? parsed.counter_facts : [] }
}
