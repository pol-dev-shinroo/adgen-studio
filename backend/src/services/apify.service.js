import { config } from '../config/index.js'
import { withRetry } from '../utils/retry.js'

const ACTOR_ENDPOINT = 'https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items'
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

function adsLibraryUrl(keyword) {
  return 'https://www.facebook.com/ads/library/' +
    `?active_status=active&ad_type=all&country=KR&q=${encodeURIComponent(keyword)}&search_type=keyword_unordered`
}

async function callActor(keyword, resultsLimit, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${ACTOR_ENDPOINT}?token=${encodeURIComponent(config.apifyToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: adsLibraryUrl(keyword) }],
        resultsLimit,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300)
      const err = new Error(`Apify actor call failed for "${keyword}" (HTTP ${res.status}): ${detail}`)
      if (res.status === 429) {
        err.retryable = true
        err.code = 'RATE_LIMITED'
      } else if (res.status >= 500) {
        err.retryable = true
        err.code = 'UPSTREAM_ERROR'
      }
      throw err
    }
    const items = await res.json()
    if (!Array.isArray(items)) {
      throw new Error(`Apify returned an unexpected payload for "${keyword}" (expected an array of ads)`)
    }
    return items
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Apify actor call for "${keyword}" timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// resultsLimit is capped at 200 by the caller (see collect.controller.js) —
// the actor runs synchronously over HTTP, and pulling more than that risks
// the request timing out before Apify finishes (already reduced once from
// 99999 for this reason; do not raise it back up).
export async function runFacebookAdsScraper(keyword, { resultsLimit = 200, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return withRetry(() => callActor(keyword, resultsLimit, timeoutMs), {
    isRetryable: (err) => err.retryable === true,
  })
}
