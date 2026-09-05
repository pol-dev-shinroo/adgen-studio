import test from 'node:test'
import assert from 'node:assert/strict'
import { getConversations, getConversationById, putConversation } from '../src/controllers/aiConversations.controller.js'

function makeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

function makeNext() {
  const calls = []
  const next = (...args) => calls.push(args)
  next.calls = calls
  return next
}

function buildRow(overrides = {}) {
  return {
    'Conversation ID': 'conv-1', 'Brand': 'healthykiki', 'Ref Brand': '안티칼', 'Reference Ad ID': 'ad-1',
    'Product ID': '18', 'Source Result ID': '', 'Phase': 'dialog:background', 'Image URL': 'https://example.com/ad.png',
    'Messages JSON': '[]', 'Segments JSON': '[]', 'Decisions JSON': '{}', 'Source Result JSON': '',
    'Created At': '2026-09-05T00:00:00.000Z', 'Updated At': '2026-09-05T00:01:00.000Z',
    ...overrides,
  }
}

// --- getConversations ---

test('getConversations: returns a lightweight list, never the full Messages/Segments/Decisions JSON', async () => {
  const res = makeRes()
  await getConversations({}, res, makeNext(), {
    getAllConversationsFn: async () => [buildRow()],
  })

  assert.equal(res.statusCode, null)
  assert.equal(res.body.conversations.length, 1)
  const item = res.body.conversations[0]
  assert.equal(item.id, 'conv-1')
  assert.equal(item.refBrand, '안티칼')
  assert.equal(item.referenceAdId, 'ad-1')
  assert.equal(item.phase, 'dialog:background')
  assert.ok(item.label)
  assert.equal(item.messages, undefined)
  assert.equal(item.segments, undefined)
  assert.equal(item.decisions, undefined)
})

test('getConversations: sorts most-recently-updated first', async () => {
  const res = makeRes()
  await getConversations({}, res, makeNext(), {
    getAllConversationsFn: async () => [
      buildRow({ 'Conversation ID': 'old', 'Updated At': '2026-09-01T00:00:00.000Z' }),
      buildRow({ 'Conversation ID': 'new', 'Updated At': '2026-09-05T00:00:00.000Z' }),
    ],
  })

  assert.deepEqual(res.body.conversations.map((c) => c.id), ['new', 'old'])
})

test('getConversations: label falls back to the first user message when no reference ad is picked yet', async () => {
  const res = makeRes()
  await getConversations({}, res, makeNext(), {
    getAllConversationsFn: async () => [buildRow({
      'Reference Ad ID': '',
      'Messages JSON': JSON.stringify([{ role: 'ai', text: '어떤 브랜드?' }, { role: 'user', text: '안티칼' }]),
    })],
  })

  assert.equal(res.body.conversations[0].label, '안티칼')
})

// --- getConversationById ---

test('getConversationById: 404 when not found', async () => {
  const res = makeRes()
  await getConversationById({ params: { id: 'missing' } }, res, makeNext(), {
    getConversationFn: async () => null,
  })
  assert.equal(res.statusCode, 404)
})

test('getConversationById: full detail parses every JSON field, matching AIStudioContext.jsx\'s state shape', async () => {
  const res = makeRes()
  await getConversationById({ params: { id: 'conv-1' } }, res, makeNext(), {
    getConversationFn: async () => buildRow({
      'Messages JSON': JSON.stringify([{ id: 1, role: 'ai', text: 'hi' }]),
      'Segments JSON': JSON.stringify([{ id: 'background-0', type: 'background' }]),
      'Decisions JSON': JSON.stringify({ background: { mode: 'keep', value: null }, texts: {}, model: null, product: null }),
      'Source Result JSON': JSON.stringify({ id: 'gen-99', brand: '헬시키키' }),
      'Source Result ID': 'gen-99',
    }),
  })

  assert.equal(res.statusCode, null)
  assert.equal(res.body.id, 'conv-1')
  assert.equal(res.body.selectedBrandKey, 'healthykiki')
  assert.equal(res.body.selectedRefBrand, '안티칼')
  assert.equal(res.body.selectedRefAdId, 'ad-1')
  assert.equal(res.body.selectedProductId, '18')
  assert.equal(res.body.phase, 'dialog:background')
  assert.deepEqual(res.body.messages, [{ id: 1, role: 'ai', text: 'hi' }])
  assert.deepEqual(res.body.segments, [{ id: 'background-0', type: 'background' }])
  assert.deepEqual(res.body.decisions, { background: { mode: 'keep', value: null }, texts: {}, model: null, product: null })
  assert.deepEqual(res.body.sourceResult, { id: 'gen-99', brand: '헬시키키' })
})

test('getConversationById: malformed JSON on a corrupt row falls back to empty defaults rather than throwing', async () => {
  const res = makeRes()
  await getConversationById({ params: { id: 'conv-1' } }, res, makeNext(), {
    getConversationFn: async () => buildRow({ 'Messages JSON': 'not valid json{{', 'Decisions JSON': 'also broken' }),
  })

  assert.equal(res.statusCode, null)
  assert.deepEqual(res.body.messages, [])
  assert.deepEqual(res.body.decisions, { background: null, texts: {}, model: null, product: null })
})

test('getConversationById: sourceResult is null (not an empty object) when Source Result JSON is blank', async () => {
  const res = makeRes()
  await getConversationById({ params: { id: 'conv-1' } }, res, makeNext(), {
    getConversationFn: async () => buildRow({ 'Source Result JSON': '' }),
  })
  assert.equal(res.body.sourceResult, null)
})

// --- putConversation ---

test('putConversation: 400 when id is missing', async () => {
  const res = makeRes()
  await putConversation({ params: { id: 'conv-1' }, body: { phase: 'select-brand', messages: [] } }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('putConversation: 400 when phase is missing', async () => {
  const res = makeRes()
  await putConversation({ params: { id: 'conv-1' }, body: { id: 'conv-1', messages: [] } }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('putConversation: 400 when messages is not an array', async () => {
  const res = makeRes()
  await putConversation({ params: { id: 'conv-1' }, body: { id: 'conv-1', phase: 'select-brand', messages: 'nope' } }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('putConversation: 400 when the URL id and body id disagree', async () => {
  const res = makeRes()
  await putConversation(
    { params: { id: 'conv-1' }, body: { id: 'conv-2', phase: 'select-brand', messages: [] } }, res, makeNext()
  )
  assert.equal(res.statusCode, 400)
})

test('putConversation: real success calls upsertConversation with the request body and responds { ok: true }', async () => {
  const res = makeRes()
  let captured = null
  const body = { id: 'conv-1', phase: 'dialog:background', messages: [{ id: 1 }], selectedRefAdId: 'ad-1' }
  await putConversation({ params: { id: 'conv-1' }, body }, res, makeNext(), {
    upsertConversationFn: async (conversation) => { captured = conversation },
  })

  assert.equal(res.statusCode, null)
  assert.deepEqual(res.body, { ok: true })
  assert.deepEqual(captured, body)
})
