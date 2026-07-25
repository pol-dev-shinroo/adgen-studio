import OpenAI from 'openai'
import { config } from '../config/index.js'
import { embedText } from './embeddings.service.js'

let client = null

function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey })
  }
  return client
}

const CHAT_MODEL = 'gpt-4o-mini'

export const ANALYSIS_KEYS = [
  '제품특성',
  '효과효능',
  '페인포인트',
  '프로모션정보',
  '가격정보',
  '권위/신뢰/인증',
  '광고 후킹 카피',
]

const SYSTEM_PROMPT = `당신은 이커머스 제품 데이터를 분석해 광고 제작에 필요한 인사이트를 뽑아내는 전문가입니다.
주어진 제품 정보(이름, 설명, 가격 등)를 바탕으로 아래 7개 항목을 채운 JSON 객체만 출력하세요.

- 제품특성
- 효과효능
- 페인포인트
- 프로모션정보
- 가격정보
- 권위/신뢰/인증
- 광고 후킹 카피

중요: 제공된 정보에 프로모션이나 권위/신뢰/인증 관련 내용이 없다면, 절대로 지어내지 말고
해당 항목 값을 "없음"으로 출력하세요. 다른 항목도 마찬가지로, 근거 없는 내용을 추측해서 채우지
마세요. 반드시 위 7개 키만 포함한 순수 JSON 객체로 응답하세요.`

// Matches the n8n Code node's approach: a blunt tag-strip rather than a full
// HTML parser, since Cafe24 description fields are simple marketing HTML.
function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildLookupText(rawProduct) {
  const parts = [
    rawProduct.product_name,
    stripHtml(rawProduct.summary_description),
    stripHtml(rawProduct.simple_description),
    stripHtml(rawProduct.description),
  ].filter(Boolean)
  return parts.join('\n')
}

function buildUserPrompt(rawProduct, lookupText, fewShotExamples) {
  const sections = [
    `제품명: ${rawProduct.product_name || ''}`,
    `가격: ${rawProduct.price || rawProduct.retail_price || ''}`,
    `설명:\n${lookupText}`,
  ]

  if (fewShotExamples.length) {
    const examplesText = fewShotExamples
      .map((ex, i) => `예시 ${i + 1}:\n${JSON.stringify(ex, null, 2)}`)
      .join('\n\n')
    sections.push(`\n참고용으로, 유사한 다른 제품의 이전 분석 결과입니다 (형식만 참고하세요):\n\n${examplesText}`)
  }

  return sections.join('\n\n')
}

// analyzeProduct(brandKey, rawProduct, pineconeService) — pineconeService is
// injected so this stays unit-testable without a live Pinecone index; the
// few-shot lookup is a quality nice-to-have, so any failure (or an empty
// namespace) is swallowed and analysis proceeds without examples.
export async function analyzeProduct(brandKey, rawProduct, pineconeService) {
  const lookupText = buildLookupText(rawProduct)

  let fewShotExamples = []
  try {
    const embedding = await embedText(lookupText)
    const matches = await pineconeService.queryFewShot(brandKey, embedding, 2)
    fewShotExamples = matches
      .map((m) => {
        try {
          return JSON.parse(m.metadata?.aiAnalysis || '')
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch {
    fewShotExamples = []
  }

  const completion = await getClient().chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.4,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(rawProduct, lookupText, fewShotExamples) },
    ],
  })

  const raw = completion.choices[0]?.message?.content || ''
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`GPT analysis returned invalid JSON for product ${rawProduct.product_no}: ${err.message}`)
  }

  const analysis = {}
  for (const key of ANALYSIS_KEYS) {
    analysis[key] = typeof parsed[key] === 'string' && parsed[key].trim() ? parsed[key].trim() : '없음'
  }
  return analysis
}
