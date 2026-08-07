import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

// Bootstrap secrets — needed just to REACH the vault (or, for
// SESSION_JWT_SECRET, to validate a session before any vault lookup could
// even happen) — so these can never live inside the vault themselves and
// always come straight from real Railway env vars, unchanged by Part Y.
const REQUIRED = [
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'SHEET_ID',
  'SESSION_JWT_SECRET',
  'CREDENTIALS_ENCRYPTION_KEY',
]
const missing = REQUIRED.filter((name) => !process.env[name] || !process.env[name].trim())
if (missing.length) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}. ` +
    'Copy backend/.env.example to backend/.env and fill them in ' +
    '(run scripts/google-auth.js to obtain GOOGLE_REFRESH_TOKEN).'
  )
}

// Part Y: every one of these used to be read straight from process.env
// below — now they're "migratable": the credentials vault (a Sheets tab,
// see credentials.service.js) is the preferred source once
// scripts/create-admin.js's migration step has run, but process.env stays
// a real, working fallback for any key not yet migrated (so a fresh
// deploy that hasn't run the migration script doesn't hard-fail) and for
// this whole test suite, which never touches the real vault at all.
// resolvedEnv is seeded from process.env synchronously below — this is
// the exact value set every existing test and a not-yet-migrated deploy
// already depends on — then selectively overwritten by
// initCredentialsFromVault()/applyCredentialToConfig() once a vault value
// is actually available.
export const MIGRATABLE_CREDENTIAL_KEYS = [
  'APIFY_TOKEN',
  'OPENAI_API_KEY',
  'PINECONE_API_KEY',
  'CAFE24_HEALTHYKIKI_MALL_ID', 'CAFE24_HEALTHYKIKI_CLIENT_ID', 'CAFE24_HEALTHYKIKI_CLIENT_SECRET',
  'CAFE24_KIKIBEAUTY_MALL_ID', 'CAFE24_KIKIBEAUTY_CLIENT_ID', 'CAFE24_KIKIBEAUTY_CLIENT_SECRET',
]

const resolvedEnv = {}
for (const key of MIGRATABLE_CREDENTIAL_KEYS) {
  resolvedEnv[key] = (process.env[key] || '').trim()
}

// Product sync (Cafe24 + OpenAI + Pinecone) is a separate, optional
// integration layered on top of the core ad-collection pipeline above, and
// — unlike the vars required unconditionally — brands get onboarded one at
// a time in practice (헬시키키 first, 키키뷰티 later), so validation happens
// at two independent levels rather than one all-or-nothing blob:
//
// 1. Per brand: each brand's 3 CAFE24_* vars (MALL_ID/CLIENT_ID/CLIENT_SECRET)
//    are validated as their own group. None set -> that brand is simply
//    omitted from config.brands (not an error — it just isn't onboarded
//    yet). Some-but-all set -> depends on `strict` (see below).
// 2. OpenAI + Pinecone: required together, but only once at least one brand
//    is configured (no point demanding API keys for a feature with zero
//    brands to run it on yet).
const BRAND_DEFS = [
  { key: 'healthykiki', name: '헬시키키', prefix: 'CAFE24_HEALTHYKIKI' },
  { key: 'kikibeauty', name: '키키뷰티', prefix: 'CAFE24_KIKIBEAUTY' },
]

// strict=true (the original, pre-Part-Y behavior) throws on a
// partially-filled brand — appropriate for the one-time process.env-only
// boot computation below, where a half-filled .env is always a real
// mistake worth failing fast on. strict=false (the vault-driven path,
// used by both the async boot-time vault read and any later live edit)
// instead just logs a warning and treats it as "not configured yet" —
// throwing asynchronously well after boot, or throwing inside an admin's
// Settings-UI credential edit request, would be much worse UX for what's
// often a genuinely transient state (e.g. an admin who's saved 2 of a
// brand's 3 Cafe24 fields so far).
function readBrand(env, def, { strict }) {
  const varNames = ['MALL_ID', 'CLIENT_ID', 'CLIENT_SECRET'].map((suffix) => `${def.prefix}_${suffix}`)
  const present = varNames.filter((name) => env[name])

  if (present.length === 0) return null
  if (present.length < varNames.length) {
    const missingNames = varNames.filter((name) => !present.includes(name))
    const message = `Cafe24 brand "${def.key}" is partially configured — missing: ${missingNames.join(', ')}.`
    if (strict) {
      throw new Error(
        `${message} Either set all three ${def.prefix}_* variables in backend/.env, or leave all three blank to skip this brand for now.`
      )
    }
    console.warn(`${message} Treating as not configured until all three are set.`)
    return null
  }

  return {
    key: def.key,
    name: def.name,
    mallId: env[`${def.prefix}_MALL_ID`],
    clientId: env[`${def.prefix}_CLIENT_ID`],
    clientSecret: env[`${def.prefix}_CLIENT_SECRET`],
  }
}

const AI_KEYS = ['OPENAI_API_KEY', 'PINECONE_API_KEY']

// Derives the { apifyToken, brands, productSyncConfigured, openaiApiKey,
// pineconeApiKey } bundle from a resolved-env snapshot — the one thing
// every migratable config field is actually computed from, whether that
// snapshot came from process.env alone (initial boot) or has vault values
// layered on top (post-migration boot, or a live Settings-UI edit).
function computeMigratedFields(env, { strict }) {
  const brands = BRAND_DEFS.map((def) => readBrand(env, def, { strict })).filter(Boolean)
  const aiPresent = AI_KEYS.filter((name) => env[name])

  if (brands.length > 0 && aiPresent.length < AI_KEYS.length) {
    const stillMissing = AI_KEYS.filter((name) => !aiPresent.includes(name))
    const message = `Product sync has at least one Cafe24 brand configured but is missing: ${stillMissing.join(', ')}.`
    if (strict) {
      throw new Error(
        `${message} Set both OPENAI_API_KEY and PINECONE_API_KEY in backend/.env, or remove every CAFE24_* variable to disable product sync entirely.`
      )
    }
    console.warn(`${message} Product sync stays disabled until both are set.`)
  }

  const productSyncConfigured = brands.length > 0 && aiPresent.length === AI_KEYS.length

  return {
    apifyToken: env.APIFY_TOKEN || null,
    productSyncConfigured,
    brands: productSyncConfigured ? brands : [],
    openaiApiKey: productSyncConfigured ? env.OPENAI_API_KEY : null,
    pineconeApiKey: productSyncConfigured ? env.PINECONE_API_KEY : null,
  }
}

export const config = {
  googleClientId: process.env.GOOGLE_CLIENT_ID.trim(),
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN.trim(),
  sheetId: process.env.SHEET_ID.trim(),
  sheetTabName: (process.env.SHEET_TAB_NAME || '시트1').trim(),
  // Optional: pin the Drive media-archive root folder instead of
  // finding/creating "AdGen Media Archive" by name.
  driveFolderId: (process.env.DRIVE_FOLDER_ID || '').trim() || null,
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000').trim(),
  port: Number(process.env.PORT) || 4000,

  sessionJwtSecret: process.env.SESSION_JWT_SECRET.trim(),
  // Railway sets NODE_ENV=production automatically; local `npm start`/
  // `npm run dev` leave it unset. Drives the session cookie's Secure/
  // SameSite attributes (auth.controller.js) — a `Secure` cookie is
  // silently dropped by the browser over local http, and `SameSite=None`
  // requires `Secure` to be set at all, so these must flip together.
  isProduction: process.env.NODE_ENV === 'production',

  // Part Y: also bootstrap-only, for the same "needed to reach the vault"
  // reason as sessionJwtSecret above.
  credentialsEncryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY.trim(),

  // Part Y: computed once, synchronously, from process.env alone — the
  // exact original (pre-Part-Y) behavior, preserved as the real fallback
  // for a not-yet-migrated deploy and as what this entire test suite
  // exercises (no test ever calls initCredentialsFromVault(), so none of
  // them touch the real vault). `strict: true` here reproduces the
  // original fail-fast-on-partial-config behavior exactly.
  ...computeMigratedFields(resolvedEnv, { strict: true }),

  pineconeIndex: (process.env.PINECONE_INDEX || 'adgen-products').trim(),
  // Cafe24's app registration rejects "localhost" as a redirect URI (it
  // requires a real, publicly resolvable domain), so the one-time OAuth
  // consent flow (scripts/cafe24-auth.js) redirects to a real deployed page
  // instead of a local callback server. Defaults to the project's live
  // Vercel deployment; overridable if that domain ever changes.
  cafe24RedirectUri: (process.env.CAFE24_REDIRECT_URI || 'https://adgen-studio-red.vercel.app/cafe24-callback').trim(),
  // This server's own public URL — needed once (Part L) to hand back a
  // self-referencing absolute URL (the Figma-export image proxy route) in
  // an API response. Same hardcoded-default-with-env-override convention as
  // cafe24RedirectUri above, rather than deriving it from req.protocol/
  // req.get('host') — Railway sits behind a proxy, so trusting those
  // per-request would need its own "trust proxy" correctness story for no
  // real benefit over just knowing our own deployed URL.
  backendPublicUrl: (process.env.BACKEND_PUBLIC_URL || 'https://backend-production-5a23.up.railway.app').trim(),
}

// Mutates the shared `config` object's migratable fields in place — used
// both by initCredentialsFromVault() below (boot-time, once per key that
// resolved) and by credentials.service.js's setCredential() (a live
// Settings-UI edit, immediately after a successful encrypted write) so an
// edit takes effect without a redeploy/restart. Every existing call site
// (`config.openaiApiKey`, `config.brands.find(...)`, etc.) reads this same
// object fresh on every call, so the mutation alone is enough — see the 8
// OpenAI/Pinecone service files for the one place that needed its own fix
// too (each caches its SDK client keyed by which API key built it, and
// rebuilds when that key changes).
export function applyCredentialToConfig(key, value) {
  resolvedEnv[key] = (value || '').trim()
  Object.assign(config, computeMigratedFields(resolvedEnv, { strict: false }))
}

// Called once at boot (server.js), after the synchronous process.env-based
// config above already exists as a real, working fallback. Non-fatal on
// any individual failure (a missing Credentials tab on a fresh deploy that
// hasn't migrated yet, a transient Sheets error, ...) — logs a warning and
// leaves that key's env-based fallback in place rather than crashing the
// whole boot over an optional vault read.
export async function initCredentialsFromVault() {
  // Deferred import: credentials.service.js imports `config` from this
  // same module (it needs `sheetId`/`credentialsEncryptionKey`, which are
  // already fully resolved by the time any of its functions actually run)
  // — a real but harmless circular import, since neither module touches
  // the other's exports at its own top level, only inside function bodies
  // called later. Importing here rather than as a static top-of-file
  // import keeps that relationship obvious at the one call site that
  // actually needs it.
  const { getCredential } = await import('../services/credentials.service.js')

  for (const key of MIGRATABLE_CREDENTIAL_KEYS) {
    try {
      const value = await getCredential(key)
      if (value) applyCredentialToConfig(key, value)
    } catch (err) {
      console.warn(`Failed to read credential "${key}" from the vault, keeping the env-based fallback: ${err.message}`)
    }
  }
}
