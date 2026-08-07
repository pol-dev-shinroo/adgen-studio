import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'
import { USER_COLUMNS, mapUser, toRow, toSafeUser } from '../mappers/user.mapper.js'
import { getClient, callSheets, makeTabRange, columnLetter } from './sheetsBase.js'

// Same one-spreadsheet-many-tabs convention every other data type in this
// app already uses (product/generated-ad tabs). Real work factor for
// bcrypt — 12 rounds, not the library default of 10 — per this part's own
// "don't skimp" instruction; account creation is admin-only and rare, so
// the extra hashing cost is a non-issue.
const USERS_TAB_NAME = 'Users'
const LAST_COLUMN = 'G' // 7 columns, A..G
const WORK_FACTOR = 12
const SESSION_EXPIRY = '7d'

const tabRange = makeTabRange(USERS_TAB_NAME)

// Unlike productSheets.service.js/generatedSheets.service.js, this
// deliberately does NOT cache the "tab already ensured" check in a
// module-level promise — every auth.service.js entry point (login, account
// creation, the admin user list) is low-frequency by nature, so paying one
// extra spreadsheets.get per call is a non-issue, and skipping the cache
// keeps every function here independently testable against a fresh fake
// Sheets client without any cross-test state leaking through a shared
// promise. `sheets` is the already-resolved client (real or fake), not a
// getter — callers pass whatever getClientFn() returned.
async function ensureUsersTab(sheets) {
  const meta = await callSheets(() => sheets.spreadsheets.get({ spreadsheetId: config.sheetId }))
  const exists = meta.data.sheets.some((s) => s.properties.title === USERS_TAB_NAME)

  if (!exists) {
    await callSheets(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: USERS_TAB_NAME } } }] },
    }))
    await callSheets(() => sheets.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: tabRange(`A1:${LAST_COLUMN}1`),
      valueInputOption: 'RAW',
      requestBody: { values: [[...USER_COLUMNS]] },
    }))
    return
  }

  const headerRes = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A1:${LAST_COLUMN}1`),
  }))
  const existingHeader = headerRes.data.values?.[0] || []
  if (existingHeader.length < USER_COLUMNS.length) {
    const missingHeaders = USER_COLUMNS.slice(existingHeader.length)
    const startColumn = columnLetter(existingHeader.length)
    await callSheets(() => sheets.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: tabRange(`${startColumn}1:${LAST_COLUMN}1`),
      valueInputOption: 'RAW',
      requestBody: { values: [missingHeaders] },
    }))
  }
}

async function getAllUserRows(sheets) {
  const res = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  }))
  const rows = res.data.values || []
  return rows.slice(1).map((cells) => (
    Object.fromEntries(USER_COLUMNS.map((column, i) => [column, cells[i] ?? '']))
  ))
}

// Email uniqueness is enforced case-insensitively — "Admin@x.com" and
// "admin@x.com" are the same account, so this is the one place both
// createUser's duplicate check and verifyCredentials' lookup go through,
// rather than each re-implementing its own comparison.
function findRowByEmail(rows, email) {
  const target = email.trim().toLowerCase()
  return rows.find((row) => row['Email'].trim().toLowerCase() === target) || null
}

// email/password validated for real work factor + duplicate-email
// rejection: don't let the sheet silently gain two rows for the same
// email. createdByUserId is the creating admin's User ID, or null for the
// one-time bootstrap script (no admin exists yet to attribute it to).
//
// getClientFn is injected (defaulting to the real getClient) purely so
// this can be unit-tested without a real Sheets call — same DI convention
// sheets.service.js's upsertAdRows already established.
export async function createUser(email, password, createdByUserId, { getClientFn = getClient } = {}) {
  const trimmedEmail = typeof email === 'string' ? email.trim() : ''
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    const err = new Error('유효한 이메일 주소를 입력해주세요.')
    err.badRequest = true
    throw err
  }
  if (typeof password !== 'string' || password.length < 8) {
    const err = new Error('비밀번호는 8자 이상이어야 합니다.')
    err.badRequest = true
    throw err
  }

  const sheets = getClientFn()
  await ensureUsersTab(sheets)

  const rows = await getAllUserRows(sheets)
  if (findRowByEmail(rows, trimmedEmail)) {
    const err = new Error('이미 등록된 이메일입니다.')
    err.conflict = true
    throw err
  }

  const passwordHash = await bcrypt.hash(password, WORK_FACTOR)
  const mapped = mapUser({
    userId: randomUUID(),
    email: trimmedEmail,
    passwordHash,
    role: 'admin',
    createdAt: new Date().toISOString(),
    createdBy: createdByUserId || '',
  })

  await callSheets(() => sheets.spreadsheets.values.append({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [toRow(mapped)] },
  }))

  return toSafeUser(mapped)
}

// Returns the safe user object on a correct email+password, or null —
// never throws for "wrong credentials" (that's an expected outcome, not an
// error condition) so the controller can give one specific, non-leaky
// message regardless of whether the email didn't exist or the password
// was wrong.
export async function verifyCredentials(email, password, { getClientFn = getClient } = {}) {
  if (typeof email !== 'string' || typeof password !== 'string') return null

  const sheets = getClientFn()
  await ensureUsersTab(sheets)
  const rows = await getAllUserRows(sheets)
  const row = findRowByEmail(rows, email)
  if (!row) return null

  const matches = await bcrypt.compare(password, row['Password Hash'])
  if (!matches) return null

  return toSafeUser(row)
}

export async function getUserByEmail(email, { getClientFn = getClient } = {}) {
  const sheets = getClientFn()
  await ensureUsersTab(sheets)
  const rows = await getAllUserRows(sheets)
  const row = findRowByEmail(rows, email)
  return row ? toSafeUser(row) : null
}

export async function getUserById(userId, { getClientFn = getClient } = {}) {
  const sheets = getClientFn()
  await ensureUsersTab(sheets)
  const rows = await getAllUserRows(sheets)
  const row = rows.find((r) => r['User ID'] === String(userId)) || null
  return row ? toSafeUser(row) : null
}

// Every real, non-password-hash user record — the admin user-management
// list's data source.
export async function getAllUsers({ getClientFn = getClient } = {}) {
  const sheets = getClientFn()
  await ensureUsersTab(sheets)
  const rows = await getAllUserRows(sheets)
  return rows.map(toSafeUser)
}

export async function touchLastLogin(userId, { getClientFn = getClient } = {}) {
  const sheets = getClientFn()
  await ensureUsersTab(sheets)

  const idColumn = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange('A:A'),
  }))
  const columnA = idColumn.data.values || []
  const rowNumber = columnA.findIndex((cells) => String(cells?.[0] ?? '').trim() === String(userId).trim())
  if (rowNumber < 1) return // not found — never fatal, last-login is a nice-to-have, not load-bearing

  const letter = columnLetter(USER_COLUMNS.indexOf('Last Login At'))
  await callSheets(() => sheets.spreadsheets.values.update({
    spreadsheetId: config.sheetId,
    range: tabRange(`${letter}${rowNumber + 1}:${letter}${rowNumber + 1}`),
    valueInputOption: 'RAW',
    requestBody: { values: [[new Date().toISOString()]] },
  }))
}

// Session JWT: carries just enough to populate req.user without a Sheets
// round-trip on every single authenticated request — id/email/role, not
// the password hash. `secret` is injected (defaulting to the real
// config.sessionJwtSecret) so the requireAuth middleware's own tests can
// sign/verify against a throwaway test secret instead of depending on
// real env config.
export function signSessionToken(user, { secret = config.sessionJwtSecret } = {}) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, secret, { expiresIn: SESSION_EXPIRY })
}

// Throws (jsonwebtoken's own TokenExpiredError/JsonWebTokenError) on a
// missing/invalid/expired token — the requireAuth middleware is
// responsible for catching that and turning it into a 401, not this
// function silently swallowing it into a null.
export function verifySessionToken(token, { secret = config.sessionJwtSecret } = {}) {
  return jwt.verify(token, secret)
}
