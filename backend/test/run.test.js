import test from 'node:test'
import assert from 'node:assert/strict'
import { startGeneration, getJob } from '../src/services/generation/run.js'

// Waits for a fire-and-forget jobStore job to reach a terminal status — same
// helper/convention as productSync.service.test.js (runJob isn't awaited
// directly by startGeneration; the real frontend polls the same way).
async function waitForJob(jobId, { timeoutMs = 2000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const job = getJob(jobId)
    if (job.status === 'done' || job.status === 'failed') return job
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for generation job to finish')
}

const BRAND_DEF = { key: 'testbrand', name: '테스트브랜드' }

// Part DD: refAdConfigs replaces the old flat refAdIds/formats/quantity —
// each entry carries its own ad's formats/quantity.
function baseInput(overrides = {}) {
  return {
    refBrand: '경쟁사',
    refAdConfigs: [{ adId: 'ad-1', formats: ['1:1'], quantity: 1 }],
    brand: { key: 'testbrand', productIds: ['1'] },
    styleIntensity: 50,
    instructions: '',
    adCopyOverride: null,
    referenceSheetImageUrl: null,
    styleReferenceType: null,
    ...overrides,
  }
}

// CC-1: every real external call run.js's runJob/startGeneration make
// (prepareInputs's own Sheets reads, image download/upload, vision/
// research/copywriting/render, the generated-row write) is replaced with an
// injected fake — same DI convention as productSync.service.test.js's
// startSync(brandKey, deps) and prepareInputs.js's own getAllProductsFn/
// getAllAdsFn. Never touches a real Sheets/OpenAI call.
function makeDeps({ renderFinalImageFn, prepareInputsFn, appendCalls = [] } = {}) {
  return {
    prepareInputsFn: prepareInputsFn ?? (async () => ({
      brandDef: BRAND_DEF,
      products: [{ productId: '1', extractedImageUrl: 'https://example.com/p1.png' }],
      refAds: [{ 'Ad Archive ID': 'ad-1', 'Archived Image Links': 'https://example.com/ad1.png' }],
    })),
    downloadImageAsBase64Fn: async (url) => ({ base64: `b64:${url}` }),
    analyzeReferenceAdFn: async () => ({
      identified_texts: [{ location: '상단', text: '71% 특가' }],
      product_instances: [{ location: '중앙', description: '제품 사진' }],
    }),
    findCounterFactsFn: async () => ({ counter_facts: [{ category: '가격', fact: '51% 특가' }] }),
    writeReplacementCopyFn: async () => ({
      replacements: [{ location: '상단', original_text: '71% 특가', new_text: '51% 특가' }],
    }),
    renderFinalImageFn: renderFinalImageFn ?? (async () => 'RENDERED_BASE64'),
    uploadGeneratedImageFn: async (_base64, { fileName }) => `https://cdn.example.com/${fileName}`,
    appendGeneratedRowFn: async (row) => { appendCalls.push(row) },
  }
}

test('startGeneration: full success path renders, uploads, and writes exactly one row', async () => {
  const appendCalls = []
  const jobId = await startGeneration(baseInput(), makeDeps({ appendCalls }))
  const job = await waitForJob(jobId)

  assert.equal(job.status, 'done')
  assert.equal(job.error, null)
  assert.ok(job.finishedAt, 'finishedAt must be set once the job is done')
  assert.equal(job.progress.phase, 'done')
  assert.equal(job.progress.totalRenders, 1)
  assert.equal(job.progress.rendersDone, 1)

  assert.equal(job.summary.succeeded, 1)
  assert.equal(job.summary.failed, 0)
  assert.deepEqual(job.summary.failures, [])
  assert.equal(job.summary.resultIds.length, 1)

  assert.equal(appendCalls.length, 1, 'the one successful render must be written')
  assert.equal(appendCalls[0]['Product ID'], '1')
  assert.equal(appendCalls[0]['Reference Ad ID'], 'ad-1')
  assert.equal(appendCalls[0]['Image URL'], `https://cdn.example.com/${job.summary.resultIds[0]}.png`)
  assert.equal(appendCalls[0]['Status'], '미승인')
  assert.equal(appendCalls[0]['Ref Brand'], '경쟁사', 'the job-level refBrand must be threaded into every written row')
})

// CC-1's core requirement: a mid-batch render failure must not discard
// already-succeeded (already-paid) renders — product 1's render/upload/
// write must still happen and be counted, even though product 2's render
// call throws.
test('startGeneration: partial failure — one product\'s render fails, the other still succeeds and gets written', async () => {
  const appendCalls = []
  const prepareInputsFn = async () => ({
    brandDef: BRAND_DEF,
    products: [
      { productId: '1', extractedImageUrl: 'https://example.com/p1.png' },
      { productId: '2', extractedImageUrl: 'https://example.com/p2.png' },
    ],
    refAds: [{ 'Ad Archive ID': 'ad-1', 'Archived Image Links': 'https://example.com/ad1.png' }],
  })
  const renderFinalImageFn = async ({ productImageBase64 }) => {
    if (productImageBase64 === 'b64:https://example.com/p2.png') {
      throw new Error('render failed for product 2')
    }
    return 'RENDERED_BASE64'
  }

  const input = baseInput({ brand: { key: 'testbrand', productIds: ['1', '2'] } })
  const jobId = await startGeneration(input, makeDeps({ prepareInputsFn, renderFinalImageFn, appendCalls }))
  const job = await waitForJob(jobId)

  // Job-level status is still 'done' — a per-render failure doesn't fail
  // the whole job, only that one render slot.
  assert.equal(job.status, 'done')
  assert.equal(job.progress.phase, 'done')
  assert.equal(job.progress.totalRenders, 2)
  assert.equal(job.progress.rendersDone, 2, 'both render attempts must be counted, success or fail')

  assert.equal(job.summary.succeeded, 1, 'product 1\'s render must be counted as a success')
  assert.equal(job.summary.failed, 1, 'product 2\'s render must be counted as a failure')
  assert.equal(job.summary.failures.length, 1)
  assert.equal(job.summary.failures[0].productId, '2')
  assert.equal(job.summary.failures[0].adId, 'ad-1')
  assert.equal(job.summary.failures[0].error, 'render failed for product 2')
  assert.equal(job.summary.resultIds.length, 1)

  // The already-succeeded render (product 1) must actually have been
  // written — not discarded because its sibling (product 2) failed.
  assert.equal(appendCalls.length, 1, 'only the successful render is written, but it IS written')
  assert.equal(appendCalls[0]['Product ID'], '1')
})

test('startGeneration: a reference ad with no usable image link fails immediately without ever calling the render pipeline', async () => {
  const appendCalls = []
  const prepareInputsFn = async () => ({
    brandDef: BRAND_DEF,
    products: [{ productId: '1', extractedImageUrl: 'https://example.com/p1.png' }],
    // No 'Archived Image Links', 'Archived Thumbnail', or 'Image Links' at all.
    refAds: [{ 'Ad Archive ID': 'ad-2' }],
  })
  let renderCalls = 0
  const renderFinalImageFn = async () => { renderCalls += 1; return 'RENDERED_BASE64' }

  const input = baseInput({ refAdConfigs: [{ adId: 'ad-2', formats: ['1:1'], quantity: 1 }] })
  const jobId = await startGeneration(input, makeDeps({ prepareInputsFn, renderFinalImageFn, appendCalls }))
  const job = await waitForJob(jobId)

  assert.equal(job.status, 'done')
  assert.equal(job.summary.succeeded, 0)
  assert.equal(job.summary.failed, 1)
  assert.equal(job.summary.failures.length, 1)
  assert.equal(job.summary.failures[0].adId, 'ad-2')
  assert.equal(job.summary.failures[0].error, 'No image available for this reference ad')
  assert.equal(job.summary.resultIds.length, 0)
  assert.equal(appendCalls.length, 0, 'nothing gets written when the only reference ad has no image')
  assert.equal(renderCalls, 0, 'the render pipeline must never be invoked for an ad with no image link')
})

test('startGeneration: multiple formats/quantity multiply totalRenders and every render is counted correctly', async () => {
  const appendCalls = []
  const input = baseInput({ refAdConfigs: [{ adId: 'ad-1', formats: ['1:1', '4:5'], quantity: 2 }] })
  const jobId = await startGeneration(input, makeDeps({ appendCalls }))
  const job = await waitForJob(jobId)

  assert.equal(job.status, 'done')
  assert.equal(job.progress.totalRenders, 4) // 1 product x (2 formats x 2 quantity for this one ad)
  assert.equal(job.progress.rendersDone, 4)
  assert.equal(job.summary.succeeded, 4)
  assert.equal(job.summary.failed, 0)
  assert.equal(appendCalls.length, 4)
})

// Part DD: each selected reference ad now carries its own formats/quantity
// — this is the whole point of the change, so it needs its own dedicated
// coverage beyond the single-ad cases above.
test('startGeneration: two reference ads with genuinely different formats/quantity each render exactly their own amount', async () => {
  const appendCalls = []
  const prepareInputsFn = async () => ({
    brandDef: BRAND_DEF,
    products: [{ productId: '1', extractedImageUrl: 'https://example.com/p1.png' }],
    refAds: [
      { 'Ad Archive ID': 'ad-1', 'Archived Image Links': 'https://example.com/ad1.png' },
      { 'Ad Archive ID': 'ad-2', 'Archived Image Links': 'https://example.com/ad2.png' },
    ],
  })
  // ad-1: 1 format x 1 quantity = 1 render. ad-2: 2 formats x 2 quantity = 4 renders. Total 5.
  const input = baseInput({
    refAdConfigs: [
      { adId: 'ad-1', formats: ['1:1'], quantity: 1 },
      { adId: 'ad-2', formats: ['1:1', '4:5'], quantity: 2 },
    ],
  })
  const jobId = await startGeneration(input, makeDeps({ prepareInputsFn, appendCalls }))
  const job = await waitForJob(jobId)

  assert.equal(job.status, 'done')
  assert.equal(job.progress.totalRenders, 5)
  assert.equal(job.progress.rendersDone, 5)
  assert.equal(job.summary.succeeded, 5)
  assert.equal(appendCalls.length, 5)

  const ad1Rows = appendCalls.filter((r) => r['Reference Ad ID'] === 'ad-1')
  const ad2Rows = appendCalls.filter((r) => r['Reference Ad ID'] === 'ad-2')
  assert.equal(ad1Rows.length, 1, 'ad-1 must produce exactly its own 1 render, not ad-2\'s amount')
  assert.equal(ad2Rows.length, 4, 'ad-2 must produce exactly its own 4 renders, not ad-1\'s amount')
})

// Part DD: full face replacement at maximum style intensity only when a
// real model-type style reference is present — threaded from
// startGeneration's input all the way to renderFinalImageFn.
test('startGeneration: threads styleReferenceType through to renderFinalImageFn', async () => {
  let capturedType
  const renderFinalImageFn = async ({ styleReferenceType }) => { capturedType = styleReferenceType; return 'RENDERED_BASE64' }
  const input = baseInput({ referenceSheetImageUrl: 'https://example.com/model.png', styleReferenceType: 'model' })
  const jobId = await startGeneration(input, makeDeps({ renderFinalImageFn }))
  await waitForJob(jobId)

  assert.equal(capturedType, 'model')
})
