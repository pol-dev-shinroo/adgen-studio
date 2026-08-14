import { describe, it, expect } from 'vitest'
import { looksLikeFactualCopy } from './looksLikeFactualCopy.js'

describe('looksLikeFactualCopy', () => {
  it('treats a percentage-discount phrase as factual', () => {
    expect(looksLikeFactualCopy('최대 71% 할인')).toBe(true)
  })

  it('treats a price string as factual', () => {
    expect(looksLikeFactualCopy('29,800원')).toBe(true)
  })

  it('treats a non-factual headline as not factual', () => {
    expect(looksLikeFactualCopy('런닝머신 갖다 버렸어요!!')).toBe(false)
  })

  it('treats an empty string as not factual', () => {
    expect(looksLikeFactualCopy('')).toBe(false)
  })

  it('treats a whitespace-only string as not factual', () => {
    expect(looksLikeFactualCopy('   ')).toBe(false)
  })

  it('treats a pure-number string as factual', () => {
    expect(looksLikeFactualCopy('12345')).toBe(true)
  })

  it('treats a non-string value as not factual', () => {
    expect(looksLikeFactualCopy(null)).toBe(false)
    expect(looksLikeFactualCopy(undefined)).toBe(false)
  })
})
