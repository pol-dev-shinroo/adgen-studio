// One-time helper, step 1 of 2: prints the URL to authorize this app against
// a single Cafe24 mall. Step 2 is cafe24-auth-exchange.js.
//
// Cafe24's app registration rejects "localhost" redirect URIs outright
// ("domain 형식이 올바르지 않습니다" — it requires a real, publicly
// resolvable domain, not just an HTTPS scheme), so this can't run a local
// callback server the way scripts/google-auth.js does. Instead, Cafe24
// redirects the browser to a real page on this project's live Vercel
// deployment (src/pages/Cafe24CallbackPage.jsx, config.cafe24RedirectUri),
// which displays the authorization code for you to copy — the client
// secret and the actual token exchange never leave your machine.
//
// Usage:
//   1. Fill in the CAFE24_<BRAND>_* vars for at least one brand, plus
//      OPENAI_API_KEY/PINECONE_API_KEY, in backend/.env.
//   2. In the Cafe24 app's console.cafe24.com registration, set the
//      redirect URI to exactly config.cafe24RedirectUri (printed below).
//   3. node scripts/cafe24-auth.js <brandKey>
//   4. Open the printed URL, sign in as a mall admin, approve.
//   5. Copy the command shown on the resulting page and run it —
//      that's cafe24-auth-exchange.js, which finishes the flow.

import { config } from '../src/config/index.js'
import { getAuthorizeUrl } from '../src/services/cafe24.client.js'

const brandKey = process.argv[2]
const validKeys = config.brands.map((b) => b.key)

if (!brandKey || !validKeys.includes(brandKey)) {
  console.error(
    !config.productSyncConfigured
      ? 'Product sync is not configured yet — fill in at least one Cafe24 brand plus OPENAI_API_KEY/PINECONE_API_KEY in backend/.env first.'
      : `Usage: node scripts/cafe24-auth.js <${validKeys.join('|')}>`
  )
  process.exit(1)
}

const authorizeUrl = getAuthorizeUrl(brandKey, config.cafe24RedirectUri)

console.log(`Redirect URI (must be registered exactly as-is in the Cafe24 app console): ${config.cafe24RedirectUri}\n`)
console.log('1. Open this URL in your browser:')
console.log('\n' + authorizeUrl + '\n')
console.log(`2. Sign in as an admin of the "${brandKey}" mall and approve.`)
console.log('3. You\'ll land on a page showing a command like:')
console.log(`   node scripts/cafe24-auth-exchange.js ${brandKey} <code>`)
console.log('   Copy and run it (from this backend/ directory) to finish and save the tokens.')
