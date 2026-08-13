import test from 'node:test'
import assert from 'node:assert/strict'
import {
  postLogin, postLogout, getMe, postCreateUser, getUsers,
} from '../src/controllers/auth.controller.js'

// Minimal Express req/res doubles — no real HTTP server needed, same
// convention as requireAuth.test.js.
function makeRes() {
  const res = { statusCode: null, body: null, cookies: [], cleared: [], ended: false }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  res.cookie = (name, value, options) => { res.cookies.push({ name, value, options }); return res }
  res.clearCookie = (name, options) => { res.cleared.push({ name, options }); return res }
  res.end = () => { res.ended = true; return res }
  return res
}

function makeNext() {
  const calls = []
  const next = (...args) => calls.push(args)
  next.calls = calls
  return next
}

test('postLogin: real success returns 200 with the user and sets a session cookie', async () => {
  const req = { body: { email: 'a@b.com', password: 'realpassword' } }
  const res = makeRes()
  const next = makeNext()
  const user = { id: 'user-1', email: 'a@b.com', role: 'admin' }

  await postLogin(req, res, next, {
    verifyCredentialsFn: async (email, password) => {
      assert.equal(email, 'a@b.com')
      assert.equal(password, 'realpassword')
      return user
    },
    touchLastLoginFn: async () => {},
    signSessionTokenFn: () => 'fake.jwt.token',
  })

  assert.equal(next.calls.length, 0)
  assert.deepEqual(res.body, { user })
  assert.equal(res.cookies.length, 1)
  assert.equal(res.cookies[0].name, 'session')
  assert.equal(res.cookies[0].value, 'fake.jwt.token')
})

test('postLogin: 400 when email or password is missing', async () => {
  const res = makeRes()
  await postLogin({ body: { email: '', password: 'x' } }, res, makeNext())
  assert.equal(res.statusCode, 400)

  const res2 = makeRes()
  await postLogin({ body: { email: 'a@b.com' } }, res2, makeNext())
  assert.equal(res2.statusCode, 400)
})

test('postLogin: 401 with a generic message when verifyCredentials returns no user (wrong email or wrong password alike)', async () => {
  const res = makeRes()
  await postLogin(
    { body: { email: 'a@b.com', password: 'wrong' } },
    res,
    makeNext(),
    { verifyCredentialsFn: async () => null }
  )

  assert.equal(res.statusCode, 401)
  assert.equal(res.body.error, '이메일 또는 비밀번호가 올바르지 않습니다.')
})

test('postLogin: an unexpected service error is forwarded to next(), not swallowed', async () => {
  const next = makeNext()
  const res = makeRes()
  const boom = new Error('sheets unreachable')
  await postLogin(
    { body: { email: 'a@b.com', password: 'x' } },
    res,
    next,
    { verifyCredentialsFn: async () => { throw boom } }
  )

  assert.equal(res.statusCode, null)
  assert.equal(next.calls.length, 1)
  assert.equal(next.calls[0][0], boom)
})

test('postLogout: clears the session cookie and responds 204', () => {
  const res = makeRes()
  postLogout({}, res)
  assert.equal(res.statusCode, 204)
  assert.equal(res.ended, true)
  assert.equal(res.cleared.length, 1)
  assert.equal(res.cleared[0].name, 'session')
})

test('getMe: echoes back req.user (already populated by requireAuth upstream)', () => {
  const res = makeRes()
  const user = { id: 'u1', email: 'a@b.com', role: 'viewer' }
  getMe({ user }, res)
  assert.deepEqual(res.body, { user })
})

test('postCreateUser: real success returns 201 with the new user', async () => {
  const res = makeRes()
  const newUser = { id: 'u2', email: 'new@b.com', role: 'admin' }
  await postCreateUser(
    { body: { email: 'new@b.com', password: 'pw123456' }, user: { id: 'admin-1' } },
    res,
    makeNext(),
    { createUserFn: async (email, password, createdBy) => {
      assert.equal(email, 'new@b.com')
      assert.equal(createdBy, 'admin-1')
      return newUser
    } }
  )
  assert.equal(res.statusCode, 201)
  assert.deepEqual(res.body, { user: newUser })
})

test('postCreateUser: 400 when password and passwordConfirm mismatch', async () => {
  const res = makeRes()
  await postCreateUser(
    { body: { email: 'a@b.com', password: 'a', passwordConfirm: 'b' }, user: { id: 'admin-1' } },
    res,
    makeNext()
  )
  assert.equal(res.statusCode, 400)
})

test('postCreateUser: err.badRequest maps to 400', async () => {
  const res = makeRes()
  const err = new Error('이메일 형식이 올바르지 않습니다.')
  err.badRequest = true
  await postCreateUser(
    { body: { email: 'bad', password: 'x' }, user: { id: 'admin-1' } },
    res,
    makeNext(),
    { createUserFn: async () => { throw err } }
  )
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error, err.message)
})

test('postCreateUser: err.conflict maps to 409', async () => {
  const res = makeRes()
  const err = new Error('이미 존재하는 이메일입니다.')
  err.conflict = true
  await postCreateUser(
    { body: { email: 'dup@b.com', password: 'x' }, user: { id: 'admin-1' } },
    res,
    makeNext(),
    { createUserFn: async () => { throw err } }
  )
  assert.equal(res.statusCode, 409)
  assert.equal(res.body.error, err.message)
})

test('postCreateUser: an unrecognized error falls through to next()', async () => {
  const next = makeNext()
  const res = makeRes()
  const boom = new Error('unexpected')
  await postCreateUser(
    { body: { email: 'a@b.com', password: 'x' }, user: { id: 'admin-1' } },
    res,
    next,
    { createUserFn: async () => { throw boom } }
  )
  assert.equal(res.statusCode, null)
  assert.equal(next.calls[0][0], boom)
})

test('getUsers: real success returns the user list', async () => {
  const res = makeRes()
  const users = [{ id: 'u1', email: 'a@b.com', role: 'admin' }]
  await getUsers({}, res, makeNext(), { getAllUsersFn: async () => users })
  assert.deepEqual(res.body, { users })
})

test('getUsers: a service error is forwarded to next()', async () => {
  const next = makeNext()
  const res = makeRes()
  const boom = new Error('boom')
  await getUsers({}, res, next, { getAllUsersFn: async () => { throw boom } })
  assert.equal(next.calls[0][0], boom)
})
