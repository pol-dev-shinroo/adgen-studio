import { config, initCredentialsFromVault } from './config/index.js'
import { createApp } from './app.js'

const app = createApp()

// Resolve migrated credentials from the vault before accepting traffic —
// non-fatal per-key (see initCredentialsFromVault), so a fresh/not-yet-
// migrated deploy still boots fine on the process.env fallback.
await initCredentialsFromVault()

app.listen(config.port, () => {
  console.log(`AdGen Studio backend listening on http://localhost:${config.port}`)
})
