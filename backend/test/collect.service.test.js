import test from 'node:test'
import assert from 'node:assert/strict'
import { startCollection, getJob } from '../src/services/collection/collect.service.js'

// Waits for a fire-and-forget jobStore job to reach a terminal status — same
// convention as productSync.service.test.js/run.test.js.
async function waitForJob(jobId, { timeoutMs = 2000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const job = getJob(jobId)
    if (job.status === 'done' || job.status === 'failed') return job
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for collection job to finish')
}

function rawItem(overrides = {}) {
  return {
    adArchiveID: '1001',
    pageName: '테스트브랜드',
    isActive: true,
    snapshot: {
      title: '테스트 광고',
      body: { text: '본문' },
      images: [{ originalImageUrl: 'https://example.com/img1.jpg' }],
      cards: [],
      videos: [],
    },
    ...overrides,
  }
}

test('startCollection: a full successful run archives media, upserts real rows, and produces a correct summary', async () => {
  const uploadedUrls = []
  const upsertCalls = []

  const jobId = startCollection(['키워드1'], 50, {
    runFacebookAdsScraperFn: async () => [rawItem(), rawItem({ adArchiveID: '1002' })],
    uploadFromUrlFn: async (url) => { uploadedUrls.push(url); return { link: `archived:${url}`, reused: false } },
    upsertAdRowsFn: async (rows) => {
      upsertCalls.push(rows)
      return {
        appended: rows.length, updated: 0, unchanged: 0,
        statuses: rows.map((r) => ({ adArchiveId: r['Ad Archive ID'], status: 'appended' })),
      }
    },
  })

  const job = await waitForJob(jobId)

  assert.equal(job.status, 'done')
  assert.equal(job.progress.phase, 'done')
  assert.equal(job.summary.totalAds, 2)
  assert.equal(job.summary.appended, 2)
  assert.equal(job.summary.updated, 0)
  assert.equal(job.summary.unchanged, 0)
  assert.equal(job.summary.mediaUploaded, 2, 'one image per ad, both uploaded successfully')
  assert.equal(uploadedUrls.length, 2)
  assert.equal(upsertCalls.length, 1)
  assert.equal(upsertCalls[0].length, 2)

  // recentItems must be back-filled from upsertAdRows's real per-ad status,
  // not left at the provisional 'processing' placeholder.
  assert.ok(job.progress.recentItems.every((item) => item.status === 'appended'))
  assert.equal(job.progress.recentItems[0].thumbnail, 'archived:https://example.com/img1.jpg')
})

test('startCollection: an item with no Ad Archive ID is dropped before it ever reaches upsertAdRows', async () => {
  const upsertCalls = []
  const jobId = startCollection(['키워드1'], 50, {
    runFacebookAdsScraperFn: async () => [rawItem({ adArchiveID: '' }), rawItem({ adArchiveID: '1002' })],
    uploadFromUrlFn: async (url) => ({ link: `archived:${url}`, reused: false }),
    upsertAdRowsFn: async (rows) => {
      upsertCalls.push(rows)
      return { appended: rows.length, updated: 0, unchanged: 0, statuses: rows.map((r) => ({ adArchiveId: r['Ad Archive ID'], status: 'appended' })) }
    },
  })

  const job = await waitForJob(jobId)

  assert.equal(job.status, 'done')
  assert.equal(job.summary.totalAds, 2, 'both raw items counted toward totalAds')
  assert.equal(job.summary.appended, 1, 'only the item with a real Ad Archive ID was ever upserted')
  assert.equal(upsertCalls[0].length, 1)
  assert.equal(upsertCalls[0][0]['Ad Archive ID'], '1002')
})

test('startCollection: a single dead media URL is logged and skipped, not fatal to the job', async () => {
  const jobId = startCollection(['키워드1'], 50, {
    runFacebookAdsScraperFn: async () => [rawItem({
      snapshot: {
        title: 't', body: { text: 'b' }, cards: [], videos: [],
        images: [{ originalImageUrl: 'https://example.com/good.jpg' }, { originalImageUrl: 'https://example.com/dead.jpg' }],
      },
    })],
    uploadFromUrlFn: async (url) => {
      if (url.includes('dead')) throw new Error('404 not found')
      return { link: `archived:${url}`, reused: false }
    },
    upsertAdRowsFn: async (rows) => ({ appended: rows.length, updated: 0, unchanged: 0, statuses: rows.map((r) => ({ adArchiveId: r['Ad Archive ID'], status: 'appended' })) }),
  })

  const job = await waitForJob(jobId)

  assert.equal(job.status, 'done')
  assert.equal(job.summary.mediaUploaded, 1)
  assert.equal(job.summary.mediaFailed, 1)
})

test('startCollection: a scraper failure marks the job failed with the RATE_LIMITED Korean message', async () => {
  const jobId = startCollection(['키워드1'], 50, {
    runFacebookAdsScraperFn: async () => {
      const err = new Error('rate limited upstream')
      err.code = 'RATE_LIMITED'
      throw err
    },
  })

  const job = await waitForJob(jobId)

  assert.equal(job.status, 'failed')
  assert.equal(job.errorCode, 'RATE_LIMITED')
  assert.match(job.error, /API 요청 한도를 초과했습니다/)
})

test('startCollection: a non-rate-limit scraper failure marks the job failed with the raw error message', async () => {
  const jobId = startCollection(['키워드1'], 50, {
    runFacebookAdsScraperFn: async () => { throw new Error('unexpected Apify shape') },
  })

  const job = await waitForJob(jobId)

  assert.equal(job.status, 'failed')
  assert.equal(job.errorCode, null)
  assert.equal(job.error, 'unexpected Apify shape')
})

test('startCollection: multiple keywords each get their own perKeyword summary entry and totals accumulate across all of them', async () => {
  const jobId = startCollection(['키워드1', '키워드2'], 50, {
    runFacebookAdsScraperFn: async (keyword) =>
      keyword === '키워드1' ? [rawItem({ adArchiveID: '1' })] : [rawItem({ adArchiveID: '2' }), rawItem({ adArchiveID: '3' })],
    uploadFromUrlFn: async (url) => ({ link: `archived:${url}`, reused: false }),
    upsertAdRowsFn: async (rows) => ({ appended: rows.length, updated: 0, unchanged: 0, statuses: rows.map((r) => ({ adArchiveId: r['Ad Archive ID'], status: 'appended' })) }),
  })

  const job = await waitForJob(jobId)

  assert.equal(job.status, 'done')
  assert.equal(job.summary.totalAds, 3)
  assert.equal(job.summary.appended, 3)
  assert.equal(job.summary.perKeyword.length, 2)
  assert.deepEqual(job.summary.perKeyword.map((k) => k.keyword), ['키워드1', '키워드2'])
  assert.equal(job.summary.perKeyword[0].ads, 1)
  assert.equal(job.summary.perKeyword[1].ads, 2)
})
