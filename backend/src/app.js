import express from 'express'
import collectRoutes from './routes/collect.routes.js'

export function createApp() {
  const app = express()

  app.use(express.json())

  app.get('/api/health', (req, res) => res.json({ ok: true }))
  app.use('/api/collect', collectRoutes)

  app.use((req, res) => res.status(404).json({ error: 'Not found' }))

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
  })

  return app
}
