import { config } from './config/index.js'
import { createApp } from './app.js'

const app = createApp()

app.listen(config.port, () => {
  console.log(`AdGen Studio backend listening on http://localhost:${config.port}`)
})
