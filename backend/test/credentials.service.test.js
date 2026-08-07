import test from 'node:test'
import assert from 'node:assert/strict'
import { CREDENTIAL_COLUMNS } from '../src/mappers/credentials.mapper.js'
import { encrypt, decrypt } from '../src/utils/crypto.js'
import { config } from '../src/config/index.js'
import {
  getCredential, setCredential, listCredentialStatus, maskValue,
} from '../src/services/credentials.service.js'

// Fake Sheets client — no real Google API call anywhere in this suite, same
// DI-via-getClientFn convention auth.service.test.js/sheets.service.test.js
// already established. The Credentials tab is simulated as already existing
// with a full header (skips the addSheet/batchUpdate tab-creation path).
function rowToCells(row) {
  return CREDENTIAL_COLUMNS.map((c) => row[c] ?? '')
}

function makeFakeSheets({ existingRows = [], captured = {} } = {}) {
  return {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: 'Credentials' } }] } }),
      batchUpdate: async ({ requestBody }) => {
        captured.batchUpdate = requestBody
        return { data: {} }
      },
      values: {
        get: async ({ range }) => {
          if (range.includes('A1:E1')) return { data: { values: [[...CREDENTIAL_COLUMNS]] } }
          return { data: { values: [[...CREDENTIAL_COLUMNS], ...existingRows.map(rowToCells)] } }
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

function buildExistingRow({ key, value, ownerUserId = 'user-1', updatedByUserId = 'user-1', updatedAt = '2026-08-01T00:00:00.000Z' }) {
  return {
    'Credential Key': key,
    'Encrypted Value': encrypt(value, config.credentialsEncryptionKey),
    'Owner User ID': ownerUserId,
    'Updated At': updatedAt,
    'Updated By User ID': updatedByUserId,
  }
}

test('getCredential decrypts the stored value for real, via a fake Sheets client', async () => {
  const existing = buildExistingRow({ key: 'TEST_GET_1', value: 'sk-real-secret-value' })
  const fakeSheets = makeFakeSheets({ existingRows: [existing] })

  const value = await getCredential('TEST_GET_1', { getClientFn: () => fakeSheets })
  assert.equal(value, 'sk-real-secret-value')
})

test('getCredential returns null when no row exists for the key, rather than throwing', async () => {
  const fakeSheets = makeFakeSheets({ existingRows: [] })
  const value = await getCredential('TEST_GET_MISSING', { getClientFn: () => fakeSheets })
  assert.equal(value, null)
})

test('setCredential encrypts before writing — the plaintext never appears in any written cell', async () => {
  const captured = {}
  const fakeSheets = makeFakeSheets({ captured })

  await setCredential('TEST_SET_1', 'super-secret-plaintext', 'user-9', { getClientFn: () => fakeSheets })

  const appendedRow = captured.append.values[0]
  assert.ok(!appendedRow.includes('super-secret-plaintext'), 'plaintext must never be written to the sheet')

  const encryptedCell = appendedRow[CREDENTIAL_COLUMNS.indexOf('Encrypted Value')]
  assert.equal(decrypt(encryptedCell, config.credentialsEncryptionKey), 'super-secret-plaintext')
  assert.equal(appendedRow[CREDENTIAL_COLUMNS.indexOf('Owner User ID')], 'user-9')
  assert.equal(appendedRow[CREDENTIAL_COLUMNS.indexOf('Updated By User ID')], 'user-9')
})

test('setCredential invalidates (overwrites) the in-memory cache — a later getCredential call for the same key never re-reads Sheets', async () => {
  await setCredential('TEST_CACHE_1', 'first-value', 'user-1', { getClientFn: () => makeFakeSheets() })

  const value = await getCredential('TEST_CACHE_1', {
    getClientFn: () => { throw new Error('getCredential must not hit Sheets — the cache should already have the value') },
  })
  assert.equal(value, 'first-value')

  await setCredential('TEST_CACHE_1', 'second-value', 'user-1', { getClientFn: () => makeFakeSheets() })
  const updated = await getCredential('TEST_CACHE_1', {
    getClientFn: () => { throw new Error('getCredential must not hit Sheets — the cache should already have the updated value') },
  })
  assert.equal(updated, 'second-value')
})

test('setCredential preserves Owner User ID across an edit but always updates Updated By User ID', async () => {
  const existing = buildExistingRow({ key: 'TEST_OWNER_1', value: 'v1', ownerUserId: 'admin-original', updatedByUserId: 'admin-original' })
  const captured = {}
  const fakeSheets = makeFakeSheets({ existingRows: [existing], captured })

  await setCredential('TEST_OWNER_1', 'v2', 'admin-editor', { getClientFn: () => fakeSheets })

  const updatedRow = captured.update.requestBody.values[0]
  assert.equal(updatedRow[CREDENTIAL_COLUMNS.indexOf('Owner User ID')], 'admin-original', 'an edit must not change ownership')
  assert.equal(updatedRow[CREDENTIAL_COLUMNS.indexOf('Updated By User ID')], 'admin-editor')
  assert.equal(decrypt(updatedRow[CREDENTIAL_COLUMNS.indexOf('Encrypted Value')], config.credentialsEncryptionKey), 'v2')
})

test('setCredential live-refreshes config.apifyToken immediately — no restart needed for a migratable key', async () => {
  const originalApifyToken = config.apifyToken
  try {
    await setCredential('APIFY_TOKEN', 'apify_test_live_refresh_token', 'user-1', { getClientFn: () => makeFakeSheets() })
    assert.equal(config.apifyToken, 'apify_test_live_refresh_token')
  } finally {
    // Restore, since config is a shared singleton for the rest of this test file's run.
    if (originalApifyToken) {
      await setCredential('APIFY_TOKEN', originalApifyToken, 'user-1', { getClientFn: () => makeFakeSheets() })
    }
  }
})

test('maskValue never reveals more than a short prefix + last 4 characters, and fully masks short values', () => {
  assert.equal(maskValue('sk-proj-abcdefghijklmnop1234ab12'), 'sk-...ab12')
  assert.equal(maskValue('short'), '••••')
  assert.equal(maskValue(''), null)
  assert.equal(maskValue(null), null)
})

test('listCredentialStatus reports every migratable key, including unconfigured ones, without ever exposing plaintext', async () => {
  const existing = buildExistingRow({ key: 'OPENAI_API_KEY', value: 'sk-openai-real-value-xyz9', ownerUserId: 'admin-1', updatedByUserId: 'admin-1' })
  const fakeSheets = makeFakeSheets({ existingRows: [existing] })

  const statuses = await listCredentialStatus({ getClientFn: () => fakeSheets })

  const openai = statuses.find((s) => s.key === 'OPENAI_API_KEY')
  assert.ok(openai.configured)
  assert.equal(openai.masked, 'sk-...xyz9')
  assert.ok(!JSON.stringify(openai).includes('sk-openai-real-value-xyz9'), 'the real plaintext must never appear in the status payload')

  const unconfigured = statuses.find((s) => s.key === 'PINECONE_API_KEY')
  assert.equal(unconfigured.configured, false)
  assert.equal(unconfigured.masked, null)
})
