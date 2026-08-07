import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { getMe, login as apiLogin, logout as apiLogout, setUnauthorizedHandler } from '../api/backendClient.js'

const AuthContext = createContext(null)

// Part X: deliberately NOT composed inside AppProviders.jsx alongside the
// app's other feature contexts — every one of those (Ads/Products/Gallery/
// Studio) fetches real data the moment it mounts, and none of that should
// even start until a session is confirmed. App.jsx wraps AuthProvider
// outside AppProviders instead, and only mounts AppProviders' subtree once
// `user` is truthy.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // Starts true — the very first render must not assume "logged out" before
  // GET /api/auth/me has actually had a chance to answer, or a real session
  // would flash the login screen before snapping back to the app.
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getMe()
      .then(({ user: me }) => { if (!cancelled) setUser(me) })
      .catch(() => { if (!cancelled) setUser(null) }) // 401 (or backend unreachable) — not logged in
      .finally(() => { if (!cancelled) setAuthLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Any 401 from any backend call (not just this hook's own getMe()) means
  // the session is gone — a stale already-open tab hits this the moment it
  // next touches the backend, not just on its own remount.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (email, password) => {
    const { user: loggedInUser } = await apiLogin(email, password)
    setUser(loggedInUser)
    return loggedInUser
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      // Clear client state even if the network call itself failed — a
      // logout the user explicitly asked for should never leave them stuck
      // looking logged-in.
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
