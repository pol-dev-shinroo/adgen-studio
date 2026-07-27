import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareInputs, computeTotalRenders } from '../src/services/generation.service.js'

// config.brands is read from env at module load — healthykiki/헬시키키 is the
// one real brand configured throughout this project's test fixtures/manual
// testing, so it's assumed to already exist in config.brands here too.
const BRAND_KEY = 'healthykiki'
const BRAND_NAME = '헬시키키'

const PRODUCTS = [
  { 'Product ID': '1', 'Brand': BRAND_NAME, 'Product Name': '제품 A', 'Extracted Image URL': 'https://example.com/a.png' },
  { 'Product ID': '2', 'Brand': BRAND_NAME, 'Product Name': '제품 B', 'Extracted Image URL': 'https://example.com/b.png' },
  { 'Product ID': '3', 'Brand': BRAND_NAME, 'Product Name': '제품 C 미추출', 'Extracted Image URL': '' },
  { 'Product ID': '99', 'Brand': '다른브랜드', 'Product Name': '다른 브랜드 제품', 'Extracted Image URL': 'https://example.com/x.png' },
]

const ADS = [
  { 'Ad Archive ID': 'ad-1' },
  { 'Ad Archive ID': 'ad-2' },
]

const deps = {
  getAllProductsFn: async () => PRODUCTS,
  getAllAdsFn: async () => ADS,
}

test('computeTotalRenders multiplies products x refAds x formats x quantity', () => {
  assert.equal(computeTotalRenders([{}, {}], [{}, {}, {}], ['1:1', '4:5'], 3), 2 * 3 * 2 * 3)
  assert.equal(computeTotalRenders([{}], [{}], ['1:1'], 1), 1)
})

test('prepareInputs resolves multiple productIds against the brand-filtered product list', async () => {
  const { brandDef, products, refAds } = await prepareInputs(
    { refAdIds: ['ad-1'], brand: { key: BRAND_KEY, productIds: ['1', '2'] } },
    deps
  )

  assert.equal(brandDef.key, BRAND_KEY)
  assert.deepEqual(
    products.map((p) => p.productId).sort(),
    ['1', '2']
  )
  assert.equal(products.find((p) => p.productId === '1').extractedImageUrl, 'https://example.com/a.png')
  assert.equal(refAds.length, 1)
  assert.equal(refAds[0]['Ad Archive ID'], 'ad-1')
})

test('prepareInputs throws, naming the missing productId, when a productId does not resolve for the brand', async () => {
  await assert.rejects(
    () => prepareInputs(
      { refAdIds: ['ad-1'], brand: { key: BRAND_KEY, productIds: ['1', '404'] } },
      deps
    ),
    (err) => {
      assert.equal(err.badRequest, true)
      assert.match(err.message, /404/)
      return true
    }
  )
})

test('prepareInputs throws, naming the missing productId, when a productId belongs to a different brand', async () => {
  await assert.rejects(
    () => prepareInputs(
      { refAdIds: ['ad-1'], brand: { key: BRAND_KEY, productIds: ['99'] } },
      deps
    ),
    (err) => {
      assert.equal(err.badRequest, true)
      assert.match(err.message, /99/)
      return true
    }
  )
})

test('prepareInputs throws, naming the unextracted product, when a selected product has no Extracted Image URL', async () => {
  await assert.rejects(
    () => prepareInputs(
      { refAdIds: ['ad-1'], brand: { key: BRAND_KEY, productIds: ['1', '3'] } },
      deps
    ),
    (err) => {
      assert.equal(err.badRequest, true)
      assert.match(err.message, /제품 C 미추출/)
      return true
    }
  )
})

test('prepareInputs throws when brand.productIds is missing or empty', async () => {
  await assert.rejects(
    () => prepareInputs({ refAdIds: ['ad-1'], brand: { key: BRAND_KEY, productIds: [] } }, deps),
    (err) => {
      assert.equal(err.badRequest, true)
      return true
    }
  )
})

test('prepareInputs throws for an unknown brand key', async () => {
  await assert.rejects(
    () => prepareInputs({ refAdIds: ['ad-1'], brand: { key: 'not-a-real-brand', productIds: ['1'] } }, deps),
    (err) => {
      assert.equal(err.badRequest, true)
      return true
    }
  )
})
