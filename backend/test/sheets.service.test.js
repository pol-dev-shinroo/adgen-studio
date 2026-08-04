import test from 'node:test'
import assert from 'node:assert/strict'
import { AD_COLUMNS, SYNC_COLUMNS } from '../src/mappers/ad.mapper.js'
import { upsertAdRows } from '../src/services/sheets.service.js'

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

const AD_ID = '1234567890'
const REAL_EXTRACTED_REFERENCE = JSON.stringify({
  imageUrl: 'https://drive.google.com/file/d/real-extraction/view',
  extractedAt: '2026-08-04T00:00:00.000Z',
})

function buildExistingRow() {
  const values = {
    'Ad Archive ID': AD_ID,
    'Brand': '테스트브랜드',
    'Status': '게재중',
    'Search Keyword': 'test',
    'Extracted Reference JSON': REAL_EXTRACTED_REFERENCE,
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

test('upsertAdRows never writes into the Extracted Reference JSON column when updating an existing row', async () => {
  const captured = {}
  const fakeSheets = makeFakeSheets({ existingRow: buildExistingRow(), captured })
  // A real sync-column change (Status flips) so this is genuinely an
  // 'updated' row, not just exercising the unchanged path.
  const mappedAd = buildMappedAd({ Status: '종료' })

  const result = await upsertAdRows([mappedAd], { getClientFn: () => fakeSheets })

  assert.ok(captured.batchUpdate, 'expected an update, not an append, since the Ad Archive ID matched an existing row')
  const update = captured.batchUpdate.data[0]

  assert.doesNotMatch(update.range, /W\d+$/, 'the write range must not reach the Extracted Reference JSON column (W)')
  assert.match(update.range, /V\d+$/, 'the write range should end at the last sync column (V)')
  assert.equal(
    update.values[0].length, SYNC_COLUMNS.length,
    'the write payload must not include a 23rd value that could blank the extracted-reference column'
  )

  const status = result.statuses.find((s) => s.adArchiveId === AD_ID)
  assert.equal(status.status, 'updated')
  assert.ok(
    !status.changedFields.includes('Extracted Reference JSON'),
    'the diff must never flag the extracted-reference column as changed — comparing it would always spuriously differ'
  )
})

test('upsertAdRows leaves a real extracted-reference value in the sheet completely alone on an unrelated resync', async () => {
  const captured = {}
  const fakeSheets = makeFakeSheets({ existingRow: buildExistingRow(), captured })
  // Identical to the existing row's sync columns — nothing about the ad
  // actually changed, only Date Scraped (diff-ignored) differs.
  const mappedAd = buildMappedAd({ Status: '게재중' })

  await upsertAdRows([mappedAd], { getClientFn: () => fakeSheets })

  const update = captured.batchUpdate.data[0]
  // The write payload never even contains the real extraction value or a
  // blank in its place — the range itself stops one column short of it.
  assert.equal(update.values[0].length, SYNC_COLUMNS.length)
  assert.ok(!update.values[0].includes(REAL_EXTRACTED_REFERENCE))
})

test('upsertAdRows still writes brand-new rows at full width, extracted-reference column included', async () => {
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
