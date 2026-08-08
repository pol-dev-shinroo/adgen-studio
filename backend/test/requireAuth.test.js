import test from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { config } from '../src/config/index.js'
import { requireAuth, requireAdmin } from '../src/middleware/requireAuth.js'
import { signSessionToken } from '../src/services/auth/auth.service.js'

// Minimal Express req/res doubles — no real HTTP server needed to exercise
// middleware logic directly.
function makeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

function makeNext() {
  const calls = []
  const next = (...args) => calls.push(args)
  next.calls = calls
  return next
}

test('requireAuth sets req.user and calls next() for a genuinely valid session', () => {
  const token = signSessionToken({ id: 'user-1', email: 'a@b.com', role: 'admin' })
  const req = { cookies: { session: token } }
  const res = makeRes()
  const next = makeNext()

  requireAuth(req, res, next)

  assert.equal(next.calls.length, 1, 'next() should be called exactly once, with no error')
  assert.deepEqual(req.user, { id: 'user-1', email: 'a@b.com', role: 'admin' })
  assert.equal(res.statusCode, null, 'must not touch the response at all on success')
})

test('requireAuth 401s when there is no session cookie at all', () => {
  const req = { cookies: {} }
  const res = makeRes()
  const next = makeNext()

  requireAuth(req, res, next)

  assert.equal(next.calls.length, 0)
  assert.equal(res.statusCode, 401)
  assert.ok(res.body.error)
})

test('requireAuth 401s on a garbage/invalid token', () => {
  const req = { cookies: { session: 'not-a-real-jwt' } }
  const res = makeRes()
  const next = makeNext()

  requireAuth(req, res, next)

  assert.equal(next.calls.length, 0)
  assert.equal(res.statusCode, 401)
})

test('requireAuth 401s on a genuinely expired token', () => {
  // Signed directly (not via signSessionToken, which hardcodes 7d) with the
  // real config secret and an `exp` claim set 60s in the past, so
  // requireAuth's own verify call actually accepts the signature and only
  // rejects it for being expired — not a race against clock precision the
  // way `expiresIn: '0s'` would be.
  const expiredToken = jwt.sign(
    { sub: 'user-1', email: 'a@b.com', role: 'admin', exp: Math.floor(Date.now() / 1000) - 60 },
    config.sessionJwtSecret
  )
  const req = { cookies: { session: expiredToken } }
  const res = makeRes()
  const next = makeNext()

  requireAuth(req, res, next)

  assert.equal(next.calls.length, 0)
  assert.equal(res.statusCode, 401)
})

test('requireAdmin passes through for an admin req.user and 403s for a non-admin one', () => {
  const resOk = makeRes()
  const nextOk = makeNext()
  requireAdmin({ user: { role: 'admin' } }, resOk, nextOk)
  assert.equal(nextOk.calls.length, 1)
  assert.equal(resOk.statusCode, null)

  const resDenied = makeRes()
  const nextDenied = makeNext()
  requireAdmin({ user: { role: 'viewer' } }, resDenied, nextDenied)
  assert.equal(nextDenied.calls.length, 0)
  assert.equal(resDenied.statusCode, 403)
})
