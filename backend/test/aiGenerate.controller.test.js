import test from 'node:test'
import assert from 'node:assert/strict'
import { postSegment, postRender, postBackgroundImage, applyTextDecisionOverrides } from '../src/controllers/aiGenerate.controller.js'

function makeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

function makeNext() {
  const calls = []
  const next = (...args) => calls.push(args)
  next.calls = calls
  return next
}

// --- postSegment ---

test('postSegment: 400 when refAdId is missing', async () => {
  const res = makeRes()
  await postSegment({ body: {} }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('postSegment: 404 when no ad matches refAdId', async () => {
  const res = makeRes()
  await postSegment(
    { body: { refAdId: 'missing' } }, res, makeNext(),
    { getAllAdsFn: async () => [{ 'Ad Archive ID': 'ad-1' }] }
  )
  assert.equal(res.statusCode, 404)
})

test('postSegment: 400 when the matched ad has no image available', async () => {
  const res = makeRes()
  await postSegment(
    { body: { refAdId: 'ad-1' } }, res, makeNext(),
    { getAllAdsFn: async () => [{ 'Ad Archive ID': 'ad-1' }] }
  )
  assert.equal(res.statusCode, 400)
})

test('postSegment: real success downloads the resolved image and returns segments + imageUrl', async () => {
  const res = makeRes()
  await postSegment(
    { body: { refAdId: 'ad-1' } }, res, makeNext(),
    {
      getAllAdsFn: async () => [{ 'Ad Archive ID': 'ad-1', 'Archived Image Links': 'https://example.com/ad.jpg' }],
      downloadImageAsBase64Fn: async (url) => { assert.equal(url, 'https://example.com/ad.jpg'); return { base64: 'B64' } },
      segmentReferenceAdFn: async (base64) => { assert.equal(base64, 'B64'); return { segments: [{ id: 'background-0' }] } },
    }
  )
  assert.equal(res.statusCode, null)
  assert.deepEqual(res.body, { segments: [{ id: 'background-0' }], imageUrl: 'https://example.com/ad.jpg' })
})

// --- postSegment: sourceImageUrl override (Part OO) ---

test('postSegment: sourceImageUrl skips the ad lookup entirely and segments that image directly', async () => {
  const res = makeRes()
  let getAllAdsCalled = false
  await postSegment(
    { body: { refAdId: 'ad-1', sourceImageUrl: 'https://example.com/our-own-result.png' } }, res, makeNext(),
    {
      getAllAdsFn: async () => { getAllAdsCalled = true; return [] },
      downloadImageAsBase64Fn: async (url) => { assert.equal(url, 'https://example.com/our-own-result.png'); return { base64: 'B64' } },
      segmentReferenceAdFn: async (base64) => { assert.equal(base64, 'B64'); return { segments: [{ id: 'background-0' }] } },
    }
  )
  assert.equal(res.statusCode, null)
  assert.equal(getAllAdsCalled, false, 'the ads sheet must never be read when sourceImageUrl is present')
  assert.deepEqual(res.body, { segments: [{ id: 'background-0' }], imageUrl: 'https://example.com/our-own-result.png' })
})

test('postSegment: still requires refAdId even when sourceImageUrl is present', async () => {
  const res = makeRes()
  await postSegment({ body: { sourceImageUrl: 'https://example.com/our-own-result.png' } }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('postSegment: 400 for an implausible sourceImageUrl', async () => {
  const res = makeRes()
  await postSegment({ body: { refAdId: 'ad-1', sourceImageUrl: 'not-a-url' } }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

// --- postBackgroundImage (Part FF-2) ---

test('postBackgroundImage: 400 when refAdId is missing', async () => {
  const res = makeRes()
  await postBackgroundImage({ body: {} }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('postBackgroundImage: 404 when no ad matches refAdId', async () => {
  const res = makeRes()
  await postBackgroundImage(
    { body: { refAdId: 'missing' } }, res, makeNext(),
    { getAllAdsFn: async () => [{ 'Ad Archive ID': 'ad-1' }] }
  )
  assert.equal(res.statusCode, 404)
})

test('postBackgroundImage: 400 when the matched ad has no image available', async () => {
  const res = makeRes()
  await postBackgroundImage(
    { body: { refAdId: 'ad-1' } }, res, makeNext(),
    { getAllAdsFn: async () => [{ 'Ad Archive ID': 'ad-1' }] }
  )
  assert.equal(res.statusCode, 400)
})

test('postBackgroundImage: real success downloads the ad image, isolates it, uploads the result, and returns its URL', async () => {
  const res = makeRes()
  let uploadArgs = null
  await postBackgroundImage(
    { body: { refAdId: 'ad-1' } }, res, makeNext(),
    {
      getAllAdsFn: async () => [{ 'Ad Archive ID': 'ad-1', 'Archived Image Links': 'https://example.com/ad.jpg' }],
      downloadImageAsBase64Fn: async (url) => { assert.equal(url, 'https://example.com/ad.jpg'); return { base64: 'B64' } },
      isolateAdBackgroundFn: async (base64) => { assert.equal(base64, 'B64'); return 'ISOLATED_B64' },
      uploadImageFn: async (base64, args) => {
        uploadArgs = { base64, ...args }
        return 'https://drive.google.com/file/d/bg123/view'
      },
    }
  )
  assert.equal(res.statusCode, null)
  assert.deepEqual(res.body, { backgroundImageUrl: 'https://drive.google.com/file/d/bg123/view' })
  assert.equal(uploadArgs.base64, 'ISOLATED_B64')
  assert.equal(uploadArgs.rootFolderName, 'AdGen AI Studio Backgrounds')
  assert.equal(uploadArgs.subfolder, 'ad-1')
  assert.match(uploadArgs.fileName, /^background-.+\.png$/)
})

// --- postBackgroundImage: sourceImageUrl override (Part OO) ---

test('postBackgroundImage: sourceImageUrl skips the ad lookup and isolates the background from that image directly', async () => {
  const res = makeRes()
  let getAllAdsCalled = false
  await postBackgroundImage(
    { body: { refAdId: 'ad-1', sourceImageUrl: 'https://example.com/our-own-result.png' } }, res, makeNext(),
    {
      getAllAdsFn: async () => { getAllAdsCalled = true; return [] },
      downloadImageAsBase64Fn: async (url) => { assert.equal(url, 'https://example.com/our-own-result.png'); return { base64: 'B64' } },
      isolateAdBackgroundFn: async (base64) => { assert.equal(base64, 'B64'); return 'ISOLATED_B64' },
      uploadImageFn: async () => 'https://drive.google.com/file/d/bg123/view',
    }
  )
  assert.equal(res.statusCode, null)
  assert.equal(getAllAdsCalled, false)
  assert.deepEqual(res.body, { backgroundImageUrl: 'https://drive.google.com/file/d/bg123/view' })
})

// --- applyTextDecisionOverrides ---

test('applyTextDecisionOverrides overrides new_text when a segment correlates by exact text match', () => {
  const replacements = [{ location: 'top', original_text: '최대 71% 할인', new_text: 'AI 제안 문구' }]
  const textSegments = [{ id: 'text-1', text: '최대 71% 할인' }]
  const result = applyTextDecisionOverrides(replacements, textSegments, {
    'text-1': { mode: 'custom', value: '직접 입력한 문구' },
  })
  assert.equal(result[0].new_text, '직접 입력한 문구')
  assert.equal(replacements[0].new_text, 'AI 제안 문구', 'must not mutate the input array')
})

test('applyTextDecisionOverrides leaves the copywriting suggestion alone when correlation fails', () => {
  const replacements = [{ location: 'top', original_text: '다른 문구', new_text: 'AI 제안' }]
  const textSegments = [{ id: 'text-1', text: '세그멘테이션이 다르게 읽은 문구' }]
  const result = applyTextDecisionOverrides(replacements, textSegments, {
    'text-1': { mode: 'custom', value: '직접 입력' },
  })
  assert.equal(result[0].new_text, 'AI 제안')
})

test('applyTextDecisionOverrides never overrides a mode:"replace" text decision (styling reference, not a content override)', () => {
  const replacements = [{ location: 'top', original_text: '문구', new_text: 'AI 제안' }]
  const textSegments = [{ id: 'text-1', text: '문구' }]
  const result = applyTextDecisionOverrides(replacements, textSegments, {
    'text-1': { mode: 'replace', value: 'https://example.com/copy-style.png' },
  })
  assert.equal(result[0].new_text, 'AI 제안')
})

// --- postRender ---

function validRenderBody(overrides = {}) {
  return {
    refAdId: 'ad-1',
    refBrand: '경쟁사A',
    brand: { key: 'healthykiki', productId: '1' },
    formats: ['1:1 피드'],
    quantity: 1,
    decisions: { background: { mode: 'keep', value: null }, texts: {}, model: null, product: { mode: 'keep', value: null } },
    segments: [],
    ...overrides,
  }
}

function fakeRenderDeps(overrides = {}) {
  const appendCalls = []
  return {
    getAllAdsFn: async () => [{ 'Ad Archive ID': 'ad-1', 'Archived Image Links': 'https://example.com/ad.jpg' }],
    getAllProductsFn: async () => [{
      'Brand': '헬시키키', 'Product ID': '1', 'Product Name': '제품A',
      'Extracted References JSON': JSON.stringify([{ type: 'product', imageUrl: 'https://example.com/product.png' }]),
    }],
    downloadImageAsBase64Fn: async (url) => ({ base64: `B64(${url})`, mimeType: 'image/png' }),
    analyzeReferenceAdFn: async () => ({ identified_texts: [{ location: 'top', text: '원본 문구' }], product_instances: [] }),
    findCounterFactsFn: async () => ({ counter_facts: [] }),
    writeReplacementCopyFn: async () => ({ replacements: [{ location: 'top', original_text: '원본 문구', new_text: 'AI 제안' }] }),
    renderConversationalImageFn: async () => 'RENDERED_B64',
    uploadGeneratedImageFn: async () => 'https://drive.google.com/file/d/generated/view',
    appendGeneratedRowFn: async (row) => { appendCalls.push(row) },
    ...overrides,
    _appendCalls: appendCalls,
  }
}

test('postRender: 400 when refAdId is missing', async () => {
  const res = makeRes()
  await postRender({ body: validRenderBody({ refAdId: undefined }) }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('postRender: 400 when formats is empty', async () => {
  const res = makeRes()
  await postRender({ body: validRenderBody({ formats: [] }) }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('postRender: 400 when quantity is out of range', async () => {
  const res = makeRes()
  await postRender({ body: validRenderBody({ quantity: 0 }) }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('postRender: 400 when decisions is missing', async () => {
  const res = makeRes()
  await postRender({ body: validRenderBody({ decisions: undefined }) }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('postRender: 400 when brand.key is unknown', async () => {
  const res = makeRes()
  const deps = fakeRenderDeps()
  await postRender({ body: validRenderBody({ brand: { key: 'not-a-real-brand', productId: '1' } }) }, res, makeNext(), deps)
  assert.equal(res.statusCode, 400)
})

test('postRender: 404 when no ad matches refAdId', async () => {
  const res = makeRes()
  const deps = fakeRenderDeps({ getAllAdsFn: async () => [] })
  await postRender({ body: validRenderBody() }, res, makeNext(), deps)
  assert.equal(res.statusCode, 404)
})

test('postRender: 400 when the product has no extracted product-type reference', async () => {
  const res = makeRes()
  const deps = fakeRenderDeps({
    getAllProductsFn: async () => [{ 'Brand': '헬시키키', 'Product ID': '1', 'Product Name': '제품A', 'Extracted References JSON': '[]' }],
  })
  await postRender({ body: validRenderBody() }, res, makeNext(), deps)
  assert.equal(res.statusCode, 400)
  assert.match(res.body.error, /참조 이미지가 추출되지 않았습니다/)
})

test('postRender: real success renders once, uploads, appends a row with Ref Brand, and responds with a summary', async () => {
  const res = makeRes()
  const deps = fakeRenderDeps()
  await postRender({ body: validRenderBody() }, res, makeNext(), deps)

  assert.equal(res.statusCode, null)
  assert.equal(res.body.succeeded, 1)
  assert.equal(res.body.failed, 0)
  assert.equal(res.body.resultIds.length, 1)
  assert.equal(res.body.generationId, res.body.resultIds[0])

  assert.equal(deps._appendCalls.length, 1)
  const row = deps._appendCalls[0]
  assert.equal(row['Ref Brand'], '경쟁사A')
  assert.equal(row['Reference Ad ID'], 'ad-1')
  assert.equal(row['Product ID'], '1')
  assert.equal(row['Format'], '1:1 피드')
})

test('postRender: formats x quantity multiplies the number of renders, matching StudioContext\'s own math', async () => {
  const res = makeRes()
  const deps = fakeRenderDeps()
  await postRender(
    { body: validRenderBody({ formats: ['1:1 피드', '4:5 피드'], quantity: 2 }) }, res, makeNext(), deps
  )
  assert.equal(res.body.succeeded, 4)
  assert.equal(deps._appendCalls.length, 4)
})

test('postRender: a partial render failure is recorded but does not abort the remaining renders', async () => {
  const res = makeRes()
  let call = 0
  const deps = fakeRenderDeps({
    renderConversationalImageFn: async () => {
      call += 1
      if (call === 1) throw new Error('content policy violation')
      return 'RENDERED_B64'
    },
  })
  await postRender({ body: validRenderBody({ formats: ['1:1 피드'], quantity: 2 }) }, res, makeNext(), deps)

  assert.equal(res.body.succeeded, 1)
  assert.equal(res.body.failed, 1)
  assert.equal(res.body.failures[0].error, 'content policy violation')
})

test('postRender: total failure (succeeded 0) still responds 200 with a summary, not an error', async () => {
  const res = makeRes()
  const deps = fakeRenderDeps({
    renderConversationalImageFn: async () => { throw new Error('always fails') },
  })
  await postRender({ body: validRenderBody() }, res, makeNext(), deps)

  assert.equal(res.statusCode, null)
  assert.equal(res.body.succeeded, 0)
  assert.equal(res.body.failed, 1)
  assert.equal(res.body.generationId, null)
})

// --- postRender: sourceImageUrl override (Part OO) ---

test('postRender: sourceImageUrl is downloaded/analyzed/rendered against instead of the competitor ad image, but referenceAdImageUrl in the persisted row still points at the TRUE original ad', async () => {
  const res = makeRes()
  const downloadedUrls = []
  let analyzedBase64 = null
  let renderedReferenceBase64 = null
  const deps = fakeRenderDeps({
    downloadImageAsBase64Fn: async (url) => { downloadedUrls.push(url); return { base64: `B64(${url})` } },
    analyzeReferenceAdFn: async (base64) => {
      analyzedBase64 = base64
      return { identified_texts: [{ location: 'top', text: '원본 문구' }], product_instances: [] }
    },
    renderConversationalImageFn: async ({ referenceImageBase64 }) => {
      renderedReferenceBase64 = referenceImageBase64
      return 'RENDERED_B64'
    },
  })

  await postRender(
    { body: validRenderBody({ sourceImageUrl: 'https://example.com/our-own-prior-result.png' }) },
    res, makeNext(), deps
  )

  assert.equal(res.body.succeeded, 1)
  // The competitor ad's own image link ('https://example.com/ad.jpg', from
  // fakeRenderDeps' getAllAdsFn) must never be downloaded/analyzed/rendered
  // against once sourceImageUrl is present — only sourceImageUrl itself is.
  assert.ok(downloadedUrls.includes('https://example.com/our-own-prior-result.png'))
  assert.ok(!downloadedUrls.includes('https://example.com/ad.jpg'))
  assert.equal(analyzedBase64, 'B64(https://example.com/our-own-prior-result.png)')
  assert.equal(renderedReferenceBase64, 'B64(https://example.com/our-own-prior-result.png)')

  // Lineage: the persisted row's referenceAdImageUrl must still be the TRUE
  // original competitor ad's image — the 비교 modal's "경쟁사 원본" must never
  // silently rebase to "our own previous result."
  assert.equal(deps._appendCalls[0]['Reference Ad Image URL'], 'https://example.com/ad.jpg')
})

test('postRender: 400 for an implausible sourceImageUrl', async () => {
  const res = makeRes()
  await postRender({ body: validRenderBody({ sourceImageUrl: 'not-a-url' }) }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('postRender: without sourceImageUrl, behaves exactly as before — analyzes/renders against the competitor ad image', async () => {
  const res = makeRes()
  const deps = fakeRenderDeps()
  await postRender({ body: validRenderBody() }, res, makeNext(), deps)

  assert.equal(res.body.succeeded, 1)
  assert.equal(deps._appendCalls[0]['Reference Ad Image URL'], 'https://example.com/ad.jpg')
})

test('postRender: a background/model/copy-style "replace" decision downloads and threads the picked image into materialImages', async () => {
  const res = makeRes()
  const downloadedUrls = []
  const deps = fakeRenderDeps({
    downloadImageAsBase64Fn: async (url) => { downloadedUrls.push(url); return { base64: `B64(${url})` } },
    renderConversationalImageFn: async ({ materialImages }) => {
      assert.equal(materialImages.length, 2)
      assert.deepEqual(materialImages.map((m) => m.role).sort(), ['background', 'model-face'])
      return 'RENDERED_B64'
    },
  })
  await postRender({
    body: validRenderBody({
      decisions: {
        background: { mode: 'replace', value: 'https://example.com/bg.png' },
        texts: {},
        model: { mode: 'replace', value: 'https://example.com/model.png' },
        product: { mode: 'keep', value: null },
      },
    }),
  }, res, makeNext(), deps)

  assert.equal(res.body.succeeded, 1)
  assert.ok(downloadedUrls.includes('https://example.com/bg.png'))
  assert.ok(downloadedUrls.includes('https://example.com/model.png'))
})
