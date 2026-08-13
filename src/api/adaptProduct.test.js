import { describe, it, expect } from 'vitest'
import { adaptProduct } from './adaptProduct.js'

// CC-8: override-precedence — a resync rewrites Price/Promotion Info/Ad
// Hook Copy every time (see product.mapper.js's SYNC_COLUMNS), so
// adaptProduct is what applies the override-over-synced precedence for
// each of the 3 overridable fields. Blank-string-override is deliberately
// distinct from no-override-key-at-all: both must fall back, but only a
// dedicated test proves the `|| product['Price']` fallback actually
// triggers on '' (falsy) and not just on `undefined`.
function baseRow(overrides = {}) {
  return {
    'Product ID': '1',
    'Brand': '헬시키키',
    'Product Name': '테스트 제품',
    'Price': '29900.00',
    'Promotion Info': '1+1',
    'Ad Hook Copy': '하루 한 포',
    'Image URL': '',
    'Extracted References JSON': '',
    ...overrides,
  }
}

describe('adaptProduct override precedence', () => {
  it('falls back to the synced value when no override key exists at all', () => {
    const adapted = adaptProduct(baseRow())

    expect(adapted.priceFormatted).toBe('29,900원')
    expect(adapted.promotionInfo).toBe('1+1')
    expect(adapted.adHookCopy).toBe('하루 한 포')
    expect(adapted.priceOverrideRaw).toBe('')
    expect(adapted.promotionInfoOverrideRaw).toBe('')
    expect(adapted.adHookCopyOverrideRaw).toBe('')
  })

  it('uses the override when present, for all 3 overridable fields independently', () => {
    const adapted = adaptProduct(baseRow({
      'Price Override': '19900',
      'Promotion Info Override': '특가 50% 할인',
      'Ad Hook Copy Override': '오늘만 이 가격',
    }))

    expect(adapted.priceFormatted).toBe('19,900원')
    expect(adapted.promotionInfo).toBe('특가 50% 할인')
    expect(adapted.adHookCopy).toBe('오늘만 이 가격')
    // The raw override fields must also surface the override value
    // unchanged, distinct from the effective (formatted) value.
    expect(adapted.priceOverrideRaw).toBe('19900')
    expect(adapted.promotionInfoOverrideRaw).toBe('특가 50% 할인')
    expect(adapted.adHookCopyOverrideRaw).toBe('오늘만 이 가격')
  })

  it('a single overridden field does not affect the other two — they still fall back independently', () => {
    const adapted = adaptProduct(baseRow({ 'Promotion Info Override': '단독 프로모션' }))

    expect(adapted.promotionInfo).toBe('단독 프로모션')
    expect(adapted.priceFormatted).toBe('29,900원', 'price must still fall back to the synced value')
    expect(adapted.adHookCopy).toBe('하루 한 포', 'ad hook copy must still fall back to the synced value')
  })

  it('a blank-string override falls back to synced, distinct from a genuinely absent override key', () => {
    const adapted = adaptProduct(baseRow({
      'Price Override': '',
      'Promotion Info Override': '',
      'Ad Hook Copy Override': '',
    }))

    expect(adapted.priceFormatted).toBe('29,900원')
    expect(adapted.promotionInfo).toBe('1+1')
    expect(adapted.adHookCopy).toBe('하루 한 포')
    // The raw override fields stay '' either way — this test's whole point
    // is that a blank override key behaves identically to a missing one,
    // not that it's distinguishable downstream.
    expect(adapted.priceOverrideRaw).toBe('')
    expect(adapted.promotionInfoOverrideRaw).toBe('')
    expect(adapted.adHookCopyOverrideRaw).toBe('')
  })

  it('promotionInfo/adHookCopy fall back to 없음 when both the synced value and override are blank', () => {
    const adapted = adaptProduct(baseRow({ 'Promotion Info': '', 'Ad Hook Copy': '' }))
    expect(adapted.promotionInfo).toBe('없음')
    expect(adapted.adHookCopy).toBe('없음')
  })

  it('price falls back to "-" (formatKRW\'s own blank sentinel) when both synced Price and override are blank', () => {
    const adapted = adaptProduct(baseRow({ 'Price': '' }))
    expect(adapted.priceFormatted).toBe('-')
  })
})
