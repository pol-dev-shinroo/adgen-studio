import test from 'node:test'
import assert from 'node:assert/strict'
import { PRODUCT_COLUMNS } from '../src/mappers/product.mapper.js'
import {
  startSync, getJob, computeContentHash, analysisFromExistingRow,
} from '../src/services/cafe24/productSync.service.js'

// config.brands is read from env at module load — healthykiki/헬시키키 is the
// one real brand configured throughout this project's test fixtures/manual
// testing (same assumption other test files in this suite already make).
const BRAND_KEY = 'healthykiki'
const BRAND_NAME = '헬시키키'

function buildProductRow(overrides = {}) {
  const values = { 'Brand': BRAND_NAME, ...overrides }
  return Object.fromEntries(PRODUCT_COLUMNS.map((c) => [c, values[c] ?? '']))
}

// A genuinely stateful in-memory fake — batchUpdate/append/update mutate
// `rows` in place, and every subsequent get() reflects that, same as the
// real Sheets API would within one run. This matters here specifically:
// AA-4's own Content Hash write for a brand-new product happens AFTER
// upsertProductRows has just appended that product's row, and
// updateProductField's own row lookup (a fresh values.get('A:A') call)
// needs to actually see it.
function makeFakeProductSheets(initialRows, captured = {}) {
  const rows = initialRows.map((r) => PRODUCT_COLUMNS.map((c) => r[c] ?? ''))

  function columnIndexFromLetter(letter) {
    return letter.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  }

  return {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: '제품' } }] } }),
      values: {
        get: async ({ range }) => {
          if (range.includes('A1:S1')) return { data: { values: [[...PRODUCT_COLUMNS]] } }
          if (range.includes('A:A')) {
            return { data: { values: [['Product ID'], ...rows.map((cells) => [cells[0]])] } }
          }
          return { data: { values: [[...PRODUCT_COLUMNS], ...rows.map((cells) => [...cells])] } }
        },
        batchUpdate: async ({ requestBody }) => {
          captured.batchUpdate = [...(captured.batchUpdate || []), requestBody]
          for (const { range, values } of requestBody.data) {
            const rowNumber = Number(range.match(/(\d+)/)[1])
            const rowIndex = rowNumber - 2 // -1 for the header row, -1 for 0-based indexing
            values[0].forEach((val, i) => { rows[rowIndex][i] = val })
          }
          return { data: {} }
        },
        append: async ({ requestBody }) => {
          captured.append = [...(captured.append || []), requestBody]
          for (const rowValues of requestBody.values) {
            rows.push([...rowValues])
          }
          return { data: {} }
        },
        update: async ({ range, requestBody }) => {
          captured.update = [...(captured.update || []), { range, requestBody }]
          const match = range.match(/([A-Z]+)(\d+):[A-Z]+\d+/)
          const rowIndex = Number(match[2]) - 2
          rows[rowIndex][columnIndexFromLetter(match[1])] = requestBody.values[0][0]
          return { data: {} }
        },
      },
    },
  }
}

// Waits for a fire-and-forget jobStore job to reach a terminal status —
// runJob isn't awaited directly by startSync (jobStore.startJob fires it
// and returns immediately), so tests poll the same way the real frontend's
// useJobPolling hook does.
async function waitForJob(jobId, { timeoutMs = 2000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const job = getJob(jobId)
    if (job.status === 'done' || job.status === 'failed') return job
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for product sync job to finish')
}

test('computeContentHash only changes when a field analyzeProduct.service.js actually reads changes', () => {
  const base = {
    product_no: 1, product_name: '테스트 제품', price: '10000', summary_description: 's', simple_description: 'x', description: 'd',
  }
  const same = computeContentHash({ ...base })
  assert.equal(computeContentHash(base), same, 'identical input must hash identically')

  assert.notEqual(computeContentHash({ ...base, product_name: '다른 이름' }), same)
  assert.notEqual(computeContentHash({ ...base, price: '20000' }), same)
  assert.notEqual(computeContentHash({ ...base, summary_description: 'changed' }), same)
  assert.notEqual(computeContentHash({ ...base, simple_description: 'changed' }), same)
  assert.notEqual(computeContentHash({ ...base, description: 'changed' }), same)

  // Fields analyzeProduct.service.js's prompt never reads must NOT affect the hash.
  assert.equal(
    computeContentHash({ ...base, detail_image: 'https://example.com/new-photo.jpg', product_no: 999, stock: 5 }),
    same,
    'a field the analysis prompt never reads (image, stock, ...) must not change the hash'
  )
})

test('computeContentHash falls back cleanly to retail_price when price is absent', () => {
  const withPrice = computeContentHash({ product_name: 'x', price: '5000' })
  const withRetailPrice = computeContentHash({ product_name: 'x', retail_price: '5000' })
  assert.equal(withPrice, withRetailPrice)
})

test('analysisFromExistingRow reconstructs the 6 stored AI-derived fields, defaulting to 없음 when a column is blank', () => {
  const row = buildProductRow({
    '제품특성': '19종 프로바이오틱스', '효과효능': '장 건강', '페인포인트': '',
    'Promotion Info': '1+1', '권위신뢰': '없음', 'Ad Hook Copy': '하루 한 포',
  })

  const analysis = analysisFromExistingRow(row)

  assert.equal(analysis['제품특성'], '19종 프로바이오틱스')
  assert.equal(analysis['효과효능'], '장 건강')
  assert.equal(analysis['페인포인트'], '없음', 'a blank stored cell falls back to 없음, not an empty string')
  assert.equal(analysis['프로모션정보'], '1+1', 'reverse-mapped from the Promotion Info column')
  assert.equal(analysis['권위/신뢰/인증'], '없음', 'reverse-mapped from the 권위신뢰 column')
  assert.equal(analysis['광고 후킹 카피'], '하루 한 포', 'reverse-mapped from the Ad Hook Copy column')
  assert.equal('가격정보' in analysis, false, 'mapProduct never reads this analysis key, so it is never reconstructed either')
})

// AA-4: end-to-end coverage via a real startSync()+getJob() run, with every
// real external call (Cafe24, OpenAI, Pinecone) replaced by an injected
// fake and only Sheets reads/writes going through a fake Sheets client —
// same DI convention as elsewhere in this suite. Proves: (1) an unchanged
// product's analyze/embed/Pinecone-upsert calls are skipped entirely and
// its prior AI-derived text is carried forward untouched, (2) a genuinely
// new product (no stored hash) still runs the real pipeline and gets a
// hash written for the first time, (3) the hash write only happens for the
// product that was actually (re-)analyzed.
test('a product sync skips the real analyze/embed/Pinecone pipeline for an unchanged product but still runs it for a new one', async () => {
  const unchangedRaw = {
    product_no: 100, product_name: '변화없는 제품', price: '19900', summary_description: 'sum', simple_description: 'simple', description: 'desc',
  }
  const newRaw = {
    product_no: 200, product_name: '신규 제품', price: '29900', summary_description: 'new-sum', simple_description: 'new-simple', description: 'new-desc',
  }

  const existingRow = buildProductRow({
    'Product ID': '100',
    'Product Name': '변화없는 제품',
    'Price': '19900',
    '제품특성': '이전 분석 결과 그대로',
    '효과효능': '이전 효능',
    '페인포인트': '이전 페인포인트',
    'Promotion Info': '이전 프로모션',
    '권위신뢰': '이전 권위',
    'Ad Hook Copy': '이전 후킹카피',
    'Content Hash': computeContentHash(unchangedRaw),
  })

  const captured = {}
  const fakeSheets = makeFakeProductSheets([existingRow], captured)

  const analyzeCalls = []
  const embedCalls = []
  const upsertProductCalls = []

  const jobId = startSync(BRAND_KEY, {
    getClientFn: () => fakeSheets,
    fetchAllProductsFn: async () => [unchangedRaw, newRaw],
    analyzeProductFn: async (brandKey, rawProduct) => {
      analyzeCalls.push(rawProduct.product_no)
      return {
        '제품특성': '새 분석 결과', '효과효능': '새 효능', '페인포인트': '새 페인포인트',
        '프로모션정보': '없음', '가격정보': '29,900원', '권위/신뢰/인증': '없음', '광고 후킹 카피': '새 후킹카피',
      }
    },
    embedTextFn: async (text) => { embedCalls.push(text); return [0.1, 0.2, 0.3] },
    pineconeServiceOverride: {
      upsertProduct: async (brandKey, productId) => { upsertProductCalls.push(productId) },
      deleteStale: async () => [],
    },
  })

  const job = await waitForJob(jobId)

  assert.equal(job.status, 'done')
  assert.equal(job.summary.skipped, 1, 'the unchanged product must be counted as skipped')
  assert.equal(job.summary.synced, 1, 'the new product must be counted as a real sync')
  assert.equal(job.summary.failed, 0)

  // The real pipeline (analyze/embed/Pinecone upsert) must have run for
  // product 200 only — never for the unchanged product 100.
  assert.deepEqual(analyzeCalls, [200])
  assert.deepEqual(embedCalls.length, 1)
  assert.deepEqual(upsertProductCalls, ['200'])

  // The unchanged product's row must still be written (sync-owned columns
  // refresh every run), carrying its PRIOR AI-derived text forward
  // unchanged rather than blanking it out.
  const allWrittenRows = [
    ...(captured.batchUpdate || []).flatMap((b) => b.data.map((d) => d.values[0])),
    ...(captured.append || []).flatMap((a) => a.values),
  ]
  const unchangedWrittenRow = allWrittenRows.find((r) => r[PRODUCT_COLUMNS.indexOf('Product ID')] === '100')
  assert.ok(unchangedWrittenRow, 'the unchanged product must still be written to the sheet')
  assert.equal(unchangedWrittenRow[PRODUCT_COLUMNS.indexOf('제품특성')], '이전 분석 결과 그대로')
  assert.equal(unchangedWrittenRow[PRODUCT_COLUMNS.indexOf('Ad Hook Copy')], '이전 후킹카피')

  const newWrittenRow = allWrittenRows.find((r) => r[PRODUCT_COLUMNS.indexOf('Product ID')] === '200')
  assert.ok(newWrittenRow, 'the new product must be written to the sheet')
  assert.equal(newWrittenRow[PRODUCT_COLUMNS.indexOf('제품특성')], '새 분석 결과')

  // Content Hash must be written ONLY for the newly-analyzed product (200)
  // — the unchanged product's stored hash is already correct, so no write
  // for it at all. Every captured .update call is necessarily a Content
  // Hash write (updateProductField is the only thing that uses
  // values.update in this whole flow), so counting them is sufficient.
  assert.equal((captured.update || []).length, 1, 'exactly one Content Hash write — for product 200 only')
  assert.equal(captured.update[0].requestBody.values[0][0], computeContentHash(newRaw))
})

// AA-4's own explicit requirement: an existing product that was synced
// BEFORE this feature existed (so its Content Hash column is genuinely
// blank) must still run the real pipeline once and get a hash computed —
// no one-time backfill script needed.
test('a pre-existing product with no stored hash yet still runs the real pipeline once (no backfill needed)', async () => {
  const raw = {
    product_no: 300, product_name: '기존 제품 (해시 없음)', price: '9900', summary_description: 's', simple_description: 'x', description: 'd',
  }
  const existingRow = buildProductRow({
    'Product ID': '300',
    'Product Name': '기존 제품 (해시 없음)',
    '제품특성': '예전 분석',
    // 'Content Hash' deliberately left blank — simulates a row from before this column existed.
  })

  const captured = {}
  const fakeSheets = makeFakeProductSheets([existingRow], captured)
  const analyzeCalls = []

  const jobId = startSync(BRAND_KEY, {
    getClientFn: () => fakeSheets,
    fetchAllProductsFn: async () => [raw],
    analyzeProductFn: async (brandKey, rawProduct) => {
      analyzeCalls.push(rawProduct.product_no)
      return {
        '제품특성': '새 분석', '효과효능': '없음', '페인포인트': '없음',
        '프로모션정보': '없음', '가격정보': '없음', '권위/신뢰/인증': '없음', '광고 후킹 카피': '없음',
      }
    },
    embedTextFn: async () => [0.1],
    pineconeServiceOverride: { upsertProduct: async () => {}, deleteStale: async () => [] },
  })

  const job = await waitForJob(jobId)

  assert.equal(job.status, 'done')
  assert.equal(job.summary.synced, 1)
  assert.equal(job.summary.skipped, 0, 'a blank stored hash must never be treated as a match')
  assert.deepEqual(analyzeCalls, [300])
  assert.equal(captured.update.length, 1, 'the hash must be written for the first time this run')
  assert.equal(captured.update[0].requestBody.values[0][0], computeContentHash(raw))
})
