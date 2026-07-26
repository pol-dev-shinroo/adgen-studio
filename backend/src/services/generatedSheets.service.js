import { config } from '../config/index.js'
import { GENERATED_AD_COLUMNS, toRow } from '../mappers/generatedAd.mapper.js'
import { getClient, callSheets, makeTabRange, columnLetter } from './sheetsBase.js'

// New tab, same sheet as the ad-collection/product tabs — same
// one-spreadsheet-many-tabs convention as productSheets.service.js.
const GENERATED_TAB_NAME = '생성결과'
const LAST_COLUMN = 'I' // 9 columns, A..I

const tabRange = makeTabRange(GENERATED_TAB_NAME)

// Lazy-create + header-migration-safe, same pattern as productSheets
// .service.js's ensureProductTab — this tab is brand new, so today that
// only ever hits the "create from scratch" branch, but the migration branch
// is kept for the same reason it was worth adding there: a future column
// addition to GENERATED_AD_COLUMNS should extend the header in place rather
// than require a manual migration script.
let ensureTabPromise = null
function ensureGeneratedTab() {
  if (!ensureTabPromise) {
    ensureTabPromise = (async () => {
      const sheets = getClient()
      const meta = await callSheets(() => sheets.spreadsheets.get({ spreadsheetId: config.sheetId }))
      const exists = meta.data.sheets.some((s) => s.properties.title === GENERATED_TAB_NAME)

      if (!exists) {
        await callSheets(() => sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.sheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: GENERATED_TAB_NAME } } }] },
        }))
        await callSheets(() => sheets.spreadsheets.values.update({
          spreadsheetId: config.sheetId,
          range: tabRange(`A1:${LAST_COLUMN}1`),
          valueInputOption: 'RAW',
          requestBody: { values: [[...GENERATED_AD_COLUMNS]] },
        }))
        return
      }

      const headerRes = await callSheets(() => sheets.spreadsheets.values.get({
        spreadsheetId: config.sheetId,
        range: tabRange(`A1:${LAST_COLUMN}1`),
      }))
      const existingHeader = headerRes.data.values?.[0] || []
      if (existingHeader.length < GENERATED_AD_COLUMNS.length) {
        const missingHeaders = GENERATED_AD_COLUMNS.slice(existingHeader.length)
        const startColumn = columnLetter(existingHeader.length)
        await callSheets(() => sheets.spreadsheets.values.update({
          spreadsheetId: config.sheetId,
          range: tabRange(`${startColumn}1:${LAST_COLUMN}1`),
          valueInputOption: 'RAW',
          requestBody: { values: [missingHeaders] },
        }))
      }
    })()
  }
  return ensureTabPromise
}

// One row per rendered image, appended as each finishes rendering (not
// batched) — generation.service.js's job loop calls this once per
// format x quantity combination as results come in.
export async function appendGeneratedRow(mappedGeneratedAd) {
  await ensureGeneratedTab()
  const sheets = getClient()
  await callSheets(() => sheets.spreadsheets.values.append({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [toRow(mappedGeneratedAd)] },
  }))
}

export async function getAllGeneratedResults() {
  await ensureGeneratedTab()
  const sheets = getClient()
  const res = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  }))
  const rows = res.data.values || []
  return rows.slice(1).map((cells) => (
    Object.fromEntries(GENERATED_AD_COLUMNS.map((column, i) => [column, cells[i] ?? '']))
  ))
}

// Updates just the Status cell for one row, found by Generation ID — same
// mechanism as sheets.service.js's updateAdField/productSheets.service.js's
// updateProductField.
export async function updateGeneratedStatus(generationId, status) {
  await ensureGeneratedTab()
  const sheets = getClient()

  const idColumn = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange('A:A'),
  }))
  const columnA = idColumn.data.values || []
  const rowNumber = columnA.findIndex((cells) => String(cells?.[0] ?? '').trim() === String(generationId).trim())
  if (rowNumber < 1) {
    const err = new Error(`No row found for Generation ID "${generationId}"`)
    err.notFound = true
    throw err
  }

  const letter = columnLetter(GENERATED_AD_COLUMNS.indexOf('Status'))
  const range = tabRange(`${letter}${rowNumber + 1}:${letter}${rowNumber + 1}`)
  await callSheets(() => sheets.spreadsheets.values.update({
    spreadsheetId: config.sheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[status]] },
  }))
}
