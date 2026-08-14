import test from 'node:test'
import assert from 'node:assert/strict'
import {
  postGenerate, getGenerationStatus, getGeneratedResults,
  getGeneratedResultFigmaExport, getGeneratedResultFigmaExportImage, patchGeneratedStatus,
} from '../src/controllers/generation.controller.js'

function makeRes() {
  const res = { statusCode: null, body: null, headers: {}, sent: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  res.set = (name, value) => { res.headers[name] = value; return res }
  res.send = (buf) => { res.sent = buf; return res }
  return res
}

function makeNext() {
  const calls = []
  const next = (...args) => calls.push(args)
  next.calls = calls
  return next
}

// Part DD: refAdConfigs replaces the old flat refAdIds/formats/quantity —
// each entry carries its own ad's formats/quantity.
function validGenerateBody(overrides = {}) {
  return {
    refBrand: '안티칼',
    refAdConfigs: [{ adId: 'ad-1', formats: ['1:1'], quantity: 2 }],
    brand: { key: 'healthykiki', productIds: ['1'] },
    styleIntensity: 50,
    instructions: '',
    ...overrides,
  }
}

test('postGenerate: real success starts a job and returns 202 with jobId', async () => {
  const res = makeRes()
  await postGenerate(
    { body: validGenerateBody() },
    res,
    makeNext(),
    { startGenerationFn: async (input) => {
      assert.equal(input.brand.key, 'healthykiki')
      assert.deepEqual(input.refAdConfigs, [{ adId: 'ad-1', formats: ['1:1'], quantity: 2 }])
      return 'job-1'
    } }
  )
  assert.equal(res.statusCode, 202)
  assert.deepEqual(res.body, { jobId: 'job-1' })
})

test('postGenerate: 400 when refAdConfigs is empty', async () => {
  const res = makeRes()
  await postGenerate({ body: validGenerateBody({ refAdConfigs: [] }) }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('postGenerate: 400 when brand.productIds is missing', async () => {
  const res = makeRes()
  await postGenerate({ body: validGenerateBody({ brand: { key: 'healthykiki', productIds: [] } }) }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('postGenerate: 400 when a refAdConfigs entry has no formats, naming that ad', async () => {
  const res = makeRes()
  await postGenerate(
    { body: validGenerateBody({ refAdConfigs: [{ adId: 'ad-1', formats: [], quantity: 1 }] }) },
    res, makeNext()
  )
  assert.equal(res.statusCode, 400)
  assert.match(res.body.error, /ad-1/)
})

test('postGenerate: 400 when a refAdConfigs entry has no adId', async () => {
  const res = makeRes()
  await postGenerate(
    { body: validGenerateBody({ refAdConfigs: [{ formats: ['1:1'], quantity: 1 }] }) },
    res, makeNext()
  )
  assert.equal(res.statusCode, 400)
})

test('postGenerate: 400 for a refAdConfigs entry with an out-of-range quantity', async () => {
  const res = makeRes()
  await postGenerate(
    { body: validGenerateBody({ refAdConfigs: [{ adId: 'ad-1', formats: ['1:1'], quantity: 0 }] }) },
    res, makeNext()
  )
  assert.equal(res.statusCode, 400)

  const res2 = makeRes()
  await postGenerate(
    { body: validGenerateBody({ refAdConfigs: [{ adId: 'ad-1', formats: ['1:1'], quantity: 11 }] }) },
    res2, makeNext()
  )
  assert.equal(res2.statusCode, 400)
})

test('postGenerate: 400 for an out-of-range styleIntensity', async () => {
  const res = makeRes()
  await postGenerate({ body: validGenerateBody({ styleIntensity: 101 }) }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('postGenerate: err.badRequest from startGeneration maps to 400', async () => {
  const res = makeRes()
  const err = new Error('선택한 제품을 찾을 수 없습니다.')
  err.badRequest = true
  await postGenerate(
    { body: validGenerateBody() },
    res,
    makeNext(),
    { startGenerationFn: async () => { throw err } }
  )
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error, err.message)
})

test('postGenerate: an unrecognized error falls through to next()', async () => {
  const next = makeNext()
  const boom = new Error('unexpected')
  await postGenerate(
    { body: validGenerateBody() },
    makeRes(),
    next,
    { startGenerationFn: async () => { throw boom } }
  )
  assert.equal(next.calls[0][0], boom)
})

test('getGenerationStatus: real success returns the job status shape', () => {
  const res = makeRes()
  const job = {
    id: 'job-1', status: 'done', refBrand: '안티칼', brandKey: 'healthykiki', brandName: '헬시키키',
    startedAt: 't0', finishedAt: 't1', error: null, progress: { phase: 'done' }, summary: { succeeded: 1 },
  }
  getGenerationStatus({ params: { jobId: 'job-1' } }, res, { getJobFn: () => job })
  assert.equal(res.body.jobId, 'job-1')
  assert.equal(res.body.status, 'done')
  assert.deepEqual(res.body.summary, { succeeded: 1 })
})

test('getGenerationStatus: 404 for an unknown jobId', () => {
  const res = makeRes()
  getGenerationStatus({ params: { jobId: 'missing' } }, res, { getJobFn: () => null })
  assert.equal(res.statusCode, 404)
})

test('getGeneratedResults: real success returns the results list', async () => {
  const res = makeRes()
  const results = [{ 'Generation ID': 'g1' }]
  await getGeneratedResults({}, res, makeNext(), { getAllGeneratedResultsFn: async () => results })
  assert.deepEqual(res.body, { results })
})

test('getGeneratedResultFigmaExport: real success returns export metadata with a proxy imageUrl', async () => {
  const res = makeRes()
  const results = [{
    'Generation ID': 'g1', 'Brand': '헬시키키', 'Format': '1:1 피드', 'Replacements JSON': JSON.stringify([{ location: 'x' }]),
  }]
  await getGeneratedResultFigmaExport(
    { params: { id: 'g1' } }, res, makeNext(), { getAllGeneratedResultsFn: async () => results }
  )
  assert.equal(res.body.generationId, 'g1')
  assert.equal(res.body.brand, '헬시키키')
  assert.match(res.body.imageUrl, /\/api\/generate\/results\/g1\/figma-export\/image$/)
  assert.deepEqual(res.body.replacements, [{ location: 'x' }])
})

test('getGeneratedResultFigmaExport: defaults replacements to [] for a row with malformed/missing JSON', async () => {
  const res = makeRes()
  const results = [{ 'Generation ID': 'g1', 'Brand': 'x', 'Format': '1:1 피드' }]
  await getGeneratedResultFigmaExport(
    { params: { id: 'g1' } }, res, makeNext(), { getAllGeneratedResultsFn: async () => results }
  )
  assert.deepEqual(res.body.replacements, [])
})

test('getGeneratedResultFigmaExport: 404 when the Generation ID doesn\'t exist', async () => {
  const res = makeRes()
  await getGeneratedResultFigmaExport(
    { params: { id: 'missing' } }, res, makeNext(), { getAllGeneratedResultsFn: async () => [] }
  )
  assert.equal(res.statusCode, 404)
})

test('getGeneratedResultFigmaExportImage: real success proxies the real image bytes with the right content type', async () => {
  const res = makeRes()
  const results = [{ 'Generation ID': 'g1', 'Image URL': 'https://drive.google.com/file123' }]
  await getGeneratedResultFigmaExportImage(
    { params: { id: 'g1' } }, res, makeNext(),
    {
      getAllGeneratedResultsFn: async () => results,
      downloadImageAsBase64Fn: async (url) => {
        assert.equal(url, 'https://drive.google.com/file123')
        return { base64: Buffer.from('fake-image-bytes').toString('base64'), mimeType: 'image/png' }
      },
    }
  )
  assert.equal(res.headers['Content-Type'], 'image/png')
  assert.equal(res.sent.toString(), 'fake-image-bytes')
})

test('getGeneratedResultFigmaExportImage: 404 when the Generation ID doesn\'t exist', async () => {
  const res = makeRes()
  await getGeneratedResultFigmaExportImage(
    { params: { id: 'missing' } }, res, makeNext(), { getAllGeneratedResultsFn: async () => [] }
  )
  assert.equal(res.statusCode, 404)
})

test('patchGeneratedStatus: real success updates the status', async () => {
  const res = makeRes()
  let captured
  await patchGeneratedStatus(
    { params: { id: 'g1' }, body: { status: '승인' } },
    res,
    makeNext(),
    { updateGeneratedStatusFn: async (id, status) => { captured = { id, status } } }
  )
  assert.deepEqual(res.body, { ok: true })
  assert.deepEqual(captured, { id: 'g1', status: '승인' })
})

test('patchGeneratedStatus: 400 for an invalid status value', async () => {
  const res = makeRes()
  await patchGeneratedStatus({ params: { id: 'g1' }, body: { status: 'notarealstatus' } }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('patchGeneratedStatus: err.notFound maps to 404', async () => {
  const res = makeRes()
  const err = new Error('No result found')
  err.notFound = true
  await patchGeneratedStatus(
    { params: { id: 'missing' }, body: { status: '승인' } },
    res,
    makeNext(),
    { updateGeneratedStatusFn: async () => { throw err } }
  )
  assert.equal(res.statusCode, 404)
})
