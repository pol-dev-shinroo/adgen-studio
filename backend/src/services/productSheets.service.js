import { config } from '../config/index.js'
import { PRODUCT_COLUMNS, SYNC_COLUMNS, toRow } from '../mappers/product.mapper.js'
import { getClient, callSheets, makeTabRange, columnLetter } from './sheetsBase.js'

// Same spreadsheet as the ad-collection sheet (config.sheetId), a separate
// tab within it — tidier than a second spreadsheet ID/credential surface for
// what's still just "one client's data", and this app already has a
// tab-name-vs-spreadsheet-ID split (SHEET_TAB_NAME) for the ad tab.
const PRODUCT_TAB_NAME = '제품'
const LAST_COLUMN = 'N' // 14 columns (12 sync + 2 extraction), A..N
const SYNC_LAST_COLUMN = columnLetter(SYNC_COLUMNS.length - 1) // 'L' — resync writes never touch the extraction columns past this

const tabRange = makeTabRange(PRODUCT_TAB_NAME)

// Unlike the ad tab (created manually up front), the product tab is new
// with this feature, so it's created on first use — same lazy-create,
// cached-promise pattern as sheets.service.js's getSheetGid. Also handles
// the header *migration* case: the live sheet already had a 12-column
// header + 4 real rows before EXTRACTION_COLUMNS was appended to
// PRODUCT_COLUMNS, so an existing-but-stale header needs its missing
// trailing cells filled in, not just a "tab already exists, skip" check.
let ensureTabPromise = null
function ensureProductTab() {
  if (!ensureTabPromise) {
    ensureTabPromise = (async () => {
      const sheets = getClient()
      const meta = await callSheets(() => sheets.spreadsheets.get({ spreadsheetId: config.sheetId }))
      const exists = meta.data.sheets.some((s) => s.properties.title === PRODUCT_TAB_NAME)

      if (!exists) {
        await callSheets(() => sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.sheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: PRODUCT_TAB_NAME } } }] },
        }))
        await callSheets(() => sheets.spreadsheets.values.update({
          spreadsheetId: config.sheetId,
          range: tabRange(`A1:${LAST_COLUMN}1`),
          valueInputOption: 'RAW',
          requestBody: { values: [[...PRODUCT_COLUMNS]] },
        }))
        return
      }

      const headerRes = await callSheets(() => sheets.spreadsheets.values.get({
        spreadsheetId: config.sheetId,
        range: tabRange(`A1:${LAST_COLUMN}1`),
      }))
      const existingHeader = headerRes.data.values?.[0] || []
      if (existingHeader.length < PRODUCT_COLUMNS.length) {
        const missingHeaders = PRODUCT_COLUMNS.slice(existingHeader.length)
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

// Upserts by Product ID: known IDs get their sync-owned columns (A..L)
// overwritten in place, unknown ones are appended in full. Unlike
// upsertAdRows, there's no human review step for products, so every row is
// just written as-is — no new/updated/unchanged diff to compute.
//
// Existing rows are deliberately restricted to A..SYNC_LAST_COLUMN rather
// than the full A..LAST_COLUMN range: mapProduct() never sets Extracted
// Image URL/Extracted At (see product.mapper.js), so a full-row overwrite
// on every resync would silently blank out image-extraction results the
// moment a product's data changes upstream. New appends don't need this
// care — a brand-new row has no extraction data yet to protect.
export async function upsertProductRows(mappedProducts) {
  await ensureProductTab()
  const sheets = getClient()

  const existingRes = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  }))
  const existingRows = existingRes.data.values || []

  const idToRowNumber = new Map() // 1-based, row 1 is the header
  existingRows.slice(1).forEach((cells, i) => {
    const id = String(cells?.[0] ?? '').trim()
    if (id && !idToRowNumber.has(id)) idToRowNumber.set(id, i + 2)
  })

  const updates = []
  const appends = []
  const appendIndexById = new Map() // dedupe same-ID rows within one batch: last one wins

  for (const product of mappedProducts) {
    const row = toRow(product)
    const id = String(product['Product ID'] ?? '').trim()
    const existingRowNumber = id ? idToRowNumber.get(id) : undefined

    if (existingRowNumber) {
      const syncOnlyRow = row.slice(0, SYNC_COLUMNS.length)
      updates.push({
        range: tabRange(`A${existingRowNumber}:${SYNC_LAST_COLUMN}${existingRowNumber}`),
        values: [syncOnlyRow],
      })
    } else if (id && appendIndexById.has(id)) {
      appends[appendIndexById.get(id)] = row
    } else {
      if (id) appendIndexById.set(id, appends.length)
      appends.push(row)
    }
  }

  if (updates.length > 0) {
    await callSheets(() => sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.sheetId,
      requestBody: { valueInputOption: 'RAW', data: updates },
    }))
  }
  if (appends.length > 0) {
    await callSheets(() => sheets.spreadsheets.values.append({
      spreadsheetId: config.sheetId,
      range: tabRange(`A:${LAST_COLUMN}`),
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: appends },
    }))
  }

  return { updated: updates.length, appended: appends.length }
}

// Updates a single cell for the row matching productId, found the same way
// upsertProductRows matches rows (scan column A). Used by the image-
// extraction path to write Extracted Image URL/Extracted At without a full
// re-upsert. Mirrors sheets.service.js's updateAdField exactly.
export async function updateProductField(productId, columnName, value) {
  await ensureProductTab()
  const sheets = getClient()
  const columnIndex = PRODUCT_COLUMNS.indexOf(columnName)
  if (columnIndex === -1) {
    throw new Error(`Unknown column "${columnName}"`)
  }

  const idColumn = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange('A:A'),
  }))
  const columnA = idColumn.data.values || []
  const rowNumber = columnA.findIndex((cells) => String(cells?.[0] ?? '').trim() === String(productId).trim())
  if (rowNumber < 1) { // -1 (not found) or 0 (the header row) both count as not found
    const err = new Error(`No row found for Product ID "${productId}"`)
    err.notFound = true
    throw err
  }

  const letter = columnLetter(columnIndex)
  const range = tabRange(`${letter}${rowNumber + 1}:${letter}${rowNumber + 1}`)
  await callSheets(() => sheets.spreadsheets.values.update({
    spreadsheetId: config.sheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  }))
}

export async function getAllProducts() {
  await ensureProductTab()
  const sheets = getClient()
  const res = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  }))
  const rows = res.data.values || []
  return rows.slice(1).map((cells) => (
    Object.fromEntries(PRODUCT_COLUMNS.map((column, i) => [column, cells[i] ?? '']))
  ))
}
