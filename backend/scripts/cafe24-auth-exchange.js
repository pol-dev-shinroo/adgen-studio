// One-time helper, step 2 of 2: exchanges the authorization code (copied
// from the Cafe24CallbackPage after approving in the browser — see
// cafe24-auth.js) for an access/refresh token pair, saved to the gitignored
// backend/data/cafe24-tokens.json.
//
// Usage: node scripts/cafe24-auth-exchange.js <brandKey> <code>
// The code expires within minutes, so run this right after copying it.

import { config } from '../src/config/index.js'
import { exchangeCodeForTokens } from '../src/services/cafe24.client.js'

const [brandKey, code] = process.argv.slice(2)
const validKeys = config.brands.map((b) => b.key)

if (!brandKey || !code || !validKeys.includes(brandKey)) {
  console.error(`Usage: node scripts/cafe24-auth-exchange.js <${validKeys.join('|')}> <code>`)
  process.exit(1)
}

try {
  await exchangeCodeForTokens(brandKey, code, config.cafe24RedirectUri)
  console.log(`Success! Tokens for "${brandKey}" saved to backend/data/cafe24-tokens.json.`)
  console.log('(That file is gitignored — keep it out of version control.)')
} catch (err) {
  console.error('Token exchange failed:', err.message)
  process.exitCode = 1
}
