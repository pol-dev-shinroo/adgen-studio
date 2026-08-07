import { config, applyCredentialToConfig, MIGRATABLE_CREDENTIAL_KEYS } from '../config/index.js'
import { CREDENTIAL_COLUMNS, mapCredential, toRow } from '../mappers/credentials.mapper.js'
import { getClient, callSheets, makeTabRange, columnLetter } from './sheetsBase.js'
import { encrypt, decrypt } from '../utils/crypto.js'

// Same one-spreadsheet-many-tabs convention every other data type in this
// app already uses. Same "don't cache the tab-exists check across calls"
// choice auth.service.js's Users tab made — every entry point here (a
// credential read on a real request, an admin's Settings-UI edit) is
// low-frequency enough that one extra spreadsheets.get per call is a
// non-issue, and skipping the cache keeps this independently testable
// against a fresh fake Sheets client per test with zero cross-test state
// leakage.
const CREDENTIALS_TAB_NAME = 'Credentials'
const LAST_COLUMN = 'E' // 5 columns, A..E

const tabRange = makeTabRange(CREDENTIALS_TAB_NAME)

async function ensureCredentialsTab(sheets) {
  const meta = await callSheets(() => sheets.spreadsheets.get({ spreadsheetId: config.sheetId }))
  const exists = meta.data.sheets.some((s) => s.properties.title === CREDENTIALS_TAB_NAME)

  if (!exists) {
    await callSheets(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: CREDENTIALS_TAB_NAME } } }] },
    }))
    await callSheets(() => sheets.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: tabRange(`A1:${LAST_COLUMN}1`),
      valueInputOption: 'RAW',
      requestBody: { values: [[...CREDENTIAL_COLUMNS]] },
    }))
    return
  }

  const headerRes = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A1:${LAST_COLUMN}1`),
  }))
  const existingHeader = headerRes.data.values?.[0] || []
  if (existingHeader.length < CREDENTIAL_COLUMNS.length) {
    const missingHeaders = CREDENTIAL_COLUMNS.slice(existingHeader.length)
    const startColumn = columnLetter(existingHeader.length)
    await callSheets(() => sheets.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: tabRange(`${startColumn}1:${LAST_COLUMN}1`),
      valueInputOption: 'RAW',
      requestBody: { values: [missingHeaders] },
    }))
  }
}

async function getAllCredentialRows(sheets) {
  const res = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  }))
  const rows = res.data.values || []
  return rows.slice(1).map((cells) => (
    Object.fromEntries(CREDENTIAL_COLUMNS.map((column, i) => [column, cells[i] ?? '']))
  ))
}

function findRow(rows, key) {
  return rows.find((row) => row['Credential Key'] === key) || null
}

// In-memory decrypted-value cache — getCredential is on the hot path of
// this app's own boot (initCredentialsFromVault reads every migratable key
// once) and, from Part Y onward, effectively every real request that
// touches Apify/Cafe24/OpenAI/Pinecone goes through config.xxx values this
// cache backs — a live Sheets read (plus a decrypt) on every single one of
// those would be both slow and a real rate-limit risk. Invalidated (really:
// overwritten with the fresh value, which is equivalent and saves a
// round-trip) on every successful setCredential, never on a timer — the
// only way a credential's real value changes is through setCredential
// itself, so there's nothing to go stale.
const cache = new Map() // key -> decrypted value

// getClientFn is injected (defaulting to the real getClient) purely so this
// can be unit-tested against a fake Sheets client — same DI convention
// every other Sheets-backed service in this app already uses.
export async function getCredential(key, { getClientFn = getClient } = {}) {
  if (cache.has(key)) return cache.get(key)

  const sheets = getClientFn()
  await ensureCredentialsTab(sheets)
  const rows = await getAllCredentialRows(sheets)
  const row = findRow(rows, key)
  if (!row || !row['Encrypted Value']) return null

  const value = decrypt(row['Encrypted Value'], config.credentialsEncryptionKey)
  cache.set(key, value)
  return value
}

// userId is the admin performing the write — recorded as Updated By User ID
// always, and as Owner User ID only the first time a key is ever set (an
// edit doesn't change ownership). Live-refreshes config.xxx immediately
// (applyCredentialToConfig) so a Settings-UI save takes effect without a
// restart — this is the one function in this file allowed to reach into
// config/index.js's mutable state, since it's the only place a credential's
// real value can actually change.
export async function setCredential(key, value, userId, { getClientFn = getClient } = {}) {
  const sheets = getClientFn()
  await ensureCredentialsTab(sheets)
  const rows = await getAllCredentialRows(sheets)
  const existing = findRow(rows, key)

  const mapped = mapCredential({
    key,
    encryptedValue: encrypt(value, config.credentialsEncryptionKey),
    ownerUserId: existing?.['Owner User ID'] || userId,
    updatedByUserId: userId,
  })

  if (existing) {
    const rowNumber = rows.indexOf(existing) + 2 // +1 for the header row, +1 for 1-based indexing
    await callSheets(() => sheets.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: tabRange(`A${rowNumber}:${LAST_COLUMN}${rowNumber}`),
      valueInputOption: 'RAW',
      requestBody: { values: [toRow(mapped)] },
    }))
  } else {
    await callSheets(() => sheets.spreadsheets.values.append({
      spreadsheetId: config.sheetId,
      range: tabRange(`A:${LAST_COLUMN}`),
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [toRow(mapped)] },
    }))
  }

  cache.set(key, value)
  applyCredentialToConfig(key, value)
}

// Never the full plaintext — a short prefix + "..." + the last 4 characters
// (e.g. "sk-...ab12"), same convention n8n's own credentials screen uses.
// Anything short enough that this would reveal most/all of it is masked
// completely instead.
export function maskValue(value) {
  if (!value) return null
  if (value.length <= 8) return '••••'
  return `${value.slice(0, 3)}...${value.slice(-4)}`
}

// Every migratable key's status, in the fixed order MIGRATABLE_CREDENTIAL_KEYS
// defines — including ones with no row at all yet, reported as
// unconfigured rather than simply omitted, so the Settings UI can render a
// complete, stable list ("설정되지 않음" for anything absent) instead of a
// list that grows unpredictably as credentials get set one at a time.
export async function listCredentialStatus({ getClientFn = getClient } = {}) {
  const sheets = getClientFn()
  await ensureCredentialsTab(sheets)
  const rows = await getAllCredentialRows(sheets)
  const byKey = new Map(rows.map((row) => [row['Credential Key'], row]))

  return MIGRATABLE_CREDENTIAL_KEYS.map((key) => {
    const row = byKey.get(key)
    if (!row || !row['Encrypted Value']) {
      return { key, configured: false, masked: null, updatedAt: null, updatedByUserId: null }
    }
    return {
      key,
      configured: true,
      masked: maskValue(decrypt(row['Encrypted Value'], config.credentialsEncryptionKey)),
      updatedAt: row['Updated At'] || null,
      updatedByUserId: row['Updated By User ID'] || null,
    }
  })
}
