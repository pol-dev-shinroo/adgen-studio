import test from 'node:test'
import assert from 'node:assert/strict'
import { mapGeneratedAd, toRow, GENERATED_AD_COLUMNS } from '../src/mappers/generatedAd.mapper.js'

test('GENERATED_AD_COLUMNS has 10 columns ending in Product ID, appended after Created At', () => {
  assert.equal(GENERATED_AD_COLUMNS.length, 10)
  assert.equal(GENERATED_AD_COLUMNS.indexOf('Created At'), 8, 'the original 9 columns keep their positions')
  assert.equal(GENERATED_AD_COLUMNS.indexOf('Product ID'), 9, 'appended, not inserted')
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

test('toRow keeps all 10 columns in sheet order, with Product ID last', () => {
  const row = toRow(mapGeneratedAd({
    generationId: 'gen-3',
    brand: '헬시키키',
    referenceAdId: 'ad-1',
    format: '1:1',
    styleIntensity: 50,
    instructions: '',
    imageUrl: 'https://example.com/gen-3.png',
    productId: '4821',
  }))

  assert.equal(row.length, 10)
  assert.equal(row[9], '4821')
})
