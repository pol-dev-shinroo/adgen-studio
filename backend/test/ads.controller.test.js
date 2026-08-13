import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getAds, postExtractAdReferenceImage, patchAdField, discardAds,
} from '../src/controllers/ads.controller.js'

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

test('getAds: real success returns the raw ads array', async () => {
  const res = makeRes()
  const ads = [{ 'Ad Archive ID': 'ad-1' }]
  await getAds({}, res, makeNext(), { getAllAdsFn: async () => ads })
  assert.deepEqual(res.body, ads)
})

test('getAds: a service error is forwarded to next()', async () => {
  const next = makeNext()
  const boom = new Error('boom')
  await getAds({}, makeRes(), next, { getAllAdsFn: async () => { throw boom } })
  assert.equal(next.calls[0][0], boom)
})

test('postExtractAdReferenceImage: real success returns the extraction result and threads force through', async () => {
  const res = makeRes()
  const result = { imageUrl: 'https://x/img.png', extractedAt: '2026-01-01', price: null, promotion: null, adHooks: [] }
  await postExtractAdReferenceImage(
    { params: { adArchiveId: 'ad-1' }, body: { force: true } },
    res,
    makeNext(),
    { extractAdReferenceImageFn: async (adId, opts) => {
      assert.equal(adId, 'ad-1')
      assert.equal(opts.force, true)
      return result
    } }
  )
  assert.deepEqual(res.body, result)
})

test('postExtractAdReferenceImage: err.notFound maps to 404', async () => {
  const res = makeRes()
  const err = new Error('No ad found for Ad Archive ID "missing"')
  err.notFound = true
  await postExtractAdReferenceImage(
    { params: { adArchiveId: 'missing' }, body: {} },
    res,
    makeNext(),
    { extractAdReferenceImageFn: async () => { throw err } }
  )
  assert.equal(res.statusCode, 404)
  assert.equal(res.body.error, err.message)
})

test('patchAdField: real success writes the trimmed value', async () => {
  const res = makeRes()
  let captured
  await patchAdField(
    { params: { adArchiveId: 'ad-1' }, body: { field: 'Search Keyword', value: '  뉴브랜드  ' } },
    res,
    makeNext(),
    { updateAdFieldFn: async (adId, field, value) => { captured = { adId, field, value } } }
  )
  assert.deepEqual(res.body, { ok: true })
  assert.deepEqual(captured, { adId: 'ad-1', field: 'Search Keyword', value: '뉴브랜드' })
})

test('patchAdField: 400 for a non-editable field', async () => {
  const res = makeRes()
  await patchAdField(
    { params: { adArchiveId: 'ad-1' }, body: { field: 'Status', value: 'x' } },
    res,
    makeNext()
  )
  assert.equal(res.statusCode, 400)
})

test('patchAdField: 400 for an empty/blank value', async () => {
  const res = makeRes()
  await patchAdField(
    { params: { adArchiveId: 'ad-1' }, body: { field: 'Search Keyword', value: '   ' } },
    res,
    makeNext()
  )
  assert.equal(res.statusCode, 400)
})

test('patchAdField: err.notFound maps to 404', async () => {
  const res = makeRes()
  const err = new Error('Row not found')
  err.notFound = true
  await patchAdField(
    { params: { adArchiveId: 'missing' }, body: { field: 'Search Keyword', value: 'x' } },
    res,
    makeNext(),
    { updateAdFieldFn: async () => { throw err } }
  )
  assert.equal(res.statusCode, 404)
})

test('discardAds: 400 when keyword is missing', async () => {
  const res = makeRes()
  await discardAds({ body: { items: [{ action: 'delete', adArchiveId: '1' }] } }, res)
  assert.equal(res.statusCode, 400)
})

test('discardAds: 400 when items is empty', async () => {
  const res = makeRes()
  await discardAds({ body: { keyword: 'x', items: [] } }, res)
  assert.equal(res.statusCode, 400)
})

test('discardAds: 400 for a revert item missing previousValues', async () => {
  const res = makeRes()
  await discardAds({ body: { keyword: 'x', items: [{ action: 'revert', adArchiveId: '1' }] } }, res)
  assert.equal(res.statusCode, 400)
})

test('discardAds: real success — deletes, reverts, and reports counts with no failures', async () => {
  const res = makeRes()
  await discardAds(
    {
      body: {
        keyword: 'antical',
        items: [
          { action: 'delete', adArchiveId: 'ad-1' },
          { action: 'revert', adArchiveId: 'ad-2', previousValues: ['old'] },
        ],
      },
    },
    res,
    {
      deleteAdMediaFn: async () => 3,
      deleteAdRowsFn: async () => ({ deleted: 1, notFoundIds: [] }),
      revertAdRowFn: async () => {},
    }
  )
  assert.deepEqual(res.body, { deleted: 1, reverted: 1, driveFilesTrashed: 3, failures: [] })
})

// A failure in one stage (Drive/sheet/revert) for one item must not block
// the others — every item is attempted and every failure collected, not
// thrown.
test('discardAds: a Drive failure for one delete item is collected as a failure, not thrown, and other items still proceed', async () => {
  const res = makeRes()
  await discardAds(
    {
      body: {
        keyword: 'antical',
        items: [
          { action: 'delete', adArchiveId: 'ad-1' },
          { action: 'revert', adArchiveId: 'ad-2', previousValues: ['old'] },
        ],
      },
    },
    res,
    {
      deleteAdMediaFn: async () => { throw new Error('Drive quota exceeded') },
      deleteAdRowsFn: async () => ({ deleted: 1, notFoundIds: [] }),
      revertAdRowFn: async () => {},
    }
  )
  assert.equal(res.body.reverted, 1, 'the revert item must still succeed despite the delete item\'s Drive failure')
  assert.equal(res.body.failures.length, 1)
  assert.equal(res.body.failures[0].stage, 'drive')
  assert.equal(res.body.failures[0].adArchiveId, 'ad-1')
})

test('discardAds: notFoundIds from deleteAdRows are surfaced as sheet-stage failures', async () => {
  const res = makeRes()
  await discardAds(
    { body: { keyword: 'x', items: [{ action: 'delete', adArchiveId: 'gone' }] } },
    res,
    {
      deleteAdMediaFn: async () => 0,
      deleteAdRowsFn: async () => ({ deleted: 0, notFoundIds: ['gone'] }),
      revertAdRowFn: async () => {},
    }
  )
  assert.equal(res.body.failures.length, 1)
  assert.equal(res.body.failures[0].stage, 'sheet')
  assert.equal(res.body.failures[0].adArchiveId, 'gone')
})
