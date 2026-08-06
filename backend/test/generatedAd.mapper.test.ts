import test from 'node:test'
import assert from 'node:assert/strict'
import { mapGeneratedAd, toRow, GENERATED_AD_COLUMNS } from '../src/mappers/generatedAd.mapper.js'

test('GENERATED_AD_COLUMNS has 14 columns, Part V\'s 3 reference-URL columns appended after Replacements JSON', () => {
  assert.equal(GENERATED_AD_COLUMNS.length, 14)
  assert.equal(GENERATED_AD_COLUMNS.indexOf('Created At'), 8, 'the original 9 columns keep their positions')
  assert.equal(GENERATED_AD_COLUMNS.indexOf('Product ID'), 9, 'appended, not inserted')
  assert.equal(GENERATED_AD_COLUMNS.indexOf('Replacements JSON'), 10, 'appended after Product ID too')
  assert.equal(GENERATED_AD_COLUMNS.indexOf('Reference Ad Image URL'), 11)
  assert.equal(GENERATED_AD_COLUMNS.indexOf('Product Reference Image URL'), 12)
  assert.equal(GENERATED_AD_COLUMNS.indexOf('Style Reference Image URL'), 13)
})

test('mapGeneratedAd includes Product ID from the productId param', () => {
  const mapped = mapGeneratedAd({
    generationId: 'gen-1',
    brand: '헬시키키',
    referenceAdId: 'ad-1',
    format: '1:1',
    styleIntensity: 50,
    instructions: '',
    imageUrl: 'https://example.com/gen-1.png',
    productId: '4821',
    createdAt: '2026-07-25T09:00:00.000Z',
  })

  assert.equal(mapped['Product ID'], '4821')
  assert.equal(mapped['Generation ID'], 'gen-1')
  assert.equal(mapped['Status'], '미승인')
})

test('mapGeneratedAd defaults Product ID to empty string when omitted', () => {
  const mapped = mapGeneratedAd({
    generationId: 'gen-2',
    brand: '헬시키키',
    referenceAdId: 'ad-1',
    format: '1:1',
    styleIntensity: 50,
    instructions: '',
    imageUrl: 'https://example.com/gen-2.png',
  })

  assert.equal(mapped['Product ID'], '')
})

test('mapGeneratedAd JSON-stringifies replacements, round-tripping the original array', () => {
  const replacements = [
    { location: 'top-center', original_text: '오늘만 71% 특가', new_text: '오늘만 51% 특가' },
    { location: 'bottom-right', original_text: '1위 상품', new_text: '진짜 1위 상품' },
  ]
  const mapped = mapGeneratedAd({
    generationId: 'gen-4',
    brand: '헬시키키',
    referenceAdId: 'ad-1',
    format: '1:1',
    styleIntensity: 50,
    instructions: '',
    imageUrl: 'https://example.com/gen-4.png',
    replacements,
  })

  assert.equal(typeof mapped['Replacements JSON'], 'string')
  assert.deepEqual(JSON.parse(mapped['Replacements JSON']), replacements)
})

test('mapGeneratedAd defaults Replacements JSON to a serialized empty array when omitted', () => {
  const mapped = mapGeneratedAd({
    generationId: 'gen-5',
    brand: '헬시키키',
    referenceAdId: 'ad-1',
    format: '1:1',
    styleIntensity: 50,
    instructions: '',
    imageUrl: 'https://example.com/gen-5.png',
  })

  assert.equal(mapped['Replacements JSON'], '[]', 'old-row-equivalent case — never a bare empty string or undefined')
})

test('toRow keeps all 14 columns in sheet order, with the 3 reference-URL columns last', () => {
  const replacements = [{ location: 'top-center', original_text: 'A', new_text: 'B' }]
  const row = toRow(mapGeneratedAd({
    generationId: 'gen-3',
    brand: '헬시키키',
    referenceAdId: 'ad-1',
    format: '1:1',
    styleIntensity: 50,
    instructions: '',
    imageUrl: 'https://example.com/gen-3.png',
    productId: '4821',
    replacements,
    referenceAdImageUrl: 'https://example.com/ref.png',
    productReferenceImageUrl: 'https://example.com/product-ref.png',
    styleReferenceImageUrl: 'https://example.com/style-ref.png',
  }))

  assert.equal(row.length, 14)
  assert.equal(row[9], '4821')
  assert.deepEqual(JSON.parse(row[10]), replacements)
  assert.equal(row[11], 'https://example.com/ref.png')
  assert.equal(row[12], 'https://example.com/product-ref.png')
  assert.equal(row[13], 'https://example.com/style-ref.png')
})

test('mapGeneratedAd stores the 3 reference-URL columns, blank when absent (e.g. no style reference selected)', () => {
  const mapped = mapGeneratedAd({
    generationId: 'gen-6',
    brand: '헬시키키',
    referenceAdId: 'ad-1',
    format: '1:1',
    styleIntensity: 50,
    instructions: '',
    imageUrl: 'https://example.com/gen-6.png',
    referenceAdImageUrl: 'https://example.com/ref-6.png',
    productReferenceImageUrl: 'https://example.com/product-ref-6.png',
  })

  assert.equal(mapped['Reference Ad Image URL'], 'https://example.com/ref-6.png')
  assert.equal(mapped['Product Reference Image URL'], 'https://example.com/product-ref-6.png')
  assert.equal(mapped['Style Reference Image URL'], '', 'blank, not undefined, when no style reference was used')
})

test('mapGeneratedAd round-trips all 3 reference-URL columns when every one is provided', () => {
  const mapped = mapGeneratedAd({
    generationId: 'gen-7',
    brand: '헬시키키',
    referenceAdId: 'ad-1',
    format: '1:1',
    styleIntensity: 90,
    instructions: '',
    imageUrl: 'https://example.com/gen-7.png',
    referenceAdImageUrl: 'https://example.com/ref-7.png',
    productReferenceImageUrl: 'https://example.com/product-ref-7.png',
    styleReferenceImageUrl: 'https://example.com/style-ref-7.png',
  })

  assert.equal(mapped['Reference Ad Image URL'], 'https://example.com/ref-7.png')
  assert.equal(mapped['Product Reference Image URL'], 'https://example.com/product-ref-7.png')
  assert.equal(mapped['Style Reference Image URL'], 'https://example.com/style-ref-7.png')
})
