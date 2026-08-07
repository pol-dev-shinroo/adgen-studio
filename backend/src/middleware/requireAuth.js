import { verifySessionToken } from '../services/auth.service.js'

// Validates the session cookie set on login, attaching req.user (id, email,
// role) on success. Applied globally in app.js to every route except
// POST /api/auth/login and GET /api/health — including the Figma-plugin
// export routes that used to be CORS-open, per explicit direction: a real
// login system with a real data-exposure gap left open on purpose isn't
// the goal here, even though it means the Figma plugin (which has no way
// to present our session cookie from its sandboxed origin) stops working
// until a later part gives it its own machine-to-machine auth.
//
// Deliberately does NOT hit Sheets to re-verify the user still exists on
// every request — the JWT payload itself carries id/email/role, so this
// stays a pure signature/expiry check. A user deleted mid-session (no
// delete flow exists yet anyway) would only be caught on next login.
export function requireAuth(req, res, next) {
  const token = req.cookies?.session
  if (!token) {
    return res.status(401).json({ error: '인증이 필요합니다.' })
  }

  try {
    const payload = verifySessionToken(token)
    req.user = { id: payload.sub, email: payload.email, role: payload.role }
    next()
  } catch {
    return res.status(401).json({ error: '세션이 만료되었거나 유효하지 않습니다.' })
  }
}

// Layered after requireAuth (which must run first to populate req.user) on
// the two admin-only auth routes (POST/GET /api/auth/users) — every
// account created this part is 'admin', so today this gate is trivially
// satisfied by anyone logged in, but it's a real, backend-enforced check
// regardless of what the frontend chooses to hide client-side, ready for
// whenever a lower-privilege role actually exists.
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '관리자만 접근할 수 있습니다.' })
  }
  next()
}
