// Pure brand-derivation logic — takes an env snapshot (never reads
// process.env directly) so it works identically whether that snapshot came
// from process.env alone (initial boot) or has vault values layered on top
// (post-migration boot, or a live Settings-UI edit). No imports back into
// env.js/credentialsVault.js — kept dependency-free on purpose so it can be
// safely imported from either without any circular-import concern.

// Product sync (Cafe24 + OpenAI + Pinecone) is a separate, optional
// integration layered on top of the core ad-collection pipeline, and —
// unlike the vars required unconditionally — brands get onboarded one at a
// time in practice (헬시키키 first, 키키뷰티 later), so validation happens
// at two independent levels rather than one all-or-nothing blob:
//
// 1. Per brand: each brand's 3 CAFE24_* vars (MALL_ID/CLIENT_ID/CLIENT_SECRET)
//    are validated as their own group. None set -> that brand is simply
//    omitted from config.brands (not an error — it just isn't onboarded
//    yet). Some-but-all set -> depends on `strict` (see below).
// 2. OpenAI + Pinecone: required together, but only once at least one brand
//    is configured (no point demanding API keys for a feature with zero
//    brands to run it on yet).
export const BRAND_DEFS = [
  { key: 'healthykiki', name: '헬시키키', prefix: 'CAFE24_HEALTHYKIKI' },
  { key: 'kikibeauty', name: '키키뷰티', prefix: 'CAFE24_KIKIBEAUTY' },
]

// strict=true (the original, pre-Part-Y behavior) throws on a
// partially-filled brand — appropriate for the one-time process.env-only
// boot computation, where a half-filled .env is always a real mistake
// worth failing fast on. strict=false (the vault-driven path, used by both
// the async boot-time vault read and any later live edit) instead just
// logs a warning and treats it as "not configured yet" — throwing
// asynchronously well after boot, or throwing inside an admin's
// Settings-UI credential edit request, would be much worse UX for what's
// often a genuinely transient state (e.g. an admin who's saved 2 of a
// brand's 3 Cafe24 fields so far).
export function readBrand(env, def, { strict }) {
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

export const AI_KEYS = ['OPENAI_API_KEY', 'PINECONE_API_KEY']

// Derives the { apifyToken, brands, productSyncConfigured, openaiApiKey,
// pineconeApiKey } bundle from a resolved-env snapshot — the one thing
// every migratable config field is actually computed from, whether that
// snapshot came from process.env alone (initial boot) or has vault values
// layered on top (post-migration boot, or a live Settings-UI edit).
export function computeMigratedFields(env, { strict }) {
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
