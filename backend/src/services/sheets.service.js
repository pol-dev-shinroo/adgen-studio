import { google } from 'googleapis'
import { config } from '../config/index.js'
import { getAuthClient } from './google.client.js'
import { AD_COLUMNS, toRow } from '../mappers/ad.mapper.js'

let sheetsClient = null

function getClient() {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: 'v4', auth: getAuthClient() })
  }
  return sheetsClient
}

const LAST_COLUMN = 'V' // 22 columns, A..V

function tabRange(cells) {
  return `'${config.sheetTabName}'!${cells}`
}

// Upserts mapped ads into the sheet, matching on the "Ad Archive ID" column:
// known IDs get their row overwritten in place, unknown ones are appended.
export async function upsertAdRows(mappedAds) {
  const sheets = getClient()

  const idColumn = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange('A:A'),
  })
  const columnA = idColumn.data.values || []
  const sheetIsEmpty = columnA.length === 0

  // Row numbers are 1-based and row 1 is the header.
  const idToRowNumber = new Map()
  columnA.slice(1).forEach((cells, i) => {
    const id = String(cells?.[0] ?? '').trim()
    if (id && !idToRowNumber.has(id)) idToRowNumber.set(id, i + 2)
  })

  const updates = []
  const appends = []
  const appendIndexById = new Map() // dedupe same-ID rows within one batch: last one wins

  for (const ad of mappedAds) {
    const row = toRow(ad)
    const id = String(ad['Ad Archive ID'] ?? '').trim()
    const existingRow = id ? idToRowNumber.get(id) : undefined

    if (existingRow) {
      updates.push({ range: tabRange(`A${existingRow}:${LAST_COLUMN}${existingRow}`), values: [row] })
    } else if (id && appendIndexById.has(id)) {
      appends[appendIndexById.get(id)] = row
    } else {
      if (id) appendIndexById.set(id, appends.length)
      appends.push(row)
    }
  }

  if (sheetIsEmpty) appends.unshift([...AD_COLUMNS])

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.sheetId,
      requestBody: { valueInputOption: 'RAW', data: updates },
    })
  }
  if (appends.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.sheetId,
      range: tabRange(`A:${LAST_COLUMN}`),
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: appends },
    })
  }

  return {
    updated: updates.length,
    appended: appends.length - (sheetIsEmpty ? 1 : 0),
  }
}

// Reads every archived ad row and converts each to an object keyed by
// AD_COLUMNS (same shape mapAd() produces), for the frontend feed.
export async function getAllAds() {
  const sheets = getClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  })
  const rows = res.data.values || []
  return rows.slice(1).map((cells) => (
    Object.fromEntries(AD_COLUMNS.map((column, i) => [column, cells[i] ?? '']))
  ))
}
