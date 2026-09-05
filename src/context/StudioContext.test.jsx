import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { StudioProvider, useStudio } from './StudioContext.jsx'

// CC-7: StudioContext.jsx's real collaborators (NavigationContext,
// GalleryContext, ProductsContext) all reach out to the network on mount
// (getProducts, getGeneratedResults, ...) — mocked out entirely here so
// this only exercises StudioContext's own logic, same DI-by-mock approach
// the backend suite uses via injected deps.
const mockShowToast = vi.fn()
const mockGo = vi.fn()
const mockStartGeneration = vi.fn()
let mockBrands = []

vi.mock('./NavigationContext.jsx', () => ({
  useNavigation: () => ({ showToast: mockShowToast, go: mockGo }),
}))
vi.mock('./GalleryContext.jsx', () => ({
  useGallery: () => ({ startGeneration: mockStartGeneration }),
}))
vi.mock('./ProductsContext.jsx', () => ({
  useProducts: () => ({ brands: mockBrands }),
}))

function makeProduct(productId, overrides = {}) {
  return {
    productId,
    price: '29,900원',
    promotionInfo: '없음',
    adHookCopy: '없음',
    extractedReferences: [{ type: 'product', imageUrl: `https://example.com/${productId}.png` }],
    ...overrides,
  }
}

function makeBrand(key, name, products = {}) {
  return { key, name, products }
}

function renderStudio() {
  return renderHook(() => useStudio(), { wrapper: StudioProvider })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockBrands = [
    makeBrand('healthykiki', '헬시키키', { '제품A': makeProduct('1') }),
    makeBrand('kikibeauty', '키키뷰티', { '제품B': makeProduct('2') }),
  ]
})

describe('pickRefBrand', () => {
  it('re-clicking the already-active brand is a no-op — it must not wipe refAdIds (BB-1 regression guard)', () => {
    const { result } = renderStudio()

    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.toggleRefAd('ad-1'))
    expect(result.current.refAdIds).toEqual(['ad-1'])

    act(() => result.current.pickRefBrand('헬시키키'))
    expect(result.current.refAdIds).toEqual(['ad-1'], 're-picking the same brand must never reset refAdIds')
  })

  it('picking a genuinely different brand resets refAdIds', () => {
    const { result } = renderStudio()

    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.toggleRefAd('ad-1'))
    act(() => result.current.pickRefBrand('키키뷰티'))

    expect(result.current.refBrand).toBe('키키뷰티')
    expect(result.current.refAdIds).toEqual([])
  })
})

describe('selectMyBrand', () => {
  it('single-select — selecting brand index 1 makes it the only active brand (BB-2 regression guard)', () => {
    const { result } = renderStudio()

    act(() => result.current.selectMyBrand(1))

    const active = result.current.myBrands.filter((b) => b.active)
    expect(active).toHaveLength(1)
    expect(active[0].key).toBe('kikibeauty')
  })

  it('re-selecting the already-active brand index is a no-op', () => {
    const { result } = renderStudio()
    // healthykiki is active by default.
    const beforeMyBrands = result.current.myBrands
    act(() => result.current.selectMyBrand(0))
    expect(result.current.myBrands).toBe(beforeMyBrands, 'no state change means no new derived array identity churn from a real update')
    expect(result.current.myBrands.filter((b) => b.active)).toHaveLength(1)
    expect(result.current.myBrands.find((b) => b.active).key).toBe('healthykiki')
  })

  it('an unknown/out-of-range index is a no-op', () => {
    const { result } = renderStudio()
    act(() => result.current.selectMyBrand(99))
    expect(result.current.myBrands.find((b) => b.active).key).toBe('healthykiki')
  })
})

// Part DD: toggleRefAd now seeds/deletes a refAdConfigs[adId] entry
// alongside refAdIds — this is the plumbing everything else in this
// describe block (and totalRenders below) depends on.
describe('toggleRefAd + refAdConfigs', () => {
  it('selecting a new ad seeds a default config (2 default formats, 1장 quantity)', () => {
    const { result } = renderStudio()
    act(() => result.current.toggleRefAd('ad-1'))

    expect(result.current.refAdConfigs['ad-1']).toEqual({ formats: ['1:1 피드', '4:5 피드'], quantity: '1장' })
  })

  it('deselecting an ad deletes its config entirely — no orphaned entries', () => {
    const { result } = renderStudio()
    act(() => result.current.toggleRefAd('ad-1'))
    expect(result.current.refAdConfigs['ad-1']).toBeDefined()

    act(() => result.current.toggleRefAd('ad-1'))
    expect(result.current.refAdConfigs['ad-1']).toBeUndefined()
  })

  it('toggleAdFormat/setAdQuantity only affect the targeted ad\'s own config', () => {
    const { result } = renderStudio()
    act(() => { result.current.toggleRefAd('ad-1'); result.current.toggleRefAd('ad-2') })

    act(() => result.current.toggleAdFormat('ad-1', '1:1 피드'))
    act(() => result.current.setAdQuantity('ad-2', '4장'))

    expect(result.current.refAdConfigs['ad-1'].formats).toEqual(['4:5 피드'])
    expect(result.current.refAdConfigs['ad-1'].quantity).toBe('1장')
    expect(result.current.refAdConfigs['ad-2'].formats).toEqual(['1:1 피드', '4:5 피드'])
    expect(result.current.refAdConfigs['ad-2'].quantity).toBe('4장')
  })
})

describe('totalRenders', () => {
  it('sums each selected ad\'s own formats.length x quantity, then multiplies by selected-product count', () => {
    mockBrands = [
      makeBrand('healthykiki', '헬시키키', {
        '제품A': makeProduct('1'), '제품B': makeProduct('2'),
      }),
    ]
    const { result } = renderStudio()

    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => { result.current.toggleRefAd('ad-1'); result.current.toggleRefAd('ad-2') })
    act(() => result.current.toggleProductSelection('헬시키키', '제품B')) // now both products selected
    act(() => result.current.setAdQuantity('ad-1', '3장'))
    act(() => result.current.setAdQuantity('ad-2', '3장'))
    // Both ads default to 2 formats each.

    // 2 products x (ad-1: 2 formats x 3 + ad-2: 2 formats x 3) = 2 x 12 = 24
    expect(result.current.totalRenders).toBe(24)
  })

  it('drops to 0 for an ad whose formats get emptied out, without affecting a different ad\'s contribution', () => {
    const { result } = renderStudio()
    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => { result.current.toggleRefAd('ad-1'); result.current.toggleRefAd('ad-2') })
    act(() => { result.current.toggleAdFormat('ad-1', '1:1 피드'); result.current.toggleAdFormat('ad-1', '4:5 피드') })
    expect(result.current.refAdConfigs['ad-1'].formats).toEqual([])

    // ad-1 contributes 0, ad-2 still contributes its default 2 formats x 1 quantity = 2, x 1 product.
    expect(result.current.totalRenders).toBe(2)
  })

  it('is 0 with no refAdIds picked yet, even with a valid product/brand selection', () => {
    const { result } = renderStudio()
    act(() => result.current.pickRefBrand('헬시키키'))
    expect(result.current.refAdIds).toEqual([])
    expect(result.current.totalRenders).toBe(0)
  })

  it('each selected ad can genuinely differ from the others (the whole point of Part DD)', () => {
    const { result } = renderStudio()
    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => { result.current.toggleRefAd('ad-1'); result.current.toggleRefAd('ad-2') })
    // ad-1: keep only 1 format, quantity 1 -> 1. ad-2: default 2 formats, quantity 2 -> 4.
    act(() => result.current.toggleAdFormat('ad-1', '4:5 피드'))
    act(() => result.current.setAdQuantity('ad-1', '1장'))
    act(() => result.current.setAdQuantity('ad-2', '2장'))

    expect(result.current.totalRenders).toBe(1 * (1 + 4)) // 1 product x (1 + 4)
  })
})

// Part LL: the 3 checkbox-driven booleans that replaced 스타일 반영 강도's
// old hint text — updateStyleIntensity's live re-derivation, and the
// shared hasStyleReferenceForBrand/hasAdCopyOverrideForBrand source of
// truth StepGenerationOptions.jsx uses to grey out checkboxes 2/3.
describe('style checkboxes (Part LL)', () => {
  it('updateStyleIntensity re-derives all 3 checkboxes live at the 33/66 boundaries', () => {
    const { result } = renderStudio()
    expect(result.current.freeRestyle).toBe(true) // default styleIntensity 60 -> >33
    expect(result.current.strongReferenceInfluence).toBe(false) // 60 is not >66
    expect(result.current.verbatimCopy).toBe(false)

    act(() => result.current.updateStyleIntensity(20))
    expect(result.current.freeRestyle).toBe(false)
    expect(result.current.strongReferenceInfluence).toBe(false)
    expect(result.current.verbatimCopy).toBe(false)

    act(() => result.current.updateStyleIntensity(100))
    expect(result.current.freeRestyle).toBe(true)
    expect(result.current.strongReferenceInfluence).toBe(true)
    expect(result.current.verbatimCopy).toBe(true)
  })

  it('a hand-toggled checkbox holds its value until the slider is dragged again', () => {
    const { result } = renderStudio()
    act(() => result.current.updateStyleIntensity(20)) // all 3 false
    act(() => result.current.setStrongReferenceInfluence(true))
    expect(result.current.strongReferenceInfluence).toBe(true)
    expect(result.current.freeRestyle).toBe(false, 'hand-toggling one checkbox must not touch the others')

    act(() => result.current.updateStyleIntensity(20)) // re-drag re-derives fresh, overwriting the hand toggle
    expect(result.current.strongReferenceInfluence).toBe(false)
  })

  it('hasStyleReferenceForBrand / hasAdCopyOverrideForBrand are false until Step 3 has a real selection, then true', () => {
    mockBrands = [
      makeBrand('healthykiki', '헬시키키', {
        '제품A': makeProduct('1', {
          extractedReferences: [
            { type: 'product', imageUrl: 'https://example.com/1.png' },
            { type: 'model', imageUrl: 'https://example.com/model.png' },
          ],
          price: '29,900원',
        }),
      }),
    ]
    const { result } = renderStudio()
    expect(result.current.hasStyleReferenceForBrand).toBe(false)
    expect(result.current.hasAdCopyOverrideForBrand).toBe(false)

    act(() => result.current.toggleImageKeySelected('헬시키키', '제품A::1')) // the model-type entry
    expect(result.current.hasStyleReferenceForBrand).toBe(true)

    act(() => result.current.selectProductRefPrice('헬시키키', '29,900원'))
    expect(result.current.hasAdCopyOverrideForBrand).toBe(true)
  })

  it('goNext includes freeRestyle/strongReferenceInfluence/verbatimCopy in the startGeneration payload', () => {
    const { result } = renderStudio()
    act(() => result.current.updateStyleIntensity(100))
    act(() => result.current.setVerbatimCopy(false)) // hand-override one, independent of the other two

    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.toggleRefAd('ad-1'))
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    act(() => result.current.goNext())

    const payload = mockStartGeneration.mock.calls[0][0]
    expect(payload.freeRestyle).toBe(true)
    expect(payload.strongReferenceInfluence).toBe(true)
    expect(payload.verbatimCopy).toBe(false)
  })
})

// Part MM: creativeCopy is a 4th, independent checkbox — never wired to
// updateStyleIntensity (a deliberate opt-in, unlike the 3 Part LL checkboxes
// that auto-derive from the slider) and defaults to false.
describe('creativeCopy checkbox (Part MM)', () => {
  it('defaults to false and is untouched by updateStyleIntensity at any position', () => {
    const { result } = renderStudio()
    expect(result.current.creativeCopy).toBe(false)

    act(() => result.current.updateStyleIntensity(0))
    expect(result.current.creativeCopy).toBe(false)
    act(() => result.current.updateStyleIntensity(100))
    expect(result.current.creativeCopy).toBe(false)
  })

  it('can be hand-toggled independently of the other 3 checkboxes', () => {
    const { result } = renderStudio()
    act(() => result.current.updateStyleIntensity(20)) // all 3 Part LL checkboxes false
    act(() => result.current.setCreativeCopy(true))

    expect(result.current.creativeCopy).toBe(true)
    expect(result.current.freeRestyle).toBe(false)
    expect(result.current.strongReferenceInfluence).toBe(false)
    expect(result.current.verbatimCopy).toBe(false)
  })

  it('goNext includes creativeCopy in the startGeneration payload, independent of verbatimCopy', () => {
    const { result } = renderStudio()
    act(() => result.current.setVerbatimCopy(false))
    act(() => result.current.setCreativeCopy(true))

    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.toggleRefAd('ad-1'))
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    act(() => result.current.goNext())

    const payload = mockStartGeneration.mock.calls[0][0]
    expect(payload.creativeCopy).toBe(true)
    expect(payload.verbatimCopy).toBe(false)
  })
})

describe('goNext guard clauses', () => {
  it('blocks advancing past step 2 with zero refAdIds selected', () => {
    const { result } = renderStudio()
    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.goNext()) // step 1 -> 2
    expect(result.current.step).toBe(2)

    act(() => result.current.goNext()) // blocked: no refAdIds
    expect(result.current.step).toBe(2)
    expect(mockShowToast).toHaveBeenCalledWith('광고소재를 1개 이상 선택하세요')
  })

  it('blocks final submission when a selected ad\'s formats have been emptied out, naming that ad', () => {
    const { result } = renderStudio()
    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.toggleRefAd('ad-1'))
    act(() => { result.current.toggleAdFormat('ad-1', '1:1 피드'); result.current.toggleAdFormat('ad-1', '4:5 피드') })
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    expect(result.current.step).toBe(4)

    act(() => result.current.goNext())
    expect(mockShowToast).toHaveBeenCalledWith('AD ad-1의 포맷을 1개 이상 선택하세요')
    expect(mockStartGeneration).not.toHaveBeenCalled()
  })

  it('blocks final submission when no brand is active', () => {
    mockBrands = [] // no brands at all -> myBrands is empty -> no active brand possible
    const { result } = renderStudio()

    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.toggleRefAd('ad-1'))
    act(() => result.current.goNext()) // 1 -> 2
    act(() => result.current.goNext()) // 2 -> 3
    act(() => result.current.goNext()) // 3 -> 4
    expect(result.current.step).toBe(4)

    act(() => result.current.goNext()) // blocked: no active brand
    expect(mockShowToast).toHaveBeenCalledWith('생성할 브랜드를 먼저 선택하세요')
    expect(mockStartGeneration).not.toHaveBeenCalled()
  })

  it('blocks final submission when the active brand has an empty product selection', () => {
    mockBrands = [makeBrand('healthykiki', '헬시키키', {})] // no products at all for this brand
    const { result } = renderStudio()

    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.toggleRefAd('ad-1'))
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    expect(result.current.step).toBe(4)

    act(() => result.current.goNext())
    expect(mockShowToast).toHaveBeenCalledWith('\'헬시키키\'의 제품을 먼저 선택하세요')
    expect(mockStartGeneration).not.toHaveBeenCalled()
  })

  it('blocks final submission when the selected product has no extracted reference image', () => {
    mockBrands = [
      makeBrand('healthykiki', '헬시키키', {
        '제품A': makeProduct('1', { extractedReferences: [] }),
      }),
    ]
    const { result } = renderStudio()

    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.toggleRefAd('ad-1'))
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    expect(result.current.step).toBe(4)

    act(() => result.current.goNext())
    expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('참조 이미지가 없는 제품이 있습니다'))
    expect(mockStartGeneration).not.toHaveBeenCalled()
  })

  it('a fully valid selection actually calls startGeneration with a real refAdConfigs payload and switches to the gallery tab', () => {
    const { result } = renderStudio()

    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.toggleRefAd('ad-1'))
    act(() => result.current.setAdQuantity('ad-1', '2장'))
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    expect(result.current.step).toBe(4)

    act(() => result.current.goNext())
    expect(mockStartGeneration).toHaveBeenCalledTimes(1)
    const payload = mockStartGeneration.mock.calls[0][0]
    expect(payload.refAdConfigs).toEqual([{ adId: 'ad-1', formats: ['1:1 피드', '4:5 피드'], quantity: 2 }])
    expect(payload.refAdIds).toBeUndefined()
    expect(payload.formats).toBeUndefined()
    expect(payload.quantity).toBeUndefined()
    expect(mockGo).toHaveBeenCalledWith('gallery')
  })
})
