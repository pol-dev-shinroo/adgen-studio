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

describe('totalRenders', () => {
  it('multiplies selected-product count x refAdIds count x formats count x quantity', () => {
    mockBrands = [
      makeBrand('healthykiki', '헬시키키', {
        '제품A': makeProduct('1'), '제품B': makeProduct('2'),
      }),
    ]
    const { result } = renderStudio()

    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => { result.current.toggleRefAd('ad-1'); result.current.toggleRefAd('ad-2') })
    act(() => result.current.toggleProductSelection('헬시키키', '제품B')) // now both products selected
    act(() => result.current.setQuantity('3장'))
    // Default formats has 2 entries ('1:1 피드', '4:5 피드').

    // 2 products x 2 refAds x 2 formats x 3 quantity = 24
    expect(result.current.totalRenders).toBe(24)
  })

  it('drops to 0 when formats is emptied out', () => {
    const { result } = renderStudio()
    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.toggleRefAd('ad-1'))
    act(() => { result.current.toggleFormat('1:1 피드'); result.current.toggleFormat('4:5 피드') })
    expect(result.current.formats).toEqual([])
    expect(result.current.totalRenders).toBe(0)
  })

  it('is 0 with no refAdIds picked yet, even with a valid product/brand selection', () => {
    const { result } = renderStudio()
    act(() => result.current.pickRefBrand('헬시키키'))
    expect(result.current.refAdIds).toEqual([])
    expect(result.current.totalRenders).toBe(0)
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

  it('a fully valid selection actually calls startGeneration and switches to the gallery tab', () => {
    const { result } = renderStudio()

    act(() => result.current.pickRefBrand('헬시키키'))
    act(() => result.current.toggleRefAd('ad-1'))
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    expect(result.current.step).toBe(4)

    act(() => result.current.goNext())
    expect(mockStartGeneration).toHaveBeenCalledTimes(1)
    expect(mockGo).toHaveBeenCalledWith('gallery')
  })
})
