import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAdCopyResult } from '../src/services/adImageExtraction.service.js'

test('parseAdCopyResult normalizes a real-shaped result with price, promotion, and multiple hooks', () => {
  const raw = JSON.stringify({
    price: '29,900원',
    promotion: '오늘만 71% 특가',
    adHooks: ['운동&식단 필요없는 지방흡착템', '★아마존 1등★'],
  })

  const result = parseAdCopyResult(raw)

  assert.equal(result.price, '29,900원')
  assert.equal(result.promotion, '오늘만 71% 특가')
  assert.deepEqual(result.adHooks, ['운동&식단 필요없는 지방흡착템', '★아마존 1등★'])
})

test('parseAdCopyResult converts missing price/promotion to null rather than throwing', () => {
  const raw = JSON.stringify({ price: null, promotion: null, adHooks: [] })

  const result = parseAdCopyResult(raw)

  assert.equal(result.price, null)
  assert.equal(result.promotion, null)
  assert.deepEqual(result.adHooks, [])
})

test('parseAdCopyResult treats a blank/whitespace-only price or promotion string as null', () => {
  const raw = JSON.stringify({ price: '   ', promotion: '', adHooks: ['hook'] })

  const result = parseAdCopyResult(raw)

  assert.equal(result.price, null)
  assert.equal(result.promotion, null)
})

test('parseAdCopyResult drops malformed adHooks entries (non-strings, blanks) rather than including them', () => {
  const raw = JSON.stringify({ price: null, promotion: null, adHooks: ['real hook', '', '   ', 42, null, {}] })

  const result = parseAdCopyResult(raw)

  assert.deepEqual(result.adHooks, ['real hook'])
})

test('parseAdCopyResult defaults adHooks to [] when the field is missing or not an array', () => {
  const result = parseAdCopyResult(JSON.stringify({ price: null, promotion: null }))
  assert.deepEqual(result.adHooks, [])

  const result2 = parseAdCopyResult(JSON.stringify({ price: null, promotion: null, adHooks: 'not an array' }))
  assert.deepEqual(result2.adHooks, [])
})

test('parseAdCopyResult throws a clear error on genuinely invalid JSON', () => {
  assert.throws(
    () => parseAdCopyResult('not json at all'),
    (err) => {
      assert.match(err.message, /invalid JSON/)
      return true
    }
  )
})
