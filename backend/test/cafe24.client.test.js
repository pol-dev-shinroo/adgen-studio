import test from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../src/config/index.js'
import { getAccessToken, isAuthorized, exchangeCodeForTokens } from '../src/services/cafe24/cafe24.client.js'

const BRAND_KEY = config.brands[0].key
const FIVE_MIN_MS = 5 * 60 * 1000

test('getAccessToken: returns the cached token as-is when it is well within its expiry window (no refresh call)', async () => {
  const entry = { accessToken: 'cached-at', refreshToken: 'rt-1', expiresAt: Date.now() + 60 * 60 * 1000, refreshExpiresAt: null }
  let requestTokenCalled = false
  const token = await getAccessToken(BRAND_KEY, {
    getTokenEntryFn: async () => entry,
    requestTokenFn: async () => { requestTokenCalled = true; return {} },
    saveTokenEntryFn: async () => {},
  })
  assert.equal(token, 'cached-at')
  assert.equal(requestTokenCalled, false, 'a token well within its expiry window must never trigger a real refresh call')
})

test('getAccessToken: refreshes when the cached token is inside the safety margin (real risk case: expired-but-unrefreshed)', async () => {
  // Inside the 5-minute safety margin but not technically expired yet.
  const entry = { accessToken: 'stale-at', refreshToken: 'rt-1', expiresAt: Date.now() + (FIVE_MIN_MS - 1000), refreshExpiresAt: null }
  let requestTokenArgs
  const token = await getAccessToken(BRAND_KEY, {
    getTokenEntryFn: async () => entry,
    requestTokenFn: async (brand, bodyParams) => {
      requestTokenArgs = { brand, bodyParams }
      return { access_token: 'fresh-at', refresh_token: 'fresh-rt', expires_at: new Date(Date.now() + 7200000).toISOString() }
    },
    saveTokenEntryFn: async () => {},
  })
  assert.equal(token, 'fresh-at')
  assert.equal(requestTokenArgs.bodyParams.grant_type, 'refresh_token')
  assert.equal(requestTokenArgs.bodyParams.refresh_token, 'rt-1')
})

test('getAccessToken: refreshes when the cached token is already fully expired', async () => {
  const entry = { accessToken: 'expired-at', refreshToken: 'rt-1', expiresAt: Date.now() - 60000, refreshExpiresAt: null }
  const token = await getAccessToken(BRAND_KEY, {
    getTokenEntryFn: async () => entry,
    requestTokenFn: async () => ({
      access_token: 'fresh-at-2', refresh_token: 'fresh-rt-2', expires_at: new Date(Date.now() + 7200000).toISOString(),
    }),
    saveTokenEntryFn: async () => {},
  })
  assert.equal(token, 'fresh-at-2')
})

test('getAccessToken: persists the newly-rotated token pair after a real refresh', async () => {
  const entry = { accessToken: 'old', refreshToken: 'old-rt', expiresAt: Date.now() - 1, refreshExpiresAt: null }
  let saved
  await getAccessToken(BRAND_KEY, {
    getTokenEntryFn: async () => entry,
    requestTokenFn: async () => ({
      access_token: 'rotated-at', refresh_token: 'rotated-rt',
      expires_at: new Date(2026, 0, 1).toISOString(), refresh_token_expires_at: new Date(2026, 0, 14).toISOString(),
    }),
    saveTokenEntryFn: async (brandKey, savedEntry) => { saved = { brandKey, savedEntry } },
  })
  assert.equal(saved.brandKey, BRAND_KEY)
  assert.equal(saved.savedEntry.accessToken, 'rotated-at')
  assert.equal(saved.savedEntry.refreshToken, 'rotated-rt')
  assert.equal(saved.savedEntry.expiresAt, new Date(2026, 0, 1).getTime())
  assert.equal(saved.savedEntry.refreshExpiresAt, new Date(2026, 0, 14).getTime())
})

test('getAccessToken: throws a clear, actionable error when no tokens have ever been stored for this brand', async () => {
  await assert.rejects(
    () => getAccessToken(BRAND_KEY, { getTokenEntryFn: async () => null }),
    /cafe24-auth\.js/
  )
})

test('getAccessToken: throws for an unknown/unconfigured brand key', async () => {
  await assert.rejects(() => getAccessToken('not-a-real-brand'))
})

test('isAuthorized: true when a token entry exists, false when it doesn\'t — never triggers a refresh', async () => {
  assert.equal(await isAuthorized(BRAND_KEY, { getTokenEntryFn: async () => ({ accessToken: 'x' }) }), true)
  assert.equal(await isAuthorized(BRAND_KEY, { getTokenEntryFn: async () => null }), false)
})

test('exchangeCodeForTokens: real success exchanges the code and persists the returned token pair', async () => {
  let requestTokenArgs
  let saved
  const entry = await exchangeCodeForTokens(BRAND_KEY, 'real-auth-code', 'https://example.com/callback', {
    requestTokenFn: async (brand, bodyParams) => {
      requestTokenArgs = { brand, bodyParams }
      return { access_token: 'first-at', refresh_token: 'first-rt', expires_at: new Date(2026, 0, 1).toISOString() }
    },
    saveTokenEntryFn: async (brandKey, savedEntry) => { saved = { brandKey, savedEntry } },
  })
  assert.equal(requestTokenArgs.bodyParams.grant_type, 'authorization_code')
  assert.equal(requestTokenArgs.bodyParams.code, 'real-auth-code')
  assert.equal(requestTokenArgs.bodyParams.redirect_uri, 'https://example.com/callback')
  assert.equal(saved.brandKey, BRAND_KEY)
  assert.equal(entry.accessToken, 'first-at')
})
