import test from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { USER_COLUMNS } from '../src/mappers/user.mapper.js'
import {
  createUser, verifyCredentials, getUserByEmail, getUserById, touchLastLogin,
  signSessionToken, verifySessionToken,
} from '../src/services/auth.service.js'

// Fake Sheets client — no real Google API call anywhere in this suite, same
// DI-via-getClientFn convention sheets.service.test.js already established
// for upsertAdRows. The Users tab is simulated as already existing with a
// full header (skips the addSheet/batchUpdate tab-creation path, which
// isn't what these tests are about) unless a test explicitly cares.
function rowToCells(row) {
  return USER_COLUMNS.map((c) => row[c] ?? '')
}

function makeFakeSheets({ existingRows = [], captured = {} } = {}) {
  return {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: 'Users' } }] } }),
      batchUpdate: async ({ requestBody }) => {
        captured.batchUpdate = requestBody
        return { data: {} }
      },
      values: {
        get: async ({ range }) => {
          if (range.includes('A1:G1')) return { data: { values: [[...USER_COLUMNS]] } }
          if (range.includes('A:A')) {
            return { data: { values: [['User ID'], ...existingRows.map((r) => [r['User ID']])] } }
          }
          return { data: { values: [[...USER_COLUMNS], ...existingRows.map(rowToCells)] } }
        },
        update: async ({ range, requestBody }) => {
          captured.update = { range, requestBody }
          return { data: {} }
        },
        append: async ({ requestBody }) => {
          captured.append = requestBody
          return { data: {} }
        },
      },
    },
  }
}

async function buildExistingRow(email, password) {
  return {
    'User ID': 'user-1',
    'Email': email,
    'Password Hash': await bcrypt.hash(password, 4), // low work factor — test speed only
    'Role': 'admin',
    'Created At': '2026-08-01T00:00:00.000Z',
    'Created By': '',
    'Last Login At': '',
  }
}

test('createUser hashes the password (never stores it in plain text) and returns a safe user with no hash', async () => {
  const captured = {}
  const fakeSheets = makeFakeSheets({ captured })

  const user = await createUser('new@example.com', 'correct horse battery', null, { getClientFn: () => fakeSheets })

  assert.equal(user.email, 'new@example.com')
  assert.equal(user.role, 'admin')
  assert.equal(user.passwordHash, undefined, 'the safe user object must never carry a password hash field')

  const appendedRow = captured.append.values[0]
  const hashCell = appendedRow[USER_COLUMNS.indexOf('Password Hash')]
  assert.notEqual(hashCell, 'correct horse battery', 'the raw password must never be written to the sheet')
  assert.ok(await bcrypt.compare('correct horse battery', hashCell), 'the stored hash must actually verify against the real password')
})

test('createUser rejects a duplicate email case-insensitively rather than silently adding a second row', async () => {
  const existing = await buildExistingRow('Admin@Example.com', 'whatever123')
  const fakeSheets = makeFakeSheets({ existingRows: [existing] })

  await assert.rejects(
    () => createUser('admin@example.com', 'anotherpassword', null, { getClientFn: () => fakeSheets }),
    (err) => {
      assert.equal(err.conflict, true)
      assert.match(err.message, /이미 등록된 이메일/)
      return true
    }
  )
})

test('createUser rejects an invalid email and a too-short password as bad requests, not server errors', async () => {
  const fakeSheets = makeFakeSheets()

  await assert.rejects(
    () => createUser('not-an-email', 'longenoughpassword', null, { getClientFn: () => fakeSheets }),
    (err) => { assert.equal(err.badRequest, true); return true }
  )
  await assert.rejects(
    () => createUser('valid@example.com', 'short', null, { getClientFn: () => fakeSheets }),
    (err) => { assert.equal(err.badRequest, true); return true }
  )
})

test('verifyCredentials returns the safe user on a correct email+password', async () => {
  const existing = await buildExistingRow('user@example.com', 'realpassword1')
  const fakeSheets = makeFakeSheets({ existingRows: [existing] })

  const user = await verifyCredentials('user@example.com', 'realpassword1', { getClientFn: () => fakeSheets })

  assert.ok(user)
  assert.equal(user.id, 'user-1')
  assert.equal(user.email, 'user@example.com')
})

test('verifyCredentials returns null (not a throw) for a wrong password, and matches email case-insensitively', async () => {
  const existing = await buildExistingRow('User@Example.com', 'realpassword1')
  const fakeSheets = makeFakeSheets({ existingRows: [existing] })

  const wrongPassword = await verifyCredentials('User@Example.com', 'wrongpassword', { getClientFn: () => fakeSheets })
  assert.equal(wrongPassword, null)

  const caseInsensitive = await verifyCredentials('user@example.com', 'realpassword1', { getClientFn: () => fakeSheets })
  assert.ok(caseInsensitive, 'email lookup must be case-insensitive')
})

test('verifyCredentials returns null for an email that does not exist at all', async () => {
  const fakeSheets = makeFakeSheets({ existingRows: [] })
  const user = await verifyCredentials('nobody@example.com', 'anything123', { getClientFn: () => fakeSheets })
  assert.equal(user, null)
})

test('getUserByEmail / getUserById return the safe user or null', async () => {
  const existing = await buildExistingRow('lookup@example.com', 'pw12345678')
  const fakeSheets = makeFakeSheets({ existingRows: [existing] })

  assert.ok(await getUserByEmail('lookup@example.com', { getClientFn: () => fakeSheets }))
  assert.equal(await getUserByEmail('missing@example.com', { getClientFn: () => fakeSheets }), null)
  assert.ok(await getUserById('user-1', { getClientFn: () => fakeSheets }))
  assert.equal(await getUserById('nope', { getClientFn: () => fakeSheets }), null)
})

test('touchLastLogin writes to the matched row\'s own Last Login At cell', async () => {
  const existing = await buildExistingRow('touch@example.com', 'pw12345678')
  const captured = {}
  const fakeSheets = makeFakeSheets({ existingRows: [existing], captured })

  await touchLastLogin('user-1', { getClientFn: () => fakeSheets })

  // Row 1 is the header, existing row is row 2 — Last Login At is the last
  // (7th) column, letter G.
  assert.match(captured.update.range, /^'Users'!G2:G2$/)
  assert.ok(!Number.isNaN(new Date(captured.update.requestBody.values[0][0]).getTime()))
})

test('signSessionToken/verifySessionToken round-trip with an injected test secret, independent of real config', () => {
  const user = { id: 'user-1', email: 'a@b.com', role: 'admin' }
  const token = signSessionToken(user, { secret: 'test-secret' })
  const payload = verifySessionToken(token, { secret: 'test-secret' })

  assert.equal(payload.sub, 'user-1')
  assert.equal(payload.email, 'a@b.com')
  assert.equal(payload.role, 'admin')
})

test('verifySessionToken throws on a token signed with a different secret', () => {
  const token = signSessionToken({ id: 'x', email: 'x@y.com', role: 'admin' }, { secret: 'secret-a' })
  assert.throws(() => verifySessionToken(token, { secret: 'secret-b' }))
})
