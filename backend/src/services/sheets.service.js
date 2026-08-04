import { config } from '../config/index.js'
import { AD_COLUMNS, SYNC_COLUMNS, toRow } from '../mappers/ad.mapper.js'
import { getClient, callSheets, makeTabRange, columnLetter } from './sheetsBase.js'

const LAST_COLUMN = 'X' // 24 columns (22 sync + 1 extracted-reference [Part N] + 1 extracted-copy [Part O]), A..X
// 'V' — resync writes never touch anything past this, no matter how many
// extraction-owned columns follow it. Derived from SYNC_COLUMNS.length, not
// hardcoded against today's specific column count, so adding a THIRD
// extraction-owned column later needs zero changes to upsertAdRows itself
// — this is the Part N-2 lesson applied proactively, not just fixed once.
const SYNC_LAST_COLUMN = columnLetter(SYNC_COLUMNS.length - 1)

const tabRange = makeTabRange(config.sheetTabName)

// Unlike productSheets.service.js's ensureProductTab, this tab was created
// manually up front (see PROGRESS.md) rather than lazily by this app, so
// there's never a "does the tab exist" branch here — only the header
// *migration* case: the live sheet's header row predates Part N's
// Extracted Reference JSON column, so an existing-but-stale header needs
// its missing trailing cell(s) filled in. Cached the same way
// ensureProductTab's promise is, so this only ever does real work once per
// process. A genuinely empty sheet (0 rows, including no header) is left
// alone here — upsertAdRows already handles that case itself by
// prepending a full header via appends.unshift([...AD_COLUMNS]).
let ensureHeaderPromise = null
function ensureAdSheetHeader() {
  if (!ensureHeaderPromise) {
    ensureHeaderPromise = (async () => {
      const sheets = getClient()
      const headerRes = await callSheets(() => sheets.spreadsheets.values.get({
        spreadsheetId: config.sheetId,
        range: tabRange(`A1:${LAST_COLUMN}1`),
      }))
      const existingHeader = headerRes.data.values?.[0] || []
      if (existingHeader.length > 0 && existingHeader.length < AD_COLUMNS.length) {
        const missingHeaders = AD_COLUMNS.slice(existingHeader.length)
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
  return ensureHeaderPromise
}

// The tab's internal numeric sheetId (gid) — needed for deleteDimension
// requests, which address sheets by gid, not by name. Fetched once and
// cached, same pattern as drive.service.js's root folder ID.
let sheetGidPromise = null
function getSheetGid() {
  if (!sheetGidPromise) {
    sheetGidPromise = (async () => {
      const sheets = getClient()
      const meta = await callSheets(() => sheets.spreadsheets.get({ spreadsheetId: config.sheetId }))
      const tab = meta.data.sheets.find((s) => s.properties.title === config.sheetTabName)
      if (!tab) throw new Error(`Tab "${config.sheetTabName}" not found in spreadsheet.`)
      return tab.properties.sheetId
    })()
  }
  return sheetGidPromise
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
//
// Existing rows are deliberately restricted to A..SYNC_LAST_COLUMN, not the
// full A..LAST_COLUMN range — same reasoning and same fix as
// productSheets.service.js's upsertProductRows: mapAd() never sets
// Extracted Reference JSON (see ad.mapper.js), so a full-row overwrite on
// every resync would silently blank out a real, paid-for ad-reference
// extraction the moment that ad gets re-scraped (a completely normal
// 실시간 수집 re-run for the same keyword). New appends don't need this care
// — a brand-new row has no extraction data yet to protect. The
// changedFields diff below is restricted to SYNC_COLUMNS for the same
// reason: comparing the incoming row's always-blank Extracted Reference
// JSON slot against whatever real value already sits in the sheet would
// spuriously flag every previously-extracted ad as "updated" on every
// single resync, even when nothing about the ad itself changed.
// getClientFn is injected (defaulting to the real getClient) purely so this
// can be unit-tested against a fake Sheets client without hitting Google —
// same DI convention as generation.service.js's prepareInputs.
export async function upsertAdRows(mappedAds, { getClientFn = getClient } = {}) {
  const sheets = getClientFn()

  const existingRes = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  }))
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
      const syncOnlyRow = row.slice(0, SYNC_COLUMNS.length)
      updates.push({
        range: tabRange(`A${existingRowNumber}:${SYNC_LAST_COLUMN}${existingRowNumber}`),
        values: [syncOnlyRow],
      })

      const existingValues = idToExistingValues.get(id) || []
      const changedFields = SYNC_COLUMNS.filter((column, i) => {
        if (DIFF_IGNORED_INDEXES.has(i)) return false
        return String(existingValues[i] ?? '') !== String(syncOnlyRow[i] ?? '')
      })
      const isUpdated = changedFields.length > 0
      statuses.push({
        adArchiveId: id,
        status: isUpdated ? 'updated' : 'unchanged',
        changedFields,
        // Only 'updated' needs this — by the time a user reviews the
        // collection, the sheet already holds the new values, so the old
        // ones would otherwise be gone if they want to revert this one ad.
        // Padded to the full column count: Sheets omits trailing empty
        // cells from a row's returned values, and a short array here would
        // leave stale trailing columns untouched on revert instead of
        // clearing them back to empty.
        ...(isUpdated ? { previousValues: AD_COLUMNS.map((_, i) => existingValues[i] ?? '') } : {}),
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
  await ensureAdSheetHeader()
  const sheets = getClient()
  const columnIndex = AD_COLUMNS.indexOf(columnName)
  if (columnIndex === -1) {
    throw new Error(`Unknown column "${columnName}"`)
  }

  const idColumn = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange('A:A'),
  }))
  const columnA = idColumn.data.values || []
  const rowNumber = columnA.findIndex((cells) => String(cells?.[0] ?? '').trim() === String(adArchiveId).trim())
  if (rowNumber < 1) { // -1 (not found) or 0 (the header row) both count as not found
    const err = new Error(`No row found for Ad Archive ID "${adArchiveId}"`)
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

// Same row-lookup as updateAdField, but writes multiple columns in one
// Sheets API call (values.batchUpdate) instead of one round-trip per field
// — used by adImageExtraction.service.js to write both extraction-owned
// columns (Extracted Reference JSON + Extracted Copy JSON) from one
// extraction action without scanning column A twice. Mirrors
// productSheets.service.js's updateProductFields exactly. fieldsObj:
// { [columnName]: value }; columns aren't assumed contiguous.
export async function updateAdFields(adArchiveId, fieldsObj) {
  await ensureAdSheetHeader()
  const sheets = getClient()

  const idColumn = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange('A:A'),
  }))
  const columnA = idColumn.data.values || []
  const rowNumber = columnA.findIndex((cells) => String(cells?.[0] ?? '').trim() === String(adArchiveId).trim())
  if (rowNumber < 1) {
    const err = new Error(`No row found for Ad Archive ID "${adArchiveId}"`)
    err.notFound = true
    throw err
  }

  const data = Object.entries(fieldsObj).map(([columnName, value]) => {
    const columnIndex = AD_COLUMNS.indexOf(columnName)
    if (columnIndex === -1) {
      throw new Error(`Unknown column "${columnName}"`)
    }
    const letter = columnLetter(columnIndex)
    return {
      range: tabRange(`${letter}${rowNumber + 1}:${letter}${rowNumber + 1}`),
      values: [[value]],
    }
  })

  if (data.length === 0) return

  await callSheets(() => sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.sheetId,
    requestBody: { valueInputOption: 'RAW', data },
  }))
}

// Restores a whole row to previousValues (as captured on an 'updated'
// status entry from upsertAdRows), found the same way updateAdField finds
// a row. Same mechanism as updateAdField, just the full A:LAST_COLUMN
// range instead of one cell.
export async function revertAdRow(adArchiveId, previousValues) {
  const sheets = getClient()

  const idColumn = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange('A:A'),
  }))
  const columnA = idColumn.data.values || []
  const rowNumber = columnA.findIndex((cells) => String(cells?.[0] ?? '').trim() === String(adArchiveId).trim())
  if (rowNumber < 1) {
    const err = new Error(`No row found for Ad Archive ID "${adArchiveId}"`)
    err.notFound = true
    throw err
  }

  const range = tabRange(`A${rowNumber + 1}:${LAST_COLUMN}${rowNumber + 1}`)
  await callSheets(() => sheets.spreadsheets.values.update({
    spreadsheetId: config.sheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [previousValues] },
  }))
}

// Actually removes rows (not just clears their values) for the given Ad
// Archive IDs, found the same way upsertAdRows/updateAdField match rows
// (scan column A). Row numbers are sorted descending before building the
// batch so deleting a later row never shifts the index of an earlier one
// still queued for deletion in the same request.
export async function deleteAdRows(adArchiveIds) {
  const sheets = getClient()
  const gid = await getSheetGid()

  const idColumn = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange('A:A'),
  }))
  const columnA = idColumn.data.values || []

  const idsToDelete = new Set(adArchiveIds.map((id) => String(id).trim()))
  const foundIds = new Set()
  const rowNumbers = [] // 1-based, matching columnA's own indexing

  columnA.forEach((cells, i) => {
    const id = String(cells?.[0] ?? '').trim()
    if (id && idsToDelete.has(id)) {
      rowNumbers.push(i + 1)
      foundIds.add(id)
    }
  })

  const notFoundIds = [...idsToDelete].filter((id) => !foundIds.has(id))
  if (rowNumbers.length === 0) return { deleted: 0, notFoundIds }

  rowNumbers.sort((a, b) => b - a) // descending

  const requests = rowNumbers.map((rowNumber) => ({
    deleteDimension: {
      range: {
        sheetId: gid,
        dimension: 'ROWS',
        startIndex: rowNumber - 1, // deleteDimension row indexes are 0-based
        endIndex: rowNumber,
      },
    },
  }))

  await callSheets(() => sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.sheetId,
    requestBody: { requests },
  }))

  return { deleted: rowNumbers.length, notFoundIds }
}

// Reads every archived ad row and converts each to an object keyed by
// AD_COLUMNS (same shape mapAd() produces), for the frontend feed.
export async function getAllAds() {
  await ensureAdSheetHeader()
  const sheets = getClient()
  const res = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  }))
  const rows = res.data.values || []
  return rows.slice(1).map((cells) => (
    Object.fromEntries(AD_COLUMNS.map((column, i) => [column, cells[i] ?? '']))
  ))
}
