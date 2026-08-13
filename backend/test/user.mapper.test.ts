import test from 'node:test'
import assert from 'node:assert/strict'
import { mapUser, toRow, toSafeUser, USER_COLUMNS } from '../src/mappers/user.mapper.js'

test('mapUser fills all 7 columns, defaulting role to admin and blank fields to empty strings', () => {
  const mapped = mapUser({
    userId: 'u1', email: 'a@b.com', passwordHash: 'hashed', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'admin-0',
  })

  assert.deepEqual(mapped, {
    'User ID': 'u1',
    'Email': 'a@b.com',
    'Password Hash': 'hashed',
    'Role': 'admin',
    'Created At': '2026-01-01T00:00:00.000Z',
    'Created By': 'admin-0',
    'Last Login At': '',
  })
})

test('mapUser: createdBy blank for a bootstrap-created first account (no admin to attribute it to)', () => {
  const mapped = mapUser({ userId: 'u0', email: 'root@x.com', passwordHash: 'h' })
  assert.equal(mapped['Created By'], '')
})

test('mapUser: createdAt defaults to "now" when omitted', () => {
  const before = Date.now()
  const mapped = mapUser({ userId: 'u1', email: 'a@b.com', passwordHash: 'h' })
  const parsed = new Date(mapped['Created At']).getTime()
  assert.ok(parsed >= before && parsed <= Date.now(), 'createdAt must default to a real current timestamp')
})

test('toRow keeps all 7 columns in USER_COLUMNS order', () => {
  const row = toRow(mapUser({ userId: 'u1', email: 'a@b.com', passwordHash: 'h', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'admin-0' }))

  assert.equal(row.length, 7)
  assert.deepEqual(USER_COLUMNS, ['User ID', 'Email', 'Password Hash', 'Role', 'Created At', 'Created By', 'Last Login At'])
  assert.equal(row[USER_COLUMNS.indexOf('User ID')], 'u1')
  assert.equal(row[USER_COLUMNS.indexOf('Password Hash')], 'h')
  assert.equal(row[USER_COLUMNS.indexOf('Created By')], 'admin-0')
})

test('toSafeUser strips the password hash and maps every remaining field, defaulting a blank Last Login At to null', () => {
  const row = {
    'User ID': 'u1',
    'Email': 'a@b.com',
    'Password Hash': 'super-secret-hash',
    'Role': 'admin',
    'Created At': '2026-01-01T00:00:00.000Z',
    'Created By': 'admin-0',
    'Last Login At': '',
  }

  const safe = toSafeUser(row)

  assert.deepEqual(safe, {
    id: 'u1',
    email: 'a@b.com',
    role: 'admin',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'admin-0',
    lastLoginAt: null,
  })
  assert.equal('Password Hash' in safe, false, 'the raw column key must not leak through')
  assert.equal((safe as Record<string, unknown>).passwordHash, undefined, 'no camelCase alias of the hash either')
})

test('toSafeUser: a real Last Login At value passes through unchanged, not coerced to null', () => {
  const safe = toSafeUser({
    'User ID': 'u1', 'Email': 'a@b.com', 'Password Hash': 'h', 'Role': 'admin',
    'Created At': '2026-01-01T00:00:00.000Z', 'Created By': 'admin-0', 'Last Login At': '2026-02-01T00:00:00.000Z',
  })
  assert.equal(safe.lastLoginAt, '2026-02-01T00:00:00.000Z')
})
