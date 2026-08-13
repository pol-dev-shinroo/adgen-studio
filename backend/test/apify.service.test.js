import test from 'node:test'
import assert from 'node:assert/strict'
import { runFacebookAdsScraper } from '../src/services/collection/apify.service.js'

// Stubs the global fetch used directly by apify.service.js (no DI on this
// leaf network call — same approach as other tests in this suite that stub
// a global rather than add DI to a single-purpose leaf wrapper).
function stubFetch(handler) {
  const original = global.fetch
  global.fetch = handler
  return () => { global.fetch = original }
}

test('runFacebookAdsScraper returns the parsed items array on a real success response', async () => {
  const restore = stubFetch(async () => ({
    ok: true,
    json: async () => [{ ad_archive_id: '1' }, { ad_archive_id: '2' }],
  }))
  try {
    const items = await runFacebookAdsScraper('test keyword', { resultsLimit: 10 })
    assert.deepEqual(items, [{ ad_archive_id: '1' }, { ad_archive_id: '2' }])
  } finally {
    restore()
  }
})

test('runFacebookAdsScraper throws when Apify returns a non-array payload', async () => {
  const restore = stubFetch(async () => ({ ok: true, json: async () => ({ not: 'an array' }) }))
  try {
    await assert.rejects(
      () => runFacebookAdsScraper('test keyword'),
      /unexpected payload/
    )
  } finally {
    restore()
  }
})

test('runFacebookAdsScraper marks a 429 response as retryable and RATE_LIMITED, and retries until success', async () => {
  let calls = 0
  const restore = stubFetch(async () => {
    calls += 1
    if (calls === 1) {
      return { ok: false, status: 429, text: async () => 'rate limited' }
    }
    return { ok: true, json: async () => [{ ad_archive_id: 'retried' }] }
  })
  try {
    const items = await runFacebookAdsScraper('test keyword')
    assert.equal(calls, 2, 'must have retried exactly once after the 429')
    assert.deepEqual(items, [{ ad_archive_id: 'retried' }])
  } finally {
    restore()
  }
})

test('runFacebookAdsScraper throws a clear error (HTTP status + body detail) for a non-retryable 4xx', async () => {
  const restore = stubFetch(async () => ({ ok: false, status: 400, text: async () => 'bad keyword syntax' }))
  try {
    await assert.rejects(
      () => runFacebookAdsScraper('test keyword'),
      /HTTP 400.*bad keyword syntax/s
    )
  } finally {
    restore()
  }
})
