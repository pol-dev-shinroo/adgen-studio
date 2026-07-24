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

// 0 -> A, 1 -> B, ... 25 -> Z. AD_COLUMNS is 22 wide, well within single-letter range.
function columnLetter(index) {
  return String.fromCharCode(65 + index)
}

// Columns excluded from the changed/unchanged diff below. "Date Scraped"
// always differs by design (that's the point of it). "Image Links" /
// "Video Link" / "Video Thumbnail" hold raw Facebook CDN URLs, which are
// signed and get re-signed with a new query string on every single scrape
// regardless of whether the underlying creative changed at all — verified
// empirically (re-collecting the same keyword twice, same day, showed 100%
// "updated" with only those columns in changedFields). The Drive-hosted
// "Archived ..." counterparts are the stable, meaningful ones and stay in
// the comparison.
const DIFF_IGNORED_COLUMNS = new Set(['Date Scraped', 'Image Links', 'Video Link', 'Video Thumbnail'])
const DIFF_IGNORED_INDEXES = new Set([...DIFF_IGNORED_COLUMNS].map((c) => AD_COLUMNS.indexOf(c)))

// Upserts mapped ads into the sheet, matching on the "Ad Archive ID" column:
// known IDs get their row overwritten in place, unknown ones are appended.
// Every matched row is written regardless (so Date Scraped always refreshes
// to show "last verified"), but each is classified new/updated/unchanged by
// comparing the incoming row to what was already there, ignoring the columns
// above.
export async function upsertAdRows(mappedAds) {
  const sheets = getClient()

  const existingRes = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  })
  const existingRows = existingRes.data.values || []
  const sheetIsEmpty = existingRows.length === 0

  // Row numbers are 1-based and row 1 is the header.
  const idToRowNumber = new Map()
  const idToExistingValues = new Map()
  existingRows.slice(1).forEach((cells, i) => {
    const id = String(cells?.[0] ?? '').trim()
    if (id && !idToRowNumber.has(id)) {
      idToRowNumber.set(id, i + 2)
      idToExistingValues.set(id, cells)
    }
  })

  const updates = []
  const appends = []
  const appendIndexById = new Map() // dedupe same-ID rows within one batch: last one wins
  const statuses = []

  for (const ad of mappedAds) {
    const row = toRow(ad)
    const id = String(ad['Ad Archive ID'] ?? '').trim()
    const existingRowNumber = id ? idToRowNumber.get(id) : undefined

    if (existingRowNumber) {
      updates.push({ range: tabRange(`A${existingRowNumber}:${LAST_COLUMN}${existingRowNumber}`), values: [row] })

      const existingValues = idToExistingValues.get(id) || []
      const changedFields = AD_COLUMNS.filter((column, i) => {
        if (DIFF_IGNORED_INDEXES.has(i)) return false
        return String(existingValues[i] ?? '') !== String(row[i] ?? '')
      })
      statuses.push({
        adArchiveId: id,
        status: changedFields.length > 0 ? 'updated' : 'unchanged',
        changedFields,
      })
    } else if (id && appendIndexById.has(id)) {
      appends[appendIndexById.get(id)] = row
    } else {
      if (id) appendIndexById.set(id, appends.length)
      appends.push(row)
      statuses.push({ adArchiveId: id, status: 'new', changedFields: [] })
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
    appended: appends.length - (sheetIsEmpty ? 1 : 0),
    updated: statuses.filter((s) => s.status === 'updated').length,
    unchanged: statuses.filter((s) => s.status === 'unchanged').length,
    statuses,
  }
}

// Updates a single cell for the row matching adArchiveId, found the same
// way upsertAdRows matches rows (scan column A). Throws with `.notFound =
// true` if no row has that Ad Archive ID.
export async function updateAdField(adArchiveId, columnName, value) {
  const sheets = getClient()
  const columnIndex = AD_COLUMNS.indexOf(columnName)
  if (columnIndex === -1) {
    throw new Error(`Unknown column "${columnName}"`)
  }

  const idColumn = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange('A:A'),
  })
  const columnA = idColumn.data.values || []
  const rowNumber = columnA.findIndex((cells) => String(cells?.[0] ?? '').trim() === String(adArchiveId).trim())
  if (rowNumber < 1) { // -1 (not found) or 0 (the header row) both count as not found
    const err = new Error(`No row found for Ad Archive ID "${adArchiveId}"`)
    err.notFound = true
    throw err
  }

  const letter = columnLetter(columnIndex)
  const range = tabRange(`${letter}${rowNumber + 1}:${letter}${rowNumber + 1}`)
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.sheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  })
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
