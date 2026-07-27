import { config } from '../config/index.js'
import { getClient, callSheets, makeTabRange, columnLetter } from './sheetsBase.js'

// Cafe24 access tokens expire in ~2 hours and the refresh token itself
// rotates (and expires in ~2 weeks) on every use, so this can't just live
// in a local file the way it used to — the backend now runs on Railway,
// whose container filesystem is ephemeral (wiped on every redeploy), and a
// local file also can't be written to by whoever completes the OAuth
// consent in their own browser, a different machine entirely. Same sheet
// the rest of the app already uses, new tab, one row per brand key.
const TOKEN_TAB_NAME = 'cafe24_tokens'
const TOKEN_COLUMNS = ['Brand Key', 'Access Token', 'Refresh Token', 'Expires At', 'Refresh Expires At', 'Updated At']
const LAST_COLUMN = 'F' // 6 columns, A..F

const tabRange = makeTabRange(TOKEN_TAB_NAME)

// Lazy-create + header-migration-safe, same pattern as productSheets
// .service.js's ensureProductTab / generatedSheets.service.js's
// ensureGeneratedTab.
let ensureTabPromise = null
function ensureTokenTab() {
  if (!ensureTabPromise) {
    ensureTabPromise = (async () => {
      const sheets = getClient()
      const meta = await callSheets(() => sheets.spreadsheets.get({ spreadsheetId: config.sheetId }))
      const exists = meta.data.sheets.some((s) => s.properties.title === TOKEN_TAB_NAME)

      if (!exists) {
        await callSheets(() => sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.sheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: TOKEN_TAB_NAME } } }] },
        }))
        await callSheets(() => sheets.spreadsheets.values.update({
          spreadsheetId: config.sheetId,
          range: tabRange(`A1:${LAST_COLUMN}1`),
          valueInputOption: 'RAW',
          requestBody: { values: [[...TOKEN_COLUMNS]] },
        }))
        return
      }

      const headerRes = await callSheets(() => sheets.spreadsheets.values.get({
        spreadsheetId: config.sheetId,
        range: tabRange(`A1:${LAST_COLUMN}1`),
      }))
      const existingHeader = headerRes.data.values?.[0] || []
      if (existingHeader.length < TOKEN_COLUMNS.length) {
        const missingHeaders = TOKEN_COLUMNS.slice(existingHeader.length)
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

function rowToEntry(cells) {
  return {
    accessToken: cells[1] || '',
    refreshToken: cells[2] || '',
    expiresAt: cells[3] ? Number(cells[3]) : null,
    refreshExpiresAt: cells[4] ? Number(cells[4]) : null,
  }
}

// Returns { accessToken, refreshToken, expiresAt, refreshExpiresAt } or
// null if this brand has never completed the auth flow.
export async function getTokenEntry(brandKey) {
  await ensureTokenTab()
  const sheets = getClient()
  const res = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  }))
  const rows = res.data.values || []
  const row = rows.slice(1).find((cells) => String(cells?.[0] ?? '').trim() === brandKey)
  return row ? rowToEntry(row) : null
}

// Upserts by Brand Key: an existing row is overwritten in place, a new
// brand's first auth appends a row. Only one row per brand key ever exists.
export async function saveTokenEntry(brandKey, entry) {
  await ensureTokenTab()
  const sheets = getClient()
  const res = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  }))
  const rows = res.data.values || []
  const rowIndex = rows.slice(1).findIndex((cells) => String(cells?.[0] ?? '').trim() === brandKey)

  const row = [
    brandKey,
    entry.accessToken,
    entry.refreshToken,
    String(entry.expiresAt ?? ''),
    String(entry.refreshExpiresAt ?? ''),
    new Date().toISOString(),
  ]

  if (rowIndex === -1) {
    await callSheets(() => sheets.spreadsheets.values.append({
      spreadsheetId: config.sheetId,
      range: tabRange(`A:${LAST_COLUMN}`),
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    }))
  } else {
    const rowNumber = rowIndex + 2 // +1 for the header row, +1 to convert 0-based to 1-based
    await callSheets(() => sheets.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: tabRange(`A${rowNumber}:${LAST_COLUMN}${rowNumber}`),
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    }))
  }
}
