import test from 'node:test'
import assert from 'node:assert/strict'
import { getCredentials, putCredential } from '../src/controllers/credentials.controller.js'
import { MIGRATABLE_CREDENTIAL_KEYS } from '../src/config/index.js'

function makeRes() {
  const res = { statusCode: null, body: null, ended: false }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  res.end = () => { res.ended = true; return res }
  return res
}

function makeNext() {
  const calls = []
  const next = (...args) => calls.push(args)
  next.calls = calls
  return next
}

test('getCredentials: real success masks values and resolves the updater email', async () => {
  const res = makeRes()
  await getCredentials(
    {}, res, makeNext(),
    {
      listCredentialStatusFn: async () => [
        { key: 'OPENAI_API_KEY', configured: true, masked: 'sk-...ab12', updatedAt: 't1', updatedByUserId: 'admin-1' },
        { key: 'APIFY_TOKEN', configured: false, masked: null, updatedAt: null, updatedByUserId: null },
      ],
      getUserByIdFn: async (id) => (id === 'admin-1' ? { id: 'admin-1', email: 'admin@x.com' } : null),
    }
  )

  assert.deepEqual(res.body, {
    credentials: [
      { key: 'OPENAI_API_KEY', configured: true, masked: 'sk-...ab12', updatedAt: 't1', updatedByEmail: 'admin@x.com' },
      { key: 'APIFY_TOKEN', configured: false, masked: null, updatedAt: null, updatedByEmail: null },
    ],
  })
})

test('getCredentials: a service error is forwarded to next()', async () => {
  const next = makeNext()
  const boom = new Error('boom')
  await getCredentials({}, makeRes(), next, { listCredentialStatusFn: async () => { throw boom } })
  assert.equal(next.calls[0][0], boom)
})

test('putCredential: real success trims the value, saves it, and responds 204', async () => {
  const res = makeRes()
  const key = MIGRATABLE_CREDENTIAL_KEYS[0]
  let captured
  await putCredential(
    { params: { key }, body: { value: '  secret-value  ' }, user: { id: 'admin-1' } },
    res,
    makeNext(),
    { setCredentialFn: async (k, v, userId) => { captured = { k, v, userId } } }
  )
  assert.equal(res.statusCode, 204)
  assert.equal(res.ended, true)
  assert.deepEqual(captured, { k: key, v: 'secret-value', userId: 'admin-1' })
})

test('putCredential: 400 for an unrecognized credential key', async () => {
  const res = makeRes()
  await putCredential(
    { params: { key: 'NOT_A_REAL_KEY' }, body: { value: 'x' }, user: { id: 'admin-1' } },
    res,
    makeNext()
  )
  assert.equal(res.statusCode, 400)
})

test('putCredential: 400 for a blank value', async () => {
  const res = makeRes()
  const key = MIGRATABLE_CREDENTIAL_KEYS[0]
  await putCredential(
    { params: { key }, body: { value: '   ' }, user: { id: 'admin-1' } },
    res,
    makeNext()
  )
  assert.equal(res.statusCode, 400)
})

test('putCredential: a service error is forwarded to next()', async () => {
  const next = makeNext()
  const key = MIGRATABLE_CREDENTIAL_KEYS[0]
  const boom = new Error('vault write failed')
  await putCredential(
    { params: { key }, body: { value: 'x' }, user: { id: 'admin-1' } },
    makeRes(),
    next,
    { setCredentialFn: async () => { throw boom } }
  )
  assert.equal(next.calls[0][0], boom)
})
