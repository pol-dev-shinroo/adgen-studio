import { config } from '../config/index.js'

const ACTOR_ENDPOINT = 'https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items'
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

function adsLibraryUrl(keyword) {
  return 'https://www.facebook.com/ads/library/' +
    `?active_status=active&ad_type=all&country=KR&q=${encodeURIComponent(keyword)}&search_type=keyword_unordered`
}

export async function runFacebookAdsScraper(keyword, { resultsLimit = 200, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
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
      throw new Error(`Apify actor call failed for "${keyword}" (HTTP ${res.status}): ${detail}`)
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
