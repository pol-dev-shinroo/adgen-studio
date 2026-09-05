import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONVERSATION_COLUMNS, upsertConversation, getAllConversations, getConversation,
} from '../src/services/sheets/aiConversations.service.js'

const CONVERSATIONS_TAB_NAME = 'AI 스튜디오 대화'

// A genuinely stateful in-memory fake — append/update mutate `rows` in
// place, same convention as generatedSheets.service.test.js's own fake.
function makeFakeConversationsClient(initialRows, captured = {}) {
  const rows = initialRows.map((r) => CONVERSATION_COLUMNS.map((c) => r[c] ?? ''))
  return {
    get rows() { return rows },
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: CONVERSATIONS_TAB_NAME } }] } }),
      batchUpdate: async () => ({ data: {} }),
      values: {
        get: async ({ range }) => {
          if (range.includes('A1:N1')) return { data: { values: [[...CONVERSATION_COLUMNS]] } }
          return { data: { values: [[...CONVERSATION_COLUMNS], ...rows.map((r) => [...r])] } }
        },
        append: async ({ requestBody }) => {
          captured.append = [...(captured.append || []), requestBody]
          rows.push([...requestBody.values[0]])
          return { data: {} }
        },
        update: async ({ range, requestBody }) => {
          captured.update = [...(captured.update || []), { range, requestBody }]
          const match = range.match(/([A-Z]+)(\d+):[A-Z]+\d+/)
          const rowIndex = Number(match[2]) - 2
          rows[rowIndex] = [...requestBody.values[0]]
          return { data: {} }
        },
      },
    },
  }
}

function buildRow(overrides = {}) {
  return Object.fromEntries(CONVERSATION_COLUMNS.map((c) => [c, overrides[c] ?? '']))
}

function buildConversation(overrides = {}) {
  return {
    id: 'conv-1',
    selectedBrandKey: 'healthykiki',
    selectedRefBrand: '안티칼',
    selectedRefAdId: 'ad-1',
    selectedProductId: '18',
    phase: 'dialog:background',
    imageUrl: 'https://example.com/ad.png',
    messages: [{ id: 1, role: 'ai', kind: 'text', text: '안녕' }],
    segments: [{ id: 'background-0', type: 'background' }],
    decisions: { background: null, texts: {}, model: null, product: null },
    sourceResult: null,
    ...overrides,
  }
}

test('upsertConversation: a brand-new conversation is appended, with Created At and Updated At both set to now', async () => {
  const captured = {}
  const fake = makeFakeConversationsClient([], captured)
  await upsertConversation(buildConversation(), { getClientFn: () => fake })

  assert.equal(fake.rows.length, 1)
  const row = fake.rows[0]
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Conversation ID')], 'conv-1')
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Brand')], 'healthykiki')
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Ref Brand')], '안티칼')
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Reference Ad ID')], 'ad-1')
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Product ID')], '18')
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Phase')], 'dialog:background')
  assert.deepEqual(JSON.parse(row[CONVERSATION_COLUMNS.indexOf('Messages JSON')]), [{ id: 1, role: 'ai', kind: 'text', text: '안녕' }])
  assert.ok(row[CONVERSATION_COLUMNS.indexOf('Created At')])
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Created At')], row[CONVERSATION_COLUMNS.indexOf('Updated At')])
})

test('upsertConversation: Source Result ID/JSON are populated only when sourceResult is present', async () => {
  const fake = makeFakeConversationsClient([])
  const sourceResult = { id: 'gen-99', brand: '헬시키키', productId: '18' }
  await upsertConversation(buildConversation({ id: 'conv-2', sourceResult }), { getClientFn: () => fake })

  const row = fake.rows[0]
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Source Result ID')], 'gen-99')
  assert.deepEqual(JSON.parse(row[CONVERSATION_COLUMNS.indexOf('Source Result JSON')]), sourceResult)
})

test('upsertConversation: a conversation with no sourceResult leaves Source Result ID/JSON blank', async () => {
  const fake = makeFakeConversationsClient([])
  await upsertConversation(buildConversation(), { getClientFn: () => fake })

  const row = fake.rows[0]
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Source Result ID')], '')
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Source Result JSON')], '')
})

test('upsertConversation: re-saving an existing conversation ID overwrites the whole row in place, preserving the original Created At', async () => {
  const captured = {}
  const fake = makeFakeConversationsClient([], captured)
  await upsertConversation(buildConversation({ phase: 'dialog:background' }), { getClientFn: () => fake })
  const firstCreatedAt = fake.rows[0][CONVERSATION_COLUMNS.indexOf('Created At')]

  await new Promise((resolve) => setTimeout(resolve, 5))
  await upsertConversation(buildConversation({ phase: 'review' }), { getClientFn: () => fake })

  assert.equal(fake.rows.length, 1, 'must overwrite in place, not append a second row')
  const row = fake.rows[0]
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Phase')], 'review')
  assert.equal(row[CONVERSATION_COLUMNS.indexOf('Created At')], firstCreatedAt, 'Created At must never change on an update')
  assert.notEqual(row[CONVERSATION_COLUMNS.indexOf('Updated At')], firstCreatedAt, 'Updated At must advance on every save')
  assert.equal(captured.append.length, 1, 'only the first save appends')
  assert.equal(captured.update.length, 1, 'the second save updates in place')
})

test('getAllConversations: real read maps every row into a CONVERSATION_COLUMNS-shaped object', async () => {
  const fake = makeFakeConversationsClient([
    buildRow({ 'Conversation ID': 'conv-1', 'Phase': 'dialog:background' }),
    buildRow({ 'Conversation ID': 'conv-2', 'Phase': 'review' }),
  ])
  const results = await getAllConversations({ getClientFn: () => fake })

  assert.equal(results.length, 2)
  assert.equal(results[0]['Conversation ID'], 'conv-1')
  assert.equal(results[1]['Phase'], 'review')
})

test('getConversation: returns the matching row by ID', async () => {
  const fake = makeFakeConversationsClient([
    buildRow({ 'Conversation ID': 'conv-1', 'Phase': 'dialog:background' }),
    buildRow({ 'Conversation ID': 'conv-2', 'Phase': 'review' }),
  ])
  const result = await getConversation('conv-2', { getClientFn: () => fake })

  assert.equal(result['Conversation ID'], 'conv-2')
  assert.equal(result['Phase'], 'review')
})

test('getConversation: returns null (not a thrown error) for an unknown ID — the controller decides the HTTP status', async () => {
  const fake = makeFakeConversationsClient([buildRow({ 'Conversation ID': 'conv-1' })])
  const result = await getConversation('does-not-exist', { getClientFn: () => fake })
  assert.equal(result, null)
})
