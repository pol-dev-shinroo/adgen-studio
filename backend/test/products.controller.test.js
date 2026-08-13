import test from 'node:test'
import assert from 'node:assert/strict'
import {
  postProductSync, getProductSyncStatus, getProducts, getProductStatus,
  postExtractProductImage, postCafe24Exchange, patchProductFields, deleteNamespace,
} from '../src/controllers/products.controller.js'
import { config } from '../src/config/index.js'

const BRAND_KEY = config.brands[0].key
const BRAND_NAME = config.brands[0].name

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

test('postProductSync: real success starts a job and returns 202 with jobId', () => {
  const res = makeRes()
  postProductSync(
    { body: { brand: BRAND_KEY } },
    res,
    { startSyncFn: (brand) => { assert.equal(brand, BRAND_KEY); return 'job-1' } }
  )
  assert.equal(res.statusCode, 202)
  assert.deepEqual(res.body, { jobId: 'job-1' })
})

test('postProductSync: 400 for an unknown/missing brand', () => {
  const res = makeRes()
  postProductSync({ body: { brand: 'not-a-real-brand' } }, res)
  assert.equal(res.statusCode, 400)
})

test('getProductSyncStatus: real success returns the job status shape', () => {
  const res = makeRes()
  const job = { id: 'job-1', status: 'done', brandKey: BRAND_KEY, brandName: BRAND_NAME, startedAt: 't0', finishedAt: 't1', error: null, progress: {}, summary: {} }
  getProductSyncStatus({ params: { jobId: 'job-1' } }, res, { getJobFn: () => job })
  assert.equal(res.body.jobId, 'job-1')
  assert.equal(res.body.brandKey, BRAND_KEY)
})

test('getProductSyncStatus: 404 for an unknown jobId', () => {
  const res = makeRes()
  getProductSyncStatus({ params: { jobId: 'missing' } }, res, { getJobFn: () => null })
  assert.equal(res.statusCode, 404)
})

test('getProducts: real success returns all products when no brand filter is given', async () => {
  const res = makeRes()
  const products = [{ 'Product ID': '1', 'Brand': BRAND_NAME }, { 'Product ID': '2', 'Brand': '다른브랜드' }]
  await getProducts({ query: {} }, res, makeNext(), { getAllProductsFn: async () => products })
  assert.deepEqual(res.body, { products })
})

test('getProducts: filters to the requested brand when ?brand= is given', async () => {
  const res = makeRes()
  const products = [{ 'Product ID': '1', 'Brand': BRAND_NAME }, { 'Product ID': '2', 'Brand': '다른브랜드' }]
  await getProducts({ query: { brand: BRAND_KEY } }, res, makeNext(), { getAllProductsFn: async () => products })
  assert.deepEqual(res.body.products, [{ 'Product ID': '1', 'Brand': BRAND_NAME }])
})

test('getProducts: 400 for an unknown ?brand=', async () => {
  const res = makeRes()
  await getProducts({ query: { brand: 'not-a-real-brand' } }, res, makeNext(), { getAllProductsFn: async () => [] })
  assert.equal(res.statusCode, 400)
})

test('getProducts: a service error is forwarded to next()', async () => {
  const next = makeNext()
  const boom = new Error('boom')
  await getProducts({ query: {} }, makeRes(), next, { getAllProductsFn: async () => { throw boom } })
  assert.equal(next.calls[0][0], boom)
})

test('getProductStatus: real success reports per-brand config/connection state', async () => {
  const res = makeRes()
  const products = [{ 'Product ID': '1', 'Brand': BRAND_NAME, 'Last Synced': '2026-01-01' }]
  await getProductStatus(
    {}, res, makeNext(),
    {
      getAllProductsFn: async () => products,
      isAuthorizedFn: async () => true,
      getNamespaceStatsFn: async () => ({ vectorCount: 4 }),
    }
  )
  assert.equal(res.body.productSyncConfigured, true)
  const brandStatus = res.body.brands.find((b) => b.key === BRAND_KEY)
  assert.equal(brandStatus.productCount, 1)
  assert.equal(brandStatus.authorized, true)
  assert.deepEqual(brandStatus.pinecone, { vectorCount: 4 })
})

test('postExtractProductImage: real success returns the extraction result and threads force through', async () => {
  const res = makeRes()
  const result = { references: [], failures: [] }
  await postExtractProductImage(
    { params: { brand: BRAND_KEY, productId: '1' }, body: { force: true } },
    res,
    makeNext(),
    { extractProductImageFn: async (brand, productId, opts) => {
      assert.equal(brand, BRAND_KEY)
      assert.equal(productId, '1')
      assert.equal(opts.force, true)
      return result
    } }
  )
  assert.deepEqual(res.body, result)
})

test('postExtractProductImage: err.notFound maps to 404', async () => {
  const res = makeRes()
  const err = new Error('Product not found')
  err.notFound = true
  await postExtractProductImage(
    { params: { brand: BRAND_KEY, productId: 'missing' }, body: {} },
    res,
    makeNext(),
    { extractProductImageFn: async () => { throw err } }
  )
  assert.equal(res.statusCode, 404)
})

test('postCafe24Exchange: real success exchanges the code', async () => {
  const res = makeRes()
  let captured
  await postCafe24Exchange(
    { params: { brand: BRAND_KEY }, body: { code: 'real-auth-code' } },
    res,
    { exchangeCodeForTokensFn: async (brandKey, code) => { captured = { brandKey, code } } }
  )
  assert.deepEqual(res.body, { ok: true })
  assert.equal(captured.brandKey, BRAND_KEY)
  assert.equal(captured.code, 'real-auth-code')
})

test('postCafe24Exchange: 404 for an unknown brand', async () => {
  const res = makeRes()
  await postCafe24Exchange({ params: { brand: 'not-a-real-brand' }, body: { code: 'x' } }, res)
  assert.equal(res.statusCode, 404)
})

test('postCafe24Exchange: 400 when the code is missing', async () => {
  const res = makeRes()
  await postCafe24Exchange({ params: { brand: BRAND_KEY }, body: {} }, res)
  assert.equal(res.statusCode, 400)
})

test('postCafe24Exchange: a real exchange failure (expired/used code) maps to 400', async () => {
  const res = makeRes()
  await postCafe24Exchange(
    { params: { brand: BRAND_KEY }, body: { code: 'expired-code' } },
    res,
    { exchangeCodeForTokensFn: async () => { throw new Error('code has expired') } }
  )
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error, 'code has expired')
})

test('patchProductFields: real success writes the override fields', async () => {
  const res = makeRes()
  const products = [{ 'Product ID': '1', 'Brand': BRAND_NAME }]
  let captured
  await patchProductFields(
    { params: { brand: BRAND_KEY, productId: '1' }, body: { 'Price Override': '45000' } },
    res,
    makeNext(),
    {
      getAllProductsFn: async () => products,
      updateProductFieldsFn: async (productId, fields) => { captured = { productId, fields } },
    }
  )
  assert.deepEqual(res.body, { ok: true })
  assert.deepEqual(captured, { productId: '1', fields: { 'Price Override': '45000' } })
})

test('patchProductFields: 404 for an unknown brand', async () => {
  const res = makeRes()
  await patchProductFields(
    { params: { brand: 'not-a-real-brand', productId: '1' }, body: { 'Price Override': '1' } },
    res,
    makeNext()
  )
  assert.equal(res.statusCode, 404)
})

test('patchProductFields: 400 for a non-editable field', async () => {
  const res = makeRes()
  await patchProductFields(
    { params: { brand: BRAND_KEY, productId: '1' }, body: { 'Price': '45000' } },
    res,
    makeNext()
  )
  assert.equal(res.statusCode, 400)
})

test('patchProductFields: 400 when no fields are provided', async () => {
  const res = makeRes()
  await patchProductFields({ params: { brand: BRAND_KEY, productId: '1' }, body: {} }, res, makeNext())
  assert.equal(res.statusCode, 400)
})

test('patchProductFields: 404 when the product itself doesn\'t exist for that brand', async () => {
  const res = makeRes()
  await patchProductFields(
    { params: { brand: BRAND_KEY, productId: 'missing' }, body: { 'Price Override': '1' } },
    res,
    makeNext(),
    { getAllProductsFn: async () => [] }
  )
  assert.equal(res.statusCode, 404)
})

test('deleteNamespace: real success resets the brand\'s Pinecone namespace', async () => {
  const res = makeRes()
  let calledWith
  await deleteNamespace(
    { params: { brand: BRAND_KEY } },
    res,
    makeNext(),
    { resetNamespaceFn: async (brandKey) => { calledWith = brandKey } }
  )
  assert.deepEqual(res.body, { ok: true })
  assert.equal(calledWith, BRAND_KEY)
})

test('deleteNamespace: 404 for an unknown brand', async () => {
  const res = makeRes()
  await deleteNamespace({ params: { brand: 'not-a-real-brand' } }, res, makeNext())
  assert.equal(res.statusCode, 404)
})
