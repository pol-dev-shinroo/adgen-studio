import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const REQUIRED = ['APIFY_TOKEN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'SHEET_ID']
const missing = REQUIRED.filter((name) => !process.env[name] || !process.env[name].trim())
if (missing.length) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}. ` +
    'Copy backend/.env.example to backend/.env and fill them in ' +
    '(run scripts/google-auth.js to obtain GOOGLE_REFRESH_TOKEN).'
  )
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
//    yet). Some-but-not-all set -> fail-fast, since a half-filled single
//    brand is always a mistake, never an intentional state.
// 2. OpenAI + Pinecone: required together, but only once at least one brand
//    is configured (no point demanding API keys for a feature with zero
//    brands to run it on yet).
const BRAND_DEFS = [
  { key: 'healthykiki', name: '헬시키키', prefix: 'CAFE24_HEALTHYKIKI' },
  { key: 'kikibeauty', name: '키키뷰티', prefix: 'CAFE24_KIKIBEAUTY' },
]

function readBrand(def) {
  const varNames = ['MALL_ID', 'CLIENT_ID', 'CLIENT_SECRET'].map((suffix) => `${def.prefix}_${suffix}`)
  const present = varNames.filter((name) => process.env[name] && process.env[name].trim())

  if (present.length === 0) return null // not onboarded yet — not an error
  if (present.length < varNames.length) {
    const missingNames = varNames.filter((name) => !present.includes(name))
    throw new Error(
      `Cafe24 brand "${def.key}" is partially configured — missing: ${missingNames.join(', ')}. ` +
      `Either set all three ${def.prefix}_* variables in backend/.env, or leave all three blank to skip this brand for now.`
    )
  }

  return {
    key: def.key,
    name: def.name,
    mallId: process.env[`${def.prefix}_MALL_ID`].trim(),
    clientId: process.env[`${def.prefix}_CLIENT_ID`].trim(),
    clientSecret: process.env[`${def.prefix}_CLIENT_SECRET`].trim(),
  }
}

const brands = BRAND_DEFS.map(readBrand).filter(Boolean)

const AI_VARS = ['OPENAI_API_KEY', 'PINECONE_API_KEY']
const aiPresent = AI_VARS.filter((name) => process.env[name] && process.env[name].trim())

if (brands.length > 0 && aiPresent.length < AI_VARS.length) {
  const stillMissing = AI_VARS.filter((name) => !aiPresent.includes(name))
  throw new Error(
    `Product sync has at least one Cafe24 brand configured but is missing: ${stillMissing.join(', ')}. ` +
    'Set both OPENAI_API_KEY and PINECONE_API_KEY in backend/.env, or remove every CAFE24_* variable to disable product sync entirely.'
  )
}

const productSyncConfigured = brands.length > 0 && aiPresent.length === AI_VARS.length

export const config = {
  apifyToken: process.env.APIFY_TOKEN.trim(),
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

  productSyncConfigured,
  brands: productSyncConfigured ? brands : [],
  openaiApiKey: productSyncConfigured ? process.env.OPENAI_API_KEY.trim() : null,
  pineconeApiKey: productSyncConfigured ? process.env.PINECONE_API_KEY.trim() : null,
  pineconeIndex: (process.env.PINECONE_INDEX || 'adgen-products').trim(),
  // Cafe24's app registration rejects "localhost" as a redirect URI (it
  // requires a real, publicly resolvable domain), so the one-time OAuth
  // consent flow (scripts/cafe24-auth.js) redirects to a real deployed page
  // instead of a local callback server. Defaults to the project's live
  // Vercel deployment; overridable if that domain ever changes.
  cafe24RedirectUri: (process.env.CAFE24_REDIRECT_URI || 'https://adgen-studio-red.vercel.app/cafe24-callback').trim(),
}
