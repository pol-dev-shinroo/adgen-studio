import { config } from '../config/index.js'
import {
  createUser, verifyCredentials, touchLastLogin, getAllUsers, signSessionToken,
} from '../services/auth/auth.service.js'

const SESSION_COOKIE_NAME = 'session'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days, matches auth.service.js's SESSION_EXPIRY

// Frontend (Vercel) and backend (Railway) are different origins in
// production, so the cookie needs SameSite=None + Secure there for the
// browser to send it cross-site at all — but Secure requires HTTPS, which
// local dev (both sides on localhost over http) doesn't have, so a Secure
// cookie would just be silently dropped. config.isProduction (Railway sets
// NODE_ENV=production automatically) flips both together.
function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    path: '/',
  }
}

export async function postLogin(req, res, next) {
  try {
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' })
    }

    const user = await verifyCredentials(email, password)
    if (!user) {
      // Deliberately the same message whether the email doesn't exist or
      // the password was wrong — distinguishing the two would let an
      // attacker enumerate real email addresses.
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' })
    }

    await touchLastLogin(user.id)
    const token = signSessionToken(user)
    res.cookie(SESSION_COOKIE_NAME, token, { ...sessionCookieOptions(), maxAge: SESSION_MAX_AGE_MS })
    res.json({ user })
  } catch (err) {
    next(err)
  }
}

export function postLogout(req, res) {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions())
  res.status(204).end()
}

// req.user is already populated by app.js's global requireAuth gate (this
// route is only reachable at all once that's passed) — this just echoes it
// back, no extra Sheets round-trip needed for a plain "am I logged in"
// check.
export function getMe(req, res) {
  res.json({ user: req.user })
}

// Admin-only (requireAdmin runs before this in auth.routes.js) — this is
// 회원가입's actual backend. req.user.id (the creating admin) is threaded
// through as Created By.
export async function postCreateUser(req, res, next) {
  try {
    const { email, password, passwordConfirm } = req.body ?? {}
    if (passwordConfirm !== undefined && password !== passwordConfirm) {
      return res.status(400).json({ error: '비밀번호가 일치하지 않습니다.' })
    }

    const user = await createUser(email, password, req.user.id)
    res.status(201).json({ user })
  } catch (err) {
    if (err.badRequest) return res.status(400).json({ error: err.message })
    if (err.conflict) return res.status(409).json({ error: err.message })
    next(err)
  }
}

// Admin-only — the 사용자 관리 list's data source. Never includes password
// hashes (toSafeUser strips them before this even leaves auth.service.js).
export async function getUsers(req, res, next) {
  try {
    const users = await getAllUsers()
    res.json({ users })
  } catch (err) {
    next(err)
  }
}
