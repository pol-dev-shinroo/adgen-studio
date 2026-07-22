import express from 'express'
import cors from 'cors'
import { config } from './config/index.js'
import collectRoutes from './routes/collect.routes.js'
import adsRoutes from './routes/ads.routes.js'

export function createApp() {
  const app = express()

  app.use(cors({ origin: config.corsOrigin }))
  app.use(express.json())

  app.get('/api/health', (req, res) => res.json({ ok: true }))
  app.use('/api/collect', collectRoutes)
  app.use('/api/ads', adsRoutes)

  app.use((req, res) => res.status(404).json({ error: 'Not found' }))

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
  })

  return app
}
