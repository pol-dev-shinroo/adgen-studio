import test from 'node:test'
import assert from 'node:assert/strict'
import { postCollect, getJobStatus } from '../src/controllers/collect.controller.js'

function makeRes() {
  const res = { statusCode: null, body: null }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

test('postCollect: real success starts a job and returns 202 with jobId', () => {
  const res = makeRes()
  postCollect(
    { body: { keywords: ['안티칼'], resultsLimit: 50 } },
    res,
    { startCollectionFn: (keywords, limit) => {
      assert.deepEqual(keywords, ['안티칼'])
      assert.equal(limit, 50)
      return 'job-123'
    } }
  )
  assert.equal(res.statusCode, 202)
  assert.deepEqual(res.body, { jobId: 'job-123' })
})

test('postCollect: dedupes and trims keywords before calling startCollection', () => {
  const res = makeRes()
  let captured
  postCollect(
    { body: { keywords: [' 안티칼 ', '안티칼', '뉴트리원', '  '] } },
    res,
    { startCollectionFn: (keywords) => { captured = keywords; return 'job-1' } }
  )
  assert.deepEqual(captured, ['안티칼', '뉴트리원'])
})

test('postCollect: 400 when keywords is not an array', () => {
  const res = makeRes()
  postCollect({ body: { keywords: 'not-an-array' } }, res)
  assert.equal(res.statusCode, 400)
})

test('postCollect: 400 when every keyword is blank after trimming', () => {
  const res = makeRes()
  postCollect({ body: { keywords: ['  ', ''] } }, res)
  assert.equal(res.statusCode, 400)
})

test('postCollect: 400 for more than 10 keywords', () => {
  const res = makeRes()
  postCollect({ body: { keywords: Array.from({ length: 11 }, (_, i) => `kw${i}`) } }, res)
  assert.equal(res.statusCode, 400)
})

test('postCollect: 400 for a resultsLimit outside the valid range', () => {
  const res = makeRes()
  postCollect({ body: { keywords: ['x'], resultsLimit: 5 } }, res)
  assert.equal(res.statusCode, 400)

  const res2 = makeRes()
  postCollect({ body: { keywords: ['x'], resultsLimit: 500 } }, res2)
  assert.equal(res2.statusCode, 400)

  const res3 = makeRes()
  postCollect({ body: { keywords: ['x'], resultsLimit: 50.5 } }, res3)
  assert.equal(res3.statusCode, 400)
})

test('getJobStatus: real success returns the job status shape', () => {
  const res = makeRes()
  const job = {
    id: 'job-1', status: 'done', keywords: ['x'], startedAt: 't0', finishedAt: 't1',
    error: null, progress: { phase: 'done' }, summary: { totalAdsFound: 1 },
  }
  getJobStatus({ params: { jobId: 'job-1' } }, res, { getJobFn: () => job })
  assert.deepEqual(res.body, {
    jobId: 'job-1', status: 'done', keywords: ['x'], startedAt: 't0', finishedAt: 't1',
    error: null, errorCode: null, progress: { phase: 'done' }, summary: { totalAdsFound: 1 },
  })
})

test('getJobStatus: 404 for an unknown jobId', () => {
  const res = makeRes()
  getJobStatus({ params: { jobId: 'missing' } }, res, { getJobFn: () => null })
  assert.equal(res.statusCode, 404)
})
