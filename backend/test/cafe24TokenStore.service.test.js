import test from 'node:test'
import assert from 'node:assert/strict'
import { getTokenEntry, saveTokenEntry } from '../src/services/cafe24/cafe24TokenStore.service.js'

const TOKEN_COLUMNS = ['Brand Key', 'Access Token', 'Refresh Token', 'Expires At', 'Refresh Expires At', 'Updated At']

// A genuinely stateful in-memory fake — update/append mutate `rows` in
// place. Also answers the tab-existence/header-check calls
// (ensureTokenTab) so that internal helper never makes a real call either.
function makeFakeTokenSheetsClient(initialRows, captured = {}) {
  const rows = initialRows.map((r) => TOKEN_COLUMNS.map((c) => r[c] ?? ''))
  return {
    get rows() { return rows },
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: 'cafe24_tokens' } }] } }),
      batchUpdate: async () => ({ data: {} }),
      values: {
        get: async ({ range }) => {
          if (range.includes('A1:F1')) return { data: { values: [[...TOKEN_COLUMNS]] } }
          return { data: { values: [[...TOKEN_COLUMNS], ...rows.map((r) => [...r])] } }
        },
        update: async ({ range, requestBody }) => {
          captured.update = [...(captured.update || []), { range, requestBody }]
          // Anchored to an uppercase column letter immediately followed by
          // digits (e.g. "A2:F2") — NOT a bare /(\d+)/, which would
          // wrongly match the "24" inside the tab name "cafe24_tokens"
          // itself and write to a wildly wrong row (caught by this exact
          // test failing during development).
          const rowNumber = Number(range.match(/[A-Z]+(\d+):[A-Z]+\d+/)[1])
          rows[rowNumber - 2] = [...requestBody.values[0]]
          return { data: {} }
        },
        append: async ({ requestBody }) => {
          captured.append = [...(captured.append || []), requestBody]
          rows.push([...requestBody.values[0]])
          return { data: {} }
        },
      },
    },
  }
}

test('getTokenEntry: returns null for a brand that has never completed auth', async () => {
  const fake = makeFakeTokenSheetsClient([])
  const entry = await getTokenEntry('healthykiki', { getClientFn: () => fake })
  assert.equal(entry, null)
})

test('getTokenEntry: returns the real stored entry, parsing numeric fields', async () => {
  const fake = makeFakeTokenSheetsClient([{
    'Brand Key': 'healthykiki', 'Access Token': 'at-1', 'Refresh Token': 'rt-1',
    'Expires At': '1700000000000', 'Refresh Expires At': '1700999999999',
  }])
  const entry = await getTokenEntry('healthykiki', { getClientFn: () => fake })
  assert.deepEqual(entry, {
    accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: 1700000000000, refreshExpiresAt: 1700999999999,
  })
})

test('saveTokenEntry: appends a new row for a brand with no existing entry', async () => {
  const captured = {}
  const fake = makeFakeTokenSheetsClient([], captured)
  await saveTokenEntry(
    'healthykiki',
    { accessToken: 'at-new', refreshToken: 'rt-new', expiresAt: 1700000000000, refreshExpiresAt: null },
    { getClientFn: () => fake }
  )
  assert.equal(captured.append.length, 1)
  assert.equal(fake.rows.length, 1)
  assert.equal(fake.rows[0][0], 'healthykiki')
  assert.equal(fake.rows[0][1], 'at-new')
})

test('saveTokenEntry: overwrites the existing row in place for a brand that already has one (never duplicates)', async () => {
  const captured = {}
  const fake = makeFakeTokenSheetsClient([
    { 'Brand Key': 'healthykiki', 'Access Token': 'old-at', 'Refresh Token': 'old-rt' },
  ], captured)

  await saveTokenEntry(
    'healthykiki',
    { accessToken: 'rotated-at', refreshToken: 'rotated-rt', expiresAt: 1800000000000, refreshExpiresAt: 1800999999999 },
    { getClientFn: () => fake }
  )

  assert.equal(fake.rows.length, 1, 'still exactly one row for this brand key, not appended as a second')
  assert.equal(fake.rows[0][1], 'rotated-at')
  assert.equal(fake.rows[0][2], 'rotated-rt')
  assert.ok(captured.update, 'an update, not an append, since the brand already had a row')
})
