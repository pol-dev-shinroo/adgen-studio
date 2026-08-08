import test from 'node:test'
import assert from 'node:assert/strict'
import { PRODUCT_COLUMNS, SYNC_COLUMNS } from '../src/mappers/product.mapper.js'
import { upsertProductRows } from '../src/services/sheets/productSheets.service.js'

// Regression coverage for the same class of bug sheets.service.test.js
// guards for upsertAdRows (Part N-2): a resync must never write past
// SYNC_LAST_COLUMN for an existing row, or it would silently blank a real,
// paid-for image extraction (Extracted Image URL/Extracted At), a manual
// *_Override edit, or the Extracted References JSON the moment a product's
// upstream Cafe24 data changes and this job re-syncs it. The fake Sheets
// client is injected through upsertProductRows's getClientFn (Part Z) —
// same DI convention as upsertAdRows/auth.service.js/credentials.service.js.

const PRODUCT_ID = '1000000123'
const REAL_EXTRACTED_REFERENCES = JSON.stringify([
  { type: 'product', label: '제품', imageUrl: 'https://drive.google.com/file/d/real-extraction/view', extractedAt: '2026-08-04T00:00:00.000Z' },
])

function buildExistingRow(overrides = {}) {
  const values = {
    'Product ID': PRODUCT_ID,
    'Brand': '헬시키키',
    'Product Name': '테스트 제품',
    'Price': '19,900원',
    'Last Synced': '2026-08-01T00:00:00.000Z',
    'Extracted Image URL': 'https://drive.google.com/file/d/legacy-extraction/view',
    'Extracted At': '2026-08-02T00:00:00.000Z',
    'Price Override': '17,900원',
    'Extracted References JSON': REAL_EXTRACTED_REFERENCES,
    ...overrides,
  }
  return PRODUCT_COLUMNS.map((column) => values[column] ?? '')
}

// A plain object shaped exactly like a real mapProduct() output
// (SYNC_COLUMNS only — mapProduct() never produces extraction/override/
// extracted-references keys, by design).
function buildMappedProduct(overrides = {}) {
  const base = Object.fromEntries(SYNC_COLUMNS.map((c) => [c, '']))
  return {
    ...base,
    'Product ID': PRODUCT_ID,
    'Brand': '헬시키키',
    'Product Name': '테스트 제품',
    'Price': '21,900원',
    'Last Synced': '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

function makeFakeSheets({ existingRow, captured = {} } = {}) {
  return {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: '제품' } }] } }),
      values: {
        get: async ({ range }) => {
          if (range.includes('A1:R1')) return { data: { values: [[...PRODUCT_COLUMNS]] } }
          return { data: { values: existingRow ? [[...PRODUCT_COLUMNS], existingRow] : [[...PRODUCT_COLUMNS]] } }
        },
        batchUpdate: async ({ requestBody }) => {
          captured.batchUpdate = requestBody
          return { data: {} }
        },
        append: async ({ requestBody }) => {
          captured.append = requestBody
          return { data: {} }
        },
      },
    },
  }
}

test('upsertProductRows never writes into any extraction/override-owned column when updating an existing row', async () => {
  const captured = {}
  const fakeSheets = makeFakeSheets({ existingRow: buildExistingRow(), captured })
  // A real sync-column change (price differs) so this is genuinely an
  // update, not a no-op.
  const mappedProduct = buildMappedProduct({ Price: '24,900원' })

  const result = await upsertProductRows([mappedProduct], { getClientFn: () => fakeSheets })

  assert.ok(captured.batchUpdate, 'expected an update, not an append, since the Product ID matched an existing row')
  const update = captured.batchUpdate.data[0]

  assert.doesNotMatch(update.range, /M\d+$/, 'the write range must not reach Extracted Image URL (M)')
  assert.doesNotMatch(update.range, /R\d+$/, 'the write range must not reach Extracted References JSON (R)')
  assert.match(update.range, /L\d+$/, 'the write range should end at the last sync column (L)')
  assert.equal(
    update.values[0].length, SYNC_COLUMNS.length,
    'the write payload must not include a 13th+ value that could blank an extraction/override-owned column'
  )
  assert.equal(result.updated, 1)
  assert.equal(result.appended, 0)
})

test('upsertProductRows leaves real extraction/override values in the sheet completely alone on an unrelated resync', async () => {
  const captured = {}
  const existingRow = buildExistingRow()
  const fakeSheets = makeFakeSheets({ existingRow, captured })
  // Identical sync-column values to the existing row — nothing about the
  // product actually changed.
  const mappedProduct = buildMappedProduct({
    Price: '19,900원', 'Product Name': '테스트 제품', 'Last Synced': '2026-08-05T00:00:00.000Z',
  })

  await upsertProductRows([mappedProduct], { getClientFn: () => fakeSheets })

  const update = captured.batchUpdate.data[0]
  // The write only ever covers A..L (SYNC_COLUMNS) — asserting its length
  // here is what actually proves M..R (extraction/override/references)
  // were never included in the payload sent to Sheets, i.e. left alone.
  assert.equal(update.values[0].length, SYNC_COLUMNS.length)
  assert.equal(
    update.values[0][SYNC_COLUMNS.indexOf('Price')], '19,900원',
    'sync columns should still be written with the real (identical) incoming value'
  )
})

test('upsertProductRows still writes brand-new rows at full width, all extraction/override-owned columns included', async () => {
  const captured = {}
  const fakeSheets = makeFakeSheets({ captured }) // no existing row — every product is new
  const mappedProduct = buildMappedProduct({ 'Product ID': '999', Brand: '키키뷰티' })

  const result = await upsertProductRows([mappedProduct], { getClientFn: () => fakeSheets })

  assert.ok(captured.append, 'expected an append for a brand-new Product ID')
  assert.equal(captured.append.values[0].length, PRODUCT_COLUMNS.length)
  assert.equal(result.appended, 1)
  assert.equal(result.updated, 0)
})
