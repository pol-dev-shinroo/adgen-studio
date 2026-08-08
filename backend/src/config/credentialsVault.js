import { computeMigratedFields } from './brands.js'
import { config, resolvedEnv } from './env.js'

// Part Z note on the circular import below (env.js <-> credentialsVault.js):
// env.js needs MIGRATABLE_CREDENTIAL_KEYS (synchronously, at module-eval
// time, to seed resolvedEnv before building `config`); this file needs
// `config`/`resolvedEnv` back from env.js, but only inside function bodies
// (applyCredentialToConfig/initCredentialsFromVault), never at this
// module's own top level. That split is what makes the cycle safe — by
// the time either function actually runs, both modules have finished
// evaluating. This only works with index.js importing './env.js' before
// './credentialsVault.js' (see the comment there) so env.js is the one
// that starts the load; do not reorder those two lines.
export const MIGRATABLE_CREDENTIAL_KEYS = [
  'APIFY_TOKEN',
  'OPENAI_API_KEY',
  'PINECONE_API_KEY',
  'CAFE24_HEALTHYKIKI_MALL_ID', 'CAFE24_HEALTHYKIKI_CLIENT_ID', 'CAFE24_HEALTHYKIKI_CLIENT_SECRET',
  'CAFE24_KIKIBEAUTY_MALL_ID', 'CAFE24_KIKIBEAUTY_CLIENT_ID', 'CAFE24_KIKIBEAUTY_CLIENT_SECRET',
]

// Mutates the shared `config` object's migratable fields in place — used
// both by initCredentialsFromVault() below (boot-time, once per key that
// resolved) and by credentials.service.js's setCredential() (a live
// Settings-UI edit, immediately after a successful encrypted write) so an
// edit takes effect without a redeploy/restart. Every existing call site
// (`config.openaiApiKey`, `config.brands.find(...)`, etc.) reads this same
// object fresh on every call, so the mutation alone is enough — see the 9
// OpenAI/Pinecone service files (cachedApiClient.js, Part Z) for the one
// place that needed its own fix too (each caches its SDK client keyed by
// which API key built it, and rebuilds when that key changes).
export function applyCredentialToConfig(key, value) {
  resolvedEnv[key] = (value || '').trim()
  Object.assign(config, computeMigratedFields(resolvedEnv, { strict: false }))
}

// Called once at boot (server.js), after the synchronous process.env-based
// config already exists as a real, working fallback. Non-fatal on any
// individual failure (a missing Credentials tab on a fresh deploy that
// hasn't migrated yet, a transient Sheets error, ...) — logs a warning and
// leaves that key's env-based fallback in place rather than crashing the
// whole boot over an optional vault read.
export async function initCredentialsFromVault() {
  // Deferred import: credentials.service.js imports `config` from
  // config/index.js, which re-exports this file — so a static top-of-file
  // import here would recreate the exact circular-import problem this
  // pattern already avoided pre-Part-Z (back when everything lived in one
  // config/index.js file). Safe because neither module accesses the
  // other's exports at its own top level (module-evaluation time), only
  // inside function bodies called later, after both modules have fully
  // evaluated — same reasoning verified for auth.service.js in Part X.
  const { getCredential } = await import('../services/auth/credentials.service.js')

  for (const key of MIGRATABLE_CREDENTIAL_KEYS) {
    try {
      const value = await getCredential(key)
      if (value) applyCredentialToConfig(key, value)
    } catch (err) {
      console.warn(`Failed to read credential "${key}" from the vault, keeping the env-based fallback: ${err.message}`)
    }
  }
}
