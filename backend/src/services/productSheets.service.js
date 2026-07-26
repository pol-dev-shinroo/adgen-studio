import { config } from '../config/index.js'
import { PRODUCT_COLUMNS, toRow } from '../mappers/product.mapper.js'
import { getClient, callSheets, makeTabRange } from './sheetsBase.js'

// Same spreadsheet as the ad-collection sheet (config.sheetId), a separate
// tab within it — tidier than a second spreadsheet ID/credential surface for
// what's still just "one client's data", and this app already has a
// tab-name-vs-spreadsheet-ID split (SHEET_TAB_NAME) for the ad tab.
const PRODUCT_TAB_NAME = '제품'
const LAST_COLUMN = 'L' // 12 columns, A..L

const tabRange = makeTabRange(PRODUCT_TAB_NAME)

// Unlike the ad tab (created manually up front), the product tab is new
// with this feature, so it's created on first use — same lazy-create,
// cached-promise pattern as sheets.service.js's getSheetGid.
let ensureTabPromise = null
function ensureProductTab() {
  if (!ensureTabPromise) {
    ensureTabPromise = (async () => {
      const sheets = getClient()
      const meta = await callSheets(() => sheets.spreadsheets.get({ spreadsheetId: config.sheetId }))
      const exists = meta.data.sheets.some((s) => s.properties.title === PRODUCT_TAB_NAME)
      if (exists) return

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
    })()
  }
  return ensureTabPromise
}

// Upserts by Product ID: known IDs get their row overwritten in place,
// unknown ones are appended. Unlike upsertAdRows, there's no human review
// step for products, so every row is just written as-is — no new/updated/
// unchanged diff to compute.
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
      updates.push({ range: tabRange(`A${existingRowNumber}:${LAST_COLUMN}${existingRowNumber}`), values: [row] })
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
