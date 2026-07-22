// One-time migration: upgrades the existing sheet from the 20-column layout
// to 22 columns by inserting "Archived Image Links" and "Archived Thumbnail"
// right after "Image Links" (column N), shifting existing data right so old
// rows stay aligned, then rewriting the header row. Idempotent: exits early
// if the header already matches the 22-column layout.
//
// Usage: node scripts/migrate-sheet-22cols.js

import { google } from 'googleapis'
import { config } from '../src/config/index.js'
import { getAuthClient } from '../src/services/google.client.js'
import { AD_COLUMNS } from '../src/mappers/ad.mapper.js'

const sheets = google.sheets({ version: 'v4', auth: getAuthClient() })

const meta = await sheets.spreadsheets.get({ spreadsheetId: config.sheetId })
const tab = meta.data.sheets.find((s) => s.properties.title === config.sheetTabName)
if (!tab) {
  console.error(`Tab "${config.sheetTabName}" not found in spreadsheet.`)
  process.exit(1)
}
const numericSheetId = tab.properties.sheetId

const headerRes = await sheets.spreadsheets.values.get({
  spreadsheetId: config.sheetId,
  range: `'${config.sheetTabName}'!1:1`,
})
const header = headerRes.data.values?.[0] ?? []

if (header.length === AD_COLUMNS.length && header[14] === 'Archived Image Links') {
  console.log('Header already has the 22-column layout — nothing to do.')
  process.exit(0)
}
if (header.length > 0 && header[13] !== 'Image Links') {
  console.error(
    `Refusing to migrate: expected "Image Links" in column N, found "${header[13] ?? '(empty)'}". ` +
    'Check the sheet layout manually.'
  )
  process.exit(1)
}

// Insert two empty columns at O and P (0-based index 14), shifting the old
// O..T (Video Link .. Page ID) right to Q..V.
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: config.sheetId,
  requestBody: {
    requests: [{
      insertDimension: {
        range: { sheetId: numericSheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 16 },
        inheritFromBefore: false,
      },
    }],
  },
})

await sheets.spreadsheets.values.update({
  spreadsheetId: config.sheetId,
  range: `'${config.sheetTabName}'!A1:V1`,
  valueInputOption: 'RAW',
  requestBody: { values: [[...AD_COLUMNS]] },
})

console.log('Migrated: inserted columns O/P and rewrote the header to 22 columns (A..V).')
