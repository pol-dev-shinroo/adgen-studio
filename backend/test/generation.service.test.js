import test from 'node:test'
import assert from 'node:assert/strict'
import {
  prepareInputs, computeTotalRenders, counterFactsFromAdCopyOverride,
} from '../src/services/generation.service.js'

// config.brands is read from env at module load — healthykiki/헬시키키 is the
// one real brand configured throughout this project's test fixtures/manual
// testing, so it's assumed to already exist in config.brands here too.
const BRAND_KEY = 'healthykiki'
const BRAND_NAME = '헬시키키'

function refsJson(imageUrl) {
  return JSON.stringify([{ type: 'product', label: '제품', imageUrl, extractedAt: '2026-07-25T09:00:00.000Z' }])
}

const PRODUCTS = [
  { 'Product ID': '1', 'Brand': BRAND_NAME, 'Product Name': '제품 A', 'Extracted References JSON': refsJson('https://example.com/a.png') },
  { 'Product ID': '2', 'Brand': BRAND_NAME, 'Product Name': '제품 B', 'Extracted References JSON': refsJson('https://example.com/b.png') },
  { 'Product ID': '3', 'Brand': BRAND_NAME, 'Product Name': '제품 C 미추출', 'Extracted References JSON': '[]' },
  { 'Product ID': '99', 'Brand': '다른브랜드', 'Product Name': '다른 브랜드 제품', 'Extracted References JSON': refsJson('https://example.com/x.png') },
  {
    'Product ID': '4', 'Brand': BRAND_NAME, 'Product Name': '제품 D 모델만',
    'Extracted References JSON': JSON.stringify([{ type: 'model', label: '모델', imageUrl: 'https://example.com/model.png' }]),
  },
  { 'Product ID': '5', 'Brand': BRAND_NAME, 'Product Name': '제품 E 손상된JSON', 'Extracted References JSON': 'not valid json' },
  // Part S: two real type:'product' entries (a genuine multi-reference
  // product, e.g. front + back label shots) — the sheet stores each as a
  // Drive webViewLink ("/file/d/<id>/view"), same form every other fixture
  // above uses.
  {
    'Product ID': '6', 'Brand': BRAND_NAME, 'Product Name': '제품 F 다중참조',
    'Extracted References JSON': JSON.stringify([
      { type: 'product', label: '정면', imageUrl: 'https://drive.google.com/file/d/FILE_FRONT/view?usp=drivesdk' },
      { type: 'product', label: '후면', imageUrl: 'https://drive.google.com/file/d/FILE_BACK/view?usp=drivesdk' },
    ]),
  },
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

test('prepareInputs throws, naming the unextracted product, when a selected product has no product-type extracted reference', async () => {
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

test('prepareInputs treats a model-only references array (no product-type entry) as unextracted', async () => {
  await assert.rejects(
    () => prepareInputs(
      { refAdIds: ['ad-1'], brand: { key: BRAND_KEY, productIds: ['4'] } },
      deps
    ),
    (err) => {
      assert.equal(err.badRequest, true)
      assert.match(err.message, /제품 D 모델만/)
      return true
    }
  )
})

test('prepareInputs treats malformed Extracted References JSON as unextracted rather than throwing a parse error', async () => {
  await assert.rejects(
    () => prepareInputs(
      { refAdIds: ['ad-1'], brand: { key: BRAND_KEY, productIds: ['5'] } },
      deps
    ),
    (err) => {
      assert.equal(err.badRequest, true)
      assert.match(err.message, /제품 E 손상된JSON/)
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

test('counterFactsFromAdCopyOverride converts a real-shaped override to the counter_facts array shape', () => {
  const facts = counterFactsFromAdCopyOverride({
    price: '29,900원', promotion: '오늘만 71% 특가', adHooks: ['운동&식단 필요없는 지방흡착템', '★아마존 1등★'],
  })

  assert.deepEqual(facts, [
    { category: '가격', fact: '29,900원' },
    { category: '프로모션', fact: '오늘만 71% 특가' },
    { category: '광고 후킹 카피', fact: '운동&식단 필요없는 지방흡착템' },
    { category: '광고 후킹 카피', fact: '★아마존 1등★' },
  ])
})

test('counterFactsFromAdCopyOverride returns null for no override at all (falls through to Pinecone)', () => {
  assert.equal(counterFactsFromAdCopyOverride(null), null)
  assert.equal(counterFactsFromAdCopyOverride(undefined), null)
})

test('counterFactsFromAdCopyOverride returns null when every field is empty, not an empty-facts override', () => {
  assert.equal(counterFactsFromAdCopyOverride({ price: null, promotion: null, adHooks: [] }), null)
  assert.equal(counterFactsFromAdCopyOverride({}), null)
})

test('counterFactsFromAdCopyOverride includes only whichever fields are actually populated', () => {
  assert.deepEqual(
    counterFactsFromAdCopyOverride({ price: null, promotion: '반값 특가', adHooks: [] }),
    [{ category: '프로모션', fact: '반값 특가' }]
  )
  assert.deepEqual(
    counterFactsFromAdCopyOverride({ price: '10,000원', promotion: null, adHooks: [] }),
    [{ category: '가격', fact: '10,000원' }]
  )
  assert.deepEqual(
    counterFactsFromAdCopyOverride({ price: null, promotion: null, adHooks: ['hook only'] }),
    [{ category: '광고 후킹 카피', fact: 'hook only' }]
  )
})

test('counterFactsFromAdCopyOverride ignores blank strings and malformed adHooks entries', () => {
  const facts = counterFactsFromAdCopyOverride({
    price: '   ', promotion: '', adHooks: ['real hook', '', '   ', 42, null],
  })

  assert.deepEqual(facts, [{ category: '광고 후킹 카피', fact: 'real hook' }])
})

// Part S: brand.productImageOverrides — a client-supplied { [productId]:
// url } map, only trusted when it matches (by Drive file ID) one of that
// product's own real type:'product' entries. Product '6' above has two.
test('prepareInputs uses a productImageOverrides entry that matches the product\'s own second real reference, instead of the default first one', async () => {
  const { products } = await prepareInputs(
    {
      refAdIds: ['ad-1'],
      brand: {
        key: BRAND_KEY,
        productIds: ['6'],
        // Thumbnail-endpoint form (what the frontend actually sends —
        // adaptProduct.js converts the sheet's webViewLink before the
        // frontend ever sees it) — deliberately NOT the same string form
        // as the sheet's own stored value, to prove the match is by Drive
        // file ID, not literal string equality.
        productImageOverrides: { 6: 'https://drive.google.com/thumbnail?id=FILE_BACK&sz=w800' },
      },
    },
    deps
  )

  assert.equal(
    products.find((p) => p.productId === '6').extractedImageUrl,
    'https://drive.google.com/file/d/FILE_BACK/view?usp=drivesdk'
  )
})

test('prepareInputs falls back to the default first reference when productImageOverrides doesn\'t match any real entry for that product', async () => {
  const { products } = await prepareInputs(
    {
      refAdIds: ['ad-1'],
      brand: {
        key: BRAND_KEY,
        productIds: ['6'],
        // A file ID that isn't one of product 6's own real entries at all
        // — never trusted, never thrown on, just ignored.
        productImageOverrides: { 6: 'https://drive.google.com/thumbnail?id=SOME_OTHER_FILE&sz=w800' },
      },
    },
    deps
  )

  assert.equal(
    products.find((p) => p.productId === '6').extractedImageUrl,
    'https://drive.google.com/file/d/FILE_FRONT/view?usp=drivesdk'
  )
})

test('prepareInputs behaves exactly as before Part S when brand.productImageOverrides is absent entirely', async () => {
  const { products } = await prepareInputs(
    { refAdIds: ['ad-1'], brand: { key: BRAND_KEY, productIds: ['6'] } },
    deps
  )

  assert.equal(
    products.find((p) => p.productId === '6').extractedImageUrl,
    'https://drive.google.com/file/d/FILE_FRONT/view?usp=drivesdk'
  )
})
