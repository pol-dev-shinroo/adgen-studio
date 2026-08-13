import test from 'node:test'
import assert from 'node:assert/strict'
import { findCounterFacts } from '../src/services/generation/counterFacts.service.js'

function fakeChatClient(outputText) {
  let lastRequest = null
  const client = { responses: { create: async (request) => { lastRequest = request; return { output_text: outputText } } } }
  return { client, getLastRequest: () => lastRequest }
}

test('findCounterFacts: embeds the competitor text, queries Pinecone, and feeds retrieved facts into the prompt', async () => {
  const { client, getLastRequest } = fakeChatClient(JSON.stringify({
    counter_facts: [{ category: '가격 및 할인', fact: '최대 51% 할인' }],
  }))
  const embedCalls = []
  const queryCalls = []

  const result = await findCounterFacts(
    'healthykiki',
    [{ location: 'top', text: '아마존 1등' }],
    {
      getClientFn: () => client,
      embedTextFn: async (text) => { embedCalls.push(text); return [0.1, 0.2] },
      queryFewShotFn: async (brandKey, embedding, topK) => {
        queryCalls.push({ brandKey, embedding, topK })
        return [{ metadata: { aiAnalysis: JSON.stringify({ 가격정보: '51% 할인' }) } }]
      },
    }
  )

  assert.deepEqual(result, { counter_facts: [{ category: '가격 및 할인', fact: '최대 51% 할인' }] })
  assert.deepEqual(embedCalls, ['아마존 1등'])
  assert.equal(queryCalls[0].brandKey, 'healthykiki')
  assert.equal(queryCalls[0].topK, 5)

  const userMessage = getLastRequest().input.find((m) => m.role === 'user')
  assert.match(userMessage.content, /51% 할인/, 'the retrieved Pinecone fact must actually be fed into the prompt')
})

test('findCounterFacts: no competitor text at all still embeds a placeholder rather than an empty string', async () => {
  const { client } = fakeChatClient(JSON.stringify({ counter_facts: [] }))
  const embedCalls = []

  await findCounterFacts('healthykiki', [], {
    getClientFn: () => client,
    embedTextFn: async (text) => { embedCalls.push(text); return [0] },
    queryFewShotFn: async () => [],
  })

  assert.deepEqual(embedCalls, ['(no competitor text found)'])
})

test('findCounterFacts: an unparseable metadata.aiAnalysis entry is silently dropped from retrievedFacts, not fatal', async () => {
  const { client, getLastRequest } = fakeChatClient(JSON.stringify({ counter_facts: [] }))

  await findCounterFacts('healthykiki', [{ location: 'x', text: 'y' }], {
    getClientFn: () => client,
    embedTextFn: async () => [0],
    queryFewShotFn: async () => [
      { metadata: { aiAnalysis: 'not valid json' } },
      { metadata: { aiAnalysis: JSON.stringify({ ok: true }) } },
    ],
  })

  const userMessage = getLastRequest().input.find((m) => m.role === 'user')
  assert.match(userMessage.content, /"ok":true/)
})

test('findCounterFacts: defaults counter_facts to [] when the model omits it, and throws on invalid JSON', async () => {
  const { client: emptyClient } = fakeChatClient(JSON.stringify({ notCounterFacts: [] }))
  const result = await findCounterFacts('healthykiki', [], {
    getClientFn: () => emptyClient, embedTextFn: async () => [0], queryFewShotFn: async () => [],
  })
  assert.deepEqual(result, { counter_facts: [] })

  const { client: badClient } = fakeChatClient('not json{{{')
  await assert.rejects(
    () => findCounterFacts('healthykiki', [], { getClientFn: () => badClient, embedTextFn: async () => [0], queryFewShotFn: async () => [] }),
    /Counter-fact research returned invalid JSON/
  )
})
