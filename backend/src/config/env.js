import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { computeMigratedFields } from './brands.js'
import { MIGRATABLE_CREDENTIAL_KEYS } from './credentialsVault.js'

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
// initCredentialsFromVault()/applyCredentialToConfig() (credentialsVault.js)
// once a vault value is actually available. Exported (not module-private)
// since credentialsVault.js's applyCredentialToConfig mutates it in place.
export const resolvedEnv = {}
for (const key of MIGRATABLE_CREDENTIAL_KEYS) {
  resolvedEnv[key] = (process.env[key] || '').trim()
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
