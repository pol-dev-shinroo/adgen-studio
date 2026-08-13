import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeProduct, ANALYSIS_KEYS } from '../src/services/generation/analyzeProduct.service.js'

function fakeChatClient(content) {
  let lastRequest = null
  const client = {
    chat: { completions: { create: async (request) => { lastRequest = request; return { choices: [{ message: { content } }] } } } },
  }
  return { client, getLastRequest: () => lastRequest }
}

function fullAnalysisJson(overrides = {}) {
  const base = Object.fromEntries(ANALYSIS_KEYS.map((k) => [k, '없음']))
  return JSON.stringify({ ...base, ...overrides })
}

test('analyzeProduct: a real successful analysis fills all 7 keys, falling back to 없음 for any blank/missing one', async () => {
  const { client } = fakeChatClient(fullAnalysisJson({ '제품특성': '19종 프로바이오틱스', '가격정보': '  ' }))
  const pineconeService = { queryFewShot: async () => [] }

  const analysis = await analyzeProduct(
    'healthykiki',
    { product_no: 1, product_name: '테스트 제품', price: '10000' },
    pineconeService,
    { getClientFn: () => client, embedTextFn: async () => [0.1] }
  )

  assert.equal(analysis['제품특성'], '19종 프로바이오틱스')
  assert.equal(analysis['가격정보'], '없음', 'a blank string from the model must fall back to 없음, not be kept as-is')
  assert.deepEqual(Object.keys(analysis).sort(), [...ANALYSIS_KEYS].sort())
})

test('analyzeProduct: real few-shot examples retrieved from Pinecone are fed into the user prompt', async () => {
  const { client, getLastRequest } = fakeChatClient(fullAnalysisJson())
  const pineconeService = {
    queryFewShot: async () => [{ metadata: { aiAnalysis: JSON.stringify({ '제품특성': '이전 제품 특성 예시' }) } }],
  }

  await analyzeProduct(
    'healthykiki', { product_no: 2, product_name: 'X' }, pineconeService,
    { getClientFn: () => client, embedTextFn: async () => [0.1] }
  )

  const userMessage = getLastRequest().messages.find((m) => m.role === 'user')
  assert.match(userMessage.content, /이전 제품 특성 예시/)
})

test('analyzeProduct: a Pinecone few-shot lookup failure is swallowed — analysis still runs with no examples', async () => {
  const { client, getLastRequest } = fakeChatClient(fullAnalysisJson({ '제품특성': '분석 성공' }))
  const pineconeService = { queryFewShot: async () => { throw new Error('pinecone unavailable') } }

  const analysis = await analyzeProduct(
    'healthykiki', { product_no: 3, product_name: 'Y' }, pineconeService,
    { getClientFn: () => client, embedTextFn: async () => [0.1] }
  )

  assert.equal(analysis['제품특성'], '분석 성공', 'the real analysis call must still happen despite the Pinecone failure')
  const userMessage = getLastRequest().messages.find((m) => m.role === 'user')
  assert.doesNotMatch(userMessage.content, /참고용으로/, 'no few-shot examples section when the lookup failed')
})

test('analyzeProduct: throws a clear error (including the product number) when the model returns invalid JSON', async () => {
  const { client } = fakeChatClient('not valid json{{{')
  const pineconeService = { queryFewShot: async () => [] }

  await assert.rejects(
    () => analyzeProduct('healthykiki', { product_no: 42 }, pineconeService, { getClientFn: () => client, embedTextFn: async () => [0.1] }),
    /GPT analysis returned invalid JSON for product 42/
  )
})
