import test from 'node:test'
import assert from 'node:assert/strict'
import { GENERATED_AD_COLUMNS } from '../src/mappers/generatedAd.mapper.js'
import { appendGeneratedRow, getAllGeneratedResults, updateGeneratedStatus } from '../src/services/sheets/generatedSheets.service.js'

const GENERATED_TAB_NAME = '생성결과'

// A genuinely stateful in-memory fake — append/update mutate `rows` in
// place, same convention as this suite's other Sheets fakes.
function makeFakeGeneratedSheetsClient(initialRows, captured = {}) {
  const rows = initialRows.map((r) => GENERATED_AD_COLUMNS.map((c) => r[c] ?? ''))
  return {
    get rows() { return rows },
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: GENERATED_TAB_NAME } }] } }),
      batchUpdate: async () => ({ data: {} }),
      values: {
        get: async ({ range }) => {
          if (range.includes('A1:N1')) return { data: { values: [[...GENERATED_AD_COLUMNS]] } }
          if (range.includes('A:A')) return { data: { values: [['Generation ID'], ...rows.map((r) => [r[0]])] } }
          return { data: { values: [[...GENERATED_AD_COLUMNS], ...rows.map((r) => [...r])] } }
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
          const colIndex = GENERATED_AD_COLUMNS.indexOf('Status')
          rows[rowIndex][colIndex] = requestBody.values[0][0]
          return { data: {} }
        },
      },
    },
  }
}

function buildRow(overrides = {}) {
  return Object.fromEntries(GENERATED_AD_COLUMNS.map((c) => [c, overrides[c] ?? '']))
}

test('appendGeneratedRow: a real row is appended matching GENERATED_AD_COLUMNS order', async () => {
  const fake = makeFakeGeneratedSheetsClient([])
  await appendGeneratedRow(buildRow({ 'Generation ID': 'gen-1', 'Status': 'done' }), { getClientFn: () => fake })

  assert.equal(fake.rows.length, 1)
  assert.equal(fake.rows[0][GENERATED_AD_COLUMNS.indexOf('Generation ID')], 'gen-1')
  assert.equal(fake.rows[0][GENERATED_AD_COLUMNS.indexOf('Status')], 'done')
})

test('getAllGeneratedResults: real read maps every row into a GENERATED_AD_COLUMNS-shaped object', async () => {
  const fake = makeFakeGeneratedSheetsClient([
    buildRow({ 'Generation ID': 'gen-1', 'Status': 'done' }),
    buildRow({ 'Generation ID': 'gen-2', 'Status': 'pending' }),
  ])
  const results = await getAllGeneratedResults({ getClientFn: () => fake })

  assert.equal(results.length, 2)
  assert.equal(results[0]['Generation ID'], 'gen-1')
  assert.equal(results[1]['Status'], 'pending')
})

test('updateGeneratedStatus: real write updates just the Status cell for the matching Generation ID', async () => {
  const captured = {}
  const fake = makeFakeGeneratedSheetsClient([
    buildRow({ 'Generation ID': 'gen-1', 'Status': 'pending' }),
    buildRow({ 'Generation ID': 'gen-2', 'Status': 'pending' }),
  ], captured)

  await updateGeneratedStatus('gen-2', 'confirmed', { getClientFn: () => fake })

  assert.equal(fake.rows[0][GENERATED_AD_COLUMNS.indexOf('Status')], 'pending', 'gen-1 must be untouched')
  assert.equal(fake.rows[1][GENERATED_AD_COLUMNS.indexOf('Status')], 'confirmed')
  assert.equal(captured.update.length, 1)
})

test('updateGeneratedStatus: throws a .notFound error for an unknown Generation ID', async () => {
  const fake = makeFakeGeneratedSheetsClient([buildRow({ 'Generation ID': 'gen-1' })])
  await assert.rejects(
    () => updateGeneratedStatus('does-not-exist', 'confirmed', { getClientFn: () => fake }),
    (err) => { assert.equal(err.notFound, true); return true }
  )
})
