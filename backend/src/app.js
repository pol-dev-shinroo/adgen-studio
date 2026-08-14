import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { config } from './config/index.js'
import { requireAuth } from './middleware/requireAuth.js'
import authRoutes from './routes/auth.routes.js'
import collectRoutes from './routes/collect.routes.js'
import adsRoutes from './routes/ads.routes.js'
import productsRoutes from './routes/products.routes.js'
import generationRoutes from './routes/generation.routes.js'
import credentialsRoutes from './routes/credentials.routes.js'

// Every existing endpoint is only ever called from our own Vercel frontend,
// so the app-wide default stays locked to config.corsOrigin exactly as
// before. The three exceptions (the Figma plugin — Part J's list/export
// routes, Part L's image-proxy route) are GET /api/generate/results (list),
// GET .../results/:id/figma-export (single result), and
// GET .../results/:id/figma-export/image (Part L's own-server image proxy,
// added after a real Drive-CORS failure made the plugin fetch bytes from us
// instead of Drive directly) — all fetched from inside a Figma plugin's
// sandboxed runtime, a different, Figma-controlled origin our config can't
// (and shouldn't) know in advance. Confirmed by testing against a real
// Origin: null header (what the plugin's own main-thread sandbox actually
// sends) that Figma's networkAccess manifest field does NOT bypass the
// target server's own CORS check the way it might sound like it does —
// this server-side opening is what actually makes the fetch succeed, not
// the manifest alone.
//
// Part X: this CORS carve-out is now moot in practice — the requireAuth
// gate below applies to these three routes too (a deliberate, confirmed
// choice: closing the real data-exposure gap outweighed keeping the Figma
// plugin working), and a Figma plugin has no way to present our session
// cookie from its sandboxed origin, so every request through here now
// 401s regardless of CORS. Left in place rather than removed — it's still
// correct/harmless, and ready to matter again once a later part gives the
// plugin its own machine-to-machine auth (an API key bypassing requireAuth
// for just these paths, most likely) rather than session cookies.
const CORS_OPEN_PATHS_RE = /^\/api\/generate\/results(\/[^/]+\/figma-export(\/image)?)?$/

// Part X: gates every route except the two that must work before a session
// can even exist. POST /api/auth/login is how a session gets created in
// the first place; GET /api/health is an infra liveness check with no user
// context at all. Every other route — including /api/auth/logout, /me,
// /users (requireAdmin layers on top of this inside auth.routes.js), and
// the three CORS-open Figma routes above — goes through this.
const PUBLIC_ROUTES = [
  { method: 'GET', path: '/api/health' },
  { method: 'POST', path: '/api/auth/login' },
]

export function createApp() {
  const app = express()

  const restrictiveCors = cors({ origin: config.corsOrigin, credentials: true })
  // credentials: true here too — omitting it (the original bug) makes cors
  // skip the Access-Control-Allow-Credentials response header, so any
  // fetch(..., {credentials:'include'}) to a CORS_OPEN_PATHS_RE route (which
  // is exactly what GalleryContext's getGeneratedResults() sends, since it
  // needs the session cookie) gets silently rejected by the browser as a
  // network-level "Failed to fetch" — even though Railway's own logs show
  // the server responding 200. Confirmed live: the same request with
  // {credentials:'omit'} gets a clean 401 (proves CORS, not connectivity),
  // and {credentials:'include'} reproduces "Failed to fetch" every time.
  // This was surfacing to the user as "생성 중 오류가 발생했습니다: Failed
  // to fetch" — both on Gallery's initial mount fetch and on the
  // post-generation onDone refetch.
  const permissiveCors = cors({ origin: true, credentials: true })
  app.use((req, res, next) => (
    CORS_OPEN_PATHS_RE.test(req.path) ? permissiveCors(req, res, next) : restrictiveCors(req, res, next)
  ))
  app.use(express.json())
  app.use(cookieParser())

  app.use((req, res, next) => {
    const isPublic = PUBLIC_ROUTES.some((r) => r.method === req.method && r.path === req.path)
    return isPublic ? next() : requireAuth(req, res, next)
  })

  app.get('/api/health', (req, res) => res.json({ ok: true }))
  app.use('/api/auth', authRoutes)
  app.use('/api/collect', collectRoutes)
  app.use('/api/ads', adsRoutes)
  app.use('/api/products', productsRoutes)
  app.use('/api/generate', generationRoutes)
  app.use('/api/credentials', credentialsRoutes)

  app.use((req, res) => res.status(404).json({ error: 'Not found' }))

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
  })

  return app
}
