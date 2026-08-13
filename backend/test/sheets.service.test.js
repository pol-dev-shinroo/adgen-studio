import test from 'node:test'
import assert from 'node:assert/strict'
import { AD_COLUMNS, SYNC_COLUMNS } from '../src/mappers/ad.mapper.js'
import { config } from '../src/config/index.js'
import {
  upsertAdRows, updateAdField, updateAdFields, revertAdRow, deleteAdRows, getAllAds,
} from '../src/services/sheets/sheets.service.js'

// Regression coverage for Part N-2: a resync used to write the FULL
// A..LAST_COLUMN range for an existing row, which — once LAST_COLUMN grew
// to include Extracted Reference JSON (Part N) — silently blanked a real,
// paid-for ad-reference extraction on every single re-collection. The bug
// lived entirely in upsertAdRows's write range/diff, not in mapAd()'s pure
// output, so mapper-level tests alone could never have caught it — this
// exercises the real Sheets-API call shape instead, via a fake sheets
// client injected through upsertAdRows's getClientFn (mirrors
// generation.service.js's prepareInputs dependency-injection convention;
// there's no established sheets-mocking pattern yet since this is the
// first test of this file).
//
// Part O added a SECOND extraction-owned column (Extracted Copy JSON) —
// these tests carry a real value in that column too, proving the
// SYNC_COLUMNS/SYNC_LAST_COLUMN-based protection generalizes to however
// many extraction-owned columns follow it, not just the first one.

const AD_ID = '1234567890'
const REAL_EXTRACTED_REFERENCE = JSON.stringify({
  imageUrl: 'https://drive.google.com/file/d/real-extraction/view',
  extractedAt: '2026-08-04T00:00:00.000Z',
})
const REAL_EXTRACTED_COPY = JSON.stringify({
  price: '29,900원', promotion: '오늘만 71% 특가', adHooks: ['운동&식단 필요없는 지방흡착템'],
})

function buildExistingRow() {
  const values = {
    'Ad Archive ID': AD_ID,
    'Brand': '테스트브랜드',
    'Status': '게재중',
    'Search Keyword': 'test',
    'Extracted Reference JSON': REAL_EXTRACTED_REFERENCE,
    'Extracted Copy JSON': REAL_EXTRACTED_COPY,
  }
  return AD_COLUMNS.map((column) => values[column] ?? '')
}

// A plain object shaped exactly like a real mapAd() output (SYNC_COLUMNS
// only — mapAd() never produces 'Extracted Reference JSON', by design).
function buildMappedAd(overrides = {}) {
  const base = Object.fromEntries(SYNC_COLUMNS.map((c) => [c, '']))
  return {
    ...base,
    'Ad Archive ID': AD_ID,
    'Brand': '테스트브랜드',
    'Search Keyword': 'test',
    'Status': '게재중',
    'Date Scraped': '2026-08-04T01:00:00.000Z',
    ...overrides,
  }
}

function makeFakeSheets({ existingRow, captured }) {
  return {
    spreadsheets: {
      values: {
        get: async () => ({ data: { values: [[...AD_COLUMNS], existingRow] } }),
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

test('upsertAdRows never writes into either extraction-owned column when updating an existing row', async () => {
  const captured = {}
  const fakeSheets = makeFakeSheets({ existingRow: buildExistingRow(), captured })
  // A real sync-column change (Status flips) so this is genuinely an
  // 'updated' row, not just exercising the unchanged path.
  const mappedAd = buildMappedAd({ Status: '종료' })

  const result = await upsertAdRows([mappedAd], { getClientFn: () => fakeSheets })

  assert.ok(captured.batchUpdate, 'expected an update, not an append, since the Ad Archive ID matched an existing row')
  const update = captured.batchUpdate.data[0]

  assert.doesNotMatch(update.range, /W\d+$/, 'the write range must not reach the Extracted Reference JSON column (W)')
  assert.doesNotMatch(update.range, /X\d+$/, 'the write range must not reach the Extracted Copy JSON column (X)')
  assert.match(update.range, /V\d+$/, 'the write range should end at the last sync column (V)')
  assert.equal(
    update.values[0].length, SYNC_COLUMNS.length,
    'the write payload must not include a 23rd or 24th value that could blank either extraction-owned column'
  )

  const status = result.statuses.find((s) => s.adArchiveId === AD_ID)
  assert.equal(status.status, 'updated')
  assert.ok(
    !status.changedFields.includes('Extracted Reference JSON'),
    'the diff must never flag the extracted-reference column as changed — comparing it would always spuriously differ'
  )
  assert.ok(
    !status.changedFields.includes('Extracted Copy JSON'),
    'the diff must never flag the extracted-copy column as changed either — same reason, applied from day one this time'
  )
})

test('upsertAdRows leaves real extraction values (both columns) in the sheet completely alone on an unrelated resync', async () => {
  const captured = {}
  const fakeSheets = makeFakeSheets({ existingRow: buildExistingRow(), captured })
  // Identical to the existing row's sync columns — nothing about the ad
  // actually changed, only Date Scraped (diff-ignored) differs.
  const mappedAd = buildMappedAd({ Status: '게재중' })

  await upsertAdRows([mappedAd], { getClientFn: () => fakeSheets })

  const update = captured.batchUpdate.data[0]
  // The write payload never even contains either real extraction value or
  // a blank in its place — the range itself stops two columns short.
  assert.equal(update.values[0].length, SYNC_COLUMNS.length)
  assert.ok(!update.values[0].includes(REAL_EXTRACTED_REFERENCE))
  assert.ok(!update.values[0].includes(REAL_EXTRACTED_COPY))
})

test('upsertAdRows still writes brand-new rows at full width, both extraction-owned columns included', async () => {
  const captured = {}
  const fakeSheets = {
    spreadsheets: {
      values: {
        // No existing rows at all -> every mapped ad is a genuine append.
        get: async () => ({ data: { values: [[...AD_COLUMNS]] } }),
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

  const mappedAd = buildMappedAd({ 'Ad Archive ID': 'brand-new-id' })
  await upsertAdRows([mappedAd], { getClientFn: () => fakeSheets })

  assert.ok(captured.append, 'expected an append since no existing row matched')
  assert.equal(
    captured.append.values[0].length, AD_COLUMNS.length,
    'a brand-new row has no extraction data to protect, so it can write the full width'
  )
})

// CC-3: updateAdField/updateAdFields/revertAdRow/deleteAdRows/getAllAds
// coverage. A genuinely stateful in-memory fake (same convention
// productSync.service.test.js's makeFakeProductSheets uses) — update/
// batchUpdate mutate `rows` in place, so a write-then-read sequence within
// one call (updateAdField's own row lookup, or a test asserting on the
// post-write state) actually reflects it. Also answers the header-check
// range (A1:X1, from ensureAdSheetHeader) with a complete header and the
// top-level spreadsheets.get gid lookup (from deleteAdRows's getSheetGid)
// with a fixed gid, so neither of those internal helpers ever needs a real
// call either.
function makeFakeAdSheetsClient(initialRows, captured = {}) {
  let rows = initialRows.map((r) => AD_COLUMNS.map((c) => r[c] ?? ''))

  return {
    get rows() { return rows },
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: config.sheetTabName, sheetId: 999 } }] } }),
      // Row deletion (deleteAdRows) — top-level spreadsheets.batchUpdate,
      // distinct from spreadsheets.values.batchUpdate below. startIndex is
      // 0-based against the FULL sheet including the header row, so the
      // matching data-array index is startIndex - 1.
      batchUpdate: async ({ requestBody }) => {
        captured.deleteDimension = requestBody
        const dataIndexesToDelete = new Set(
          requestBody.requests.map((r) => r.deleteDimension.range.startIndex - 1)
        )
        rows = rows.filter((_, i) => !dataIndexesToDelete.has(i))
        return { data: {} }
      },
      values: {
        get: async ({ range }) => {
          if (range.includes('A1:X1')) return { data: { values: [[...AD_COLUMNS]] } }
          if (range.includes('A:A')) {
            return { data: { values: [['Ad Archive ID'], ...rows.map((r) => [r[0]])] } }
          }
          return { data: { values: [[...AD_COLUMNS], ...rows.map((r) => [...r])] } }
        },
        // Single-cell (updateAdField) or full-row (revertAdRow) writes,
        // both via values.update — distinguished by payload width.
        update: async ({ range, requestBody }) => {
          captured.update = [...(captured.update || []), { range, requestBody }]
          const match = range.match(/([A-Z]+)(\d+):[A-Z]+\d+/)
          const rowIndex = Number(match[2]) - 2 // -1 for the header row, -1 for 0-based indexing
          const colIndex = match[1].charCodeAt(0) - 65
          requestBody.values[0].forEach((v, i) => { rows[rowIndex][colIndex + i] = v })
          return { data: {} }
        },
        // Multi-field writes (updateAdFields) — one {range, values} entry
        // per field, each still a single cell.
        batchUpdate: async ({ requestBody }) => {
          captured.valuesBatchUpdate = [...(captured.valuesBatchUpdate || []), requestBody]
          for (const { range, values } of requestBody.data) {
            const match = range.match(/([A-Z]+)(\d+):[A-Z]+\d+/)
            const rowIndex = Number(match[2]) - 2
            const colIndex = match[1].charCodeAt(0) - 65
            rows[rowIndex][colIndex] = values[0][0]
          }
          return { data: {} }
        },
      },
    },
  }
}

test('updateAdField: real write updates exactly the one target cell', async () => {
  const captured = {}
  const fake = makeFakeAdSheetsClient([{ 'Ad Archive ID': AD_ID, 'Search Keyword': '이전이름' }], captured)

  await updateAdField(AD_ID, 'Search Keyword', '새이름', { getClientFn: () => fake })

  assert.equal(fake.rows[0][AD_COLUMNS.indexOf('Search Keyword')], '새이름')
  assert.equal(captured.update.length, 1)
})

test('updateAdField: throws with .notFound=true for an unknown Ad Archive ID', async () => {
  const fake = makeFakeAdSheetsClient([{ 'Ad Archive ID': AD_ID }])
  await assert.rejects(
    () => updateAdField('does-not-exist', 'Search Keyword', 'x', { getClientFn: () => fake }),
    (err) => {
      assert.equal(err.notFound, true)
      return true
    }
  )
})

test('updateAdFields: real write updates multiple columns in one batch', async () => {
  const captured = {}
  const fake = makeFakeAdSheetsClient([{ 'Ad Archive ID': AD_ID }], captured)

  await updateAdFields(
    AD_ID,
    { 'Extracted Reference JSON': REAL_EXTRACTED_REFERENCE, 'Extracted Copy JSON': REAL_EXTRACTED_COPY },
    { getClientFn: () => fake }
  )

  assert.equal(fake.rows[0][AD_COLUMNS.indexOf('Extracted Reference JSON')], REAL_EXTRACTED_REFERENCE)
  assert.equal(fake.rows[0][AD_COLUMNS.indexOf('Extracted Copy JSON')], REAL_EXTRACTED_COPY)
  assert.equal(captured.valuesBatchUpdate.length, 1)
  assert.equal(captured.valuesBatchUpdate[0].data.length, 2, 'both fields written in one batchUpdate call')
})

test('updateAdFields: throws with .notFound=true for an unknown Ad Archive ID', async () => {
  const fake = makeFakeAdSheetsClient([{ 'Ad Archive ID': AD_ID }])
  await assert.rejects(
    () => updateAdFields('does-not-exist', { 'Extracted Reference JSON': 'x' }, { getClientFn: () => fake }),
    (err) => {
      assert.equal(err.notFound, true)
      return true
    }
  )
})

test('revertAdRow: real write restores the full row to previousValues', async () => {
  const fake = makeFakeAdSheetsClient([buildExistingRow().reduce((obj, v, i) => ({ ...obj, [AD_COLUMNS[i]]: v }), {})])
  const previousValues = AD_COLUMNS.map((c) => (c === 'Status' ? '이전상태' : buildExistingRow()[AD_COLUMNS.indexOf(c)]))

  await revertAdRow(AD_ID, previousValues, { getClientFn: () => fake })

  assert.equal(fake.rows[0][AD_COLUMNS.indexOf('Status')], '이전상태')
  // The real extraction columns must round-trip through the revert
  // unchanged too — previousValues is the FULL row, not a partial one.
  assert.equal(fake.rows[0][AD_COLUMNS.indexOf('Extracted Reference JSON')], REAL_EXTRACTED_REFERENCE)
})

test('revertAdRow: throws with .notFound=true for an unknown Ad Archive ID', async () => {
  const fake = makeFakeAdSheetsClient([{ 'Ad Archive ID': AD_ID }])
  await assert.rejects(
    () => revertAdRow('does-not-exist', AD_COLUMNS.map(() => ''), { getClientFn: () => fake }),
    (err) => {
      assert.equal(err.notFound, true)
      return true
    }
  )
})

test('deleteAdRows: real deletion removes exactly the matched rows and reports notFoundIds for the rest', async () => {
  const fake = makeFakeAdSheetsClient([
    { 'Ad Archive ID': 'keep-me' },
    { 'Ad Archive ID': 'delete-me-1' },
    { 'Ad Archive ID': 'delete-me-2' },
  ])

  const result = await deleteAdRows(['delete-me-1', 'delete-me-2', 'never-existed'], { getClientFn: () => fake })

  assert.equal(result.deleted, 2)
  assert.deepEqual(result.notFoundIds, ['never-existed'])
  assert.equal(fake.rows.length, 1, 'exactly the 2 matched rows are actually gone from the sheet')
  assert.equal(fake.rows[0][0], 'keep-me')
})

test('deleteAdRows: deletes both a middle and a later row correctly (descending sort prevents an index-shift bug)', async () => {
  const fake = makeFakeAdSheetsClient([
    { 'Ad Archive ID': 'row-1' },
    { 'Ad Archive ID': 'row-2-delete' },
    { 'Ad Archive ID': 'row-3' },
    { 'Ad Archive ID': 'row-4-delete' },
  ])

  const result = await deleteAdRows(['row-2-delete', 'row-4-delete'], { getClientFn: () => fake })

  assert.equal(result.deleted, 2)
  assert.deepEqual(fake.rows.map((r) => r[0]), ['row-1', 'row-3'])
})

test('deleteAdRows: no matches at all returns deleted:0 and every ID as not found', async () => {
  const fake = makeFakeAdSheetsClient([{ 'Ad Archive ID': 'keep-me' }])
  const result = await deleteAdRows(['nope-1', 'nope-2'], { getClientFn: () => fake })
  assert.deepEqual(result, { deleted: 0, notFoundIds: ['nope-1', 'nope-2'] })
})

test('getAllAds: real read maps every row into an AD_COLUMNS-shaped object', async () => {
  const fake = makeFakeAdSheetsClient([
    { 'Ad Archive ID': AD_ID, 'Brand': '테스트브랜드', 'Status': '게재중' },
  ])

  const ads = await getAllAds({ getClientFn: () => fake })

  assert.equal(ads.length, 1)
  assert.equal(ads[0]['Ad Archive ID'], AD_ID)
  assert.equal(ads[0]['Brand'], '테스트브랜드')
  assert.equal(ads[0]['Status'], '게재중')
  // Every AD_COLUMNS key is present, blank-defaulted, not just the ones
  // that happened to have a real value.
  assert.equal('Search Keyword' in ads[0], true)
})
