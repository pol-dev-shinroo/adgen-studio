import express from 'express'
import cors from 'cors'
import { config } from './config/index.js'
import collectRoutes from './routes/collect.routes.js'
import adsRoutes from './routes/ads.routes.js'
import productsRoutes from './routes/products.routes.js'
import generationRoutes from './routes/generation.routes.js'

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
// All three are read-only/non-mutating/free (no paid API calls, no writes)
// — POST /api/generate (starts a real paid job) and PATCH .../results/:id
// (mutates approval status) are deliberately NOT matched here and stay
// exactly as locked-down as every other endpoint. A permissive cors()
// layered on *after* the restrictive one via app.use wouldn't actually work
// — the restrictive instance already intercepts and terminates CORS
// preflight (OPTIONS) requests for every path before any later middleware
// runs — so instead this dispatches to one cors() instance or the other
// based on path, decided before either one runs.
const CORS_OPEN_PATHS_RE = /^\/api\/generate\/results(\/[^/]+\/figma-export(\/image)?)?$/

export function createApp() {
  const app = express()

  const restrictiveCors = cors({ origin: config.corsOrigin })
  const permissiveCors = cors({ origin: true })
  app.use((req, res, next) => (
    CORS_OPEN_PATHS_RE.test(req.path) ? permissiveCors(req, res, next) : restrictiveCors(req, res, next)
  ))
  app.use(express.json())

  app.get('/api/health', (req, res) => res.json({ ok: true }))
  app.use('/api/collect', collectRoutes)
  app.use('/api/ads', adsRoutes)
  app.use('/api/products', productsRoutes)
  app.use('/api/generate', generationRoutes)

  app.use((req, res) => res.status(404).json({ error: 'Not found' }))

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
  })

  return app
}
