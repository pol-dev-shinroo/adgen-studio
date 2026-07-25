import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mapProduct, toRow, PRODUCT_COLUMNS } from '../src/mappers/product.mapper.js'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/cafe24-product.json', import.meta.url), 'utf8')
)

const analysis = {
  '제품특성': '19종 프로바이오틱스, 1포당 500억 CFU',
  '효과효능': '장 건강 개선',
  '페인포인트': '잦은 소화 불편',
  '프로모션정보': '없음',
  '가격정보': '29,900원 (정가 39,900원)',
  '권위/신뢰/인증': '없음',
  '광고 후킹 카피': '하루 한 포, 장이 편해지는 습관',
}

const CTX = { syncedAt: '2026-07-25T09:00:00.000Z' }

test('maps a realistic Cafe24 product + analysis to all 12 columns', () => {
  const mapped = mapProduct('헬시키키', fixture, analysis, CTX)

  assert.deepEqual(mapped, {
    'Product ID': '4821',
    'Brand': '헬시키키',
    'Product Name': '헬시키키 프로바이오틱스 유산균',
    'Price': '29900.00',
    'Promotion Info': '없음',
    'Ad Hook Copy': '하루 한 포, 장이 편해지는 습관',
    '제품특성': '19종 프로바이오틱스, 1포당 500억 CFU',
    '효과효능': '장 건강 개선',
    '페인포인트': '잦은 소화 불편',
    '권위신뢰': '없음',
    'Image URL': 'https://healthykiki.cafe24img.com/products/4821_list.jpg',
    'Last Synced': '2026-07-25T09:00:00.000Z',
  })
})

test('falls back to retail_price and detail_image when primary fields are absent', () => {
  const mapped = mapProduct('헬시키키', {
    product_no: 99,
    product_name: '테스트 제품',
    retail_price: '10000.00',
    detail_image: 'https://example.com/detail.jpg',
  }, {}, CTX)

  assert.equal(mapped['Price'], '10000.00')
  assert.equal(mapped['Image URL'], 'https://example.com/detail.jpg')
})

test('defaults every analysis field to 없음 when analysis is missing or empty', () => {
  const mapped = mapProduct('키키뷰티', { product_no: 1 }, null, CTX)

  assert.equal(mapped['Promotion Info'], '없음')
  assert.equal(mapped['Ad Hook Copy'], '없음')
  assert.equal(mapped['제품특성'], '없음')
  assert.equal(mapped['효과효능'], '없음')
  assert.equal(mapped['페인포인트'], '없음')
  assert.equal(mapped['권위신뢰'], '없음')
})

test('handles a near-empty product without throwing', () => {
  const mapped = mapProduct('헬시키키', {}, {}, CTX)

  assert.equal(mapped['Product ID'], '')
  assert.equal(mapped['Product Name'], '')
  assert.equal(mapped['Price'], '')
  assert.equal(mapped['Image URL'], '')
})

test('toRow keeps the 12 columns in sheet order', () => {
  const row = toRow(mapProduct('헬시키키', fixture, analysis, CTX))

  assert.equal(row.length, 12)
  assert.equal(row[0], '4821')
  assert.equal(row[PRODUCT_COLUMNS.indexOf('Brand')], '헬시키키')
  assert.equal(PRODUCT_COLUMNS.indexOf('Ad Hook Copy'), 5, 'ad hook copy sits right before the 4 raw-analysis columns')
  assert.equal(PRODUCT_COLUMNS.indexOf('권위신뢰'), 9)
  assert.equal(PRODUCT_COLUMNS.indexOf('Image URL'), 10)
  assert.equal(PRODUCT_COLUMNS.indexOf('Last Synced'), 11)
})
