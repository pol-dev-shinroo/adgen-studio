import { config } from '../config/index.js'
import { getTokenEntry, saveTokenEntry } from './cafe24TokenStore.service.js'

// Unlike google.client.js's static long-lived refresh token, Cafe24 access
// tokens expire in ~2 hours AND the refresh token itself rotates (and
// expires in ~2 weeks) on every single use — so the token pair genuinely
// changes over time and has to live in mutable, persisted storage, not just
// process memory. Stored in the same Google Sheet the rest of the app
// already uses (see cafe24TokenStore.service.js) rather than a local file —
// the backend runs on Railway now, whose container filesystem is wiped on
// every redeploy, and a local file also can't be written to by whoever
// completes the OAuth consent in their own browser, a different machine.

const SAFETY_MARGIN_MS = 5 * 60 * 1000 // refresh a bit before actual expiry, not right at it
const TOKEN_ENDPOINT_PATH = '/api/v2/oauth/token'
const AUTHORIZE_ENDPOINT_PATH = '/api/v2/oauth/authorize'
const SCOPE = 'mall.read_product' // read-only — this app never writes back to Cafe24

function requireBrand(brandKey) {
  const brand = config.brands.find((b) => b.key === brandKey)
  if (!brand) {
    throw new Error(`Unknown or unconfigured Cafe24 brand "${brandKey}"`)
  }
  return brand
}

async function saveTokens(brandKey, tokenResponse) {
  const entry = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: new Date(tokenResponse.expires_at).getTime(),
    refreshExpiresAt: tokenResponse.refresh_token_expires_at
      ? new Date(tokenResponse.refresh_token_expires_at).getTime()
      : null,
  }
  await saveTokenEntry(brandKey, entry)
  return entry
}

async function requestToken(brand, bodyParams) {
  const basicAuth = Buffer.from(`${brand.clientId}:${brand.clientSecret}`).toString('base64')
  const res = await fetch(`https://${brand.mallId}.cafe24api.com${TOKEN_ENDPOINT_PATH}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(bodyParams).toString(),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Cafe24 token request failed for "${brand.key}" (HTTP ${res.status}): ${detail.slice(0, 300)}`)
  }
  return res.json()
}

// Returns a valid access token for the brand, refreshing (and persisting
// the rotated pair) if the cached one is missing or close to expiry.
export async function getAccessToken(brandKey) {
  const brand = requireBrand(brandKey)
  const entry = await getTokenEntry(brandKey)

  if (!entry) {
    throw new Error(
      `No Cafe24 tokens stored for "${brandKey}" yet — run ` +
      `"node scripts/cafe24-auth.js ${brandKey}" once to authorize this mall.`
    )
  }

  if (entry.expiresAt - SAFETY_MARGIN_MS > Date.now()) {
    return entry.accessToken
  }

  const refreshed = await requestToken(brand, {
    grant_type: 'refresh_token',
    refresh_token: entry.refreshToken,
  })
  const saved = await saveTokens(brandKey, refreshed)
  return saved.accessToken
}

// Status-display only: whether this brand has ever completed the one-time
// auth flow, without triggering a network token refresh (unlike
// getAccessToken, which is meant to be called right before an actual API
// request).
export async function isAuthorized(brandKey) {
  const entry = await getTokenEntry(brandKey)
  return Boolean(entry)
}

// --- One-time setup path, used by scripts/cafe24-auth.js ---

export function getAuthorizeUrl(brandKey, redirectUri) {
  const brand = requireBrand(brandKey)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: brand.clientId,
    state: brandKey,
    redirect_uri: redirectUri,
    scope: SCOPE,
  })
  return `https://${brand.mallId}.cafe24api.com${AUTHORIZE_ENDPOINT_PATH}?${params.toString()}`
}

export async function exchangeCodeForTokens(brandKey, code, redirectUri) {
  const brand = requireBrand(brandKey)
  const tokenResponse = await requestToken(brand, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
  return saveTokens(brandKey, tokenResponse)
}
