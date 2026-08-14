import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AIStudioProvider, useAIStudio } from './AIStudioContext.jsx'

// Part EE: AIStudioContext's real collaborators (NavigationContext,
// AdsContext, ProductsContext, GalleryContext, and the backend API client)
// are all mocked out — same DI-by-mock approach StudioContext.test.jsx
// already uses — so this only exercises AIStudioContext's own phase-
// advancement logic, not real network calls.
const mockShowToast = vi.fn()
const mockGo = vi.fn()
const mockRefreshResults = vi.fn().mockResolvedValue(undefined)
const mockStartAiSegmentation = vi.fn()
const mockStartAiRender = vi.fn()

let mockAds = []
let mockRefBrands = []
let mockMyBrands = []

vi.mock('./NavigationContext.jsx', () => ({
  useNavigation: () => ({ showToast: mockShowToast, go: mockGo }),
}))
vi.mock('./AdsContext.jsx', () => ({
  useAds: () => ({ ads: mockAds, brands: mockRefBrands }),
}))
vi.mock('./ProductsContext.jsx', () => ({
  useProducts: () => ({ brands: mockMyBrands }),
}))
vi.mock('./GalleryContext.jsx', () => ({
  useGallery: () => ({ refreshResults: mockRefreshResults }),
}))
vi.mock('../api/backendClient.js', () => ({
  startAiSegmentation: (...args) => mockStartAiSegmentation(...args),
  startAiRender: (...args) => mockStartAiRender(...args),
}))

function makeSegments(textCount, { withModel = false } = {}) {
  const segments = [{ id: 'background-0', type: 'background', label: '배경', box: { x: 0, y: 0, width: 1, height: 0.2 } }]
  for (let i = 0; i < textCount; i += 1) {
    segments.push({
      id: `text-${i + 1}`, type: 'text', label: `문구${i + 1}`, text: `문구 ${i + 1}`,
      box: { x: 0, y: 0.2, width: 0.5, height: 0.1 },
    })
  }
  if (withModel) segments.push({ id: 'model-99', type: 'model', label: '모델', box: { x: 0, y: 0, width: 1, height: 1 } })
  segments.push({ id: 'product-100', type: 'product', label: '제품', box: { x: 0, y: 0.6, width: 1, height: 0.4 } })
  return segments
}

function renderAIStudio() {
  return renderHook(() => useAIStudio(), { wrapper: AIStudioProvider })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRefreshResults.mockResolvedValue(undefined)
  mockAds = [{ id: 'ad-1', brand: '경쟁사A', image: 'https://example.com/ad-1.png' }]
  mockRefBrands = ['경쟁사A']
  mockMyBrands = [
    {
      key: 'healthykiki', name: '헬시키키',
      products: {
        '제품A': {
          productId: '1', price: '29,900원', promotionInfo: '없음', adHookCopy: '없음',
          extractedReferences: [{ type: 'product', imageUrl: 'https://example.com/product-1.png' }],
        },
      },
    },
  ]
})

// Part EE §10: parameterized by text-segment count (and model presence) so
// this doesn't hardcode a specific number of dialogs — the whole point of
// this test is that the sequence generalizes to whatever a real
// segmentation response returns.
describe.each([
  { textCount: 1, withModel: false },
  { textCount: 3, withModel: true },
])('phase advancement (textCount=$textCount, withModel=$withModel)', ({ textCount, withModel }) => {
  it('advances brand -> ad -> product -> segmenting -> each dialog in detected order -> review', async () => {
    mockStartAiSegmentation.mockResolvedValue({
      segments: makeSegments(textCount, { withModel }), imageUrl: 'https://example.com/ad-1-full.png',
    })
    const { result } = renderAIStudio()
    expect(result.current.phase).toBe('select-brand')

    act(() => result.current.selectRefBrand('경쟁사A'))
    expect(result.current.phase).toBe('select-ad')
    expect(result.current.selectedRefBrand).toBe('경쟁사A')

    act(() => result.current.selectRefAd('ad-1'))
    expect(result.current.phase).toBe('select-product')
    expect(result.current.selectedRefAdId).toBe('ad-1')

    act(() => result.current.selectBrandProduct('healthykiki', '1'))
    expect(result.current.phase).toBe('segmenting')
    expect(result.current.selectedBrandKey).toBe('healthykiki')
    expect(result.current.selectedProductId).toBe('1')

    await waitFor(() => expect(result.current.phase).toBe('dialog:background'))
    expect(mockStartAiSegmentation).toHaveBeenCalledWith('ad-1')
    expect(mockStartAiSegmentation).toHaveBeenCalledTimes(1)
    expect(result.current.activeSegmentId).toBe('background-0')

    act(() => result.current.chooseKeep())
    expect(result.current.decisions.background).toEqual({ mode: 'keep', value: null })

    for (let i = 0; i < textCount; i += 1) {
      const segmentId = `text-${i + 1}`
      expect(result.current.phase).toBe(`dialog:text:${segmentId}`)
      expect(result.current.activeSegmentId).toBe(segmentId)
      act(() => result.current.chooseCustom('직접 입력한 문구'))
      expect(result.current.decisions.texts[segmentId]).toEqual({ mode: 'custom', value: '직접 입력한 문구' })
    }

    if (withModel) {
      expect(result.current.phase).toBe('dialog:model')
      act(() => result.current.chooseReplace('https://example.com/model.png'))
      expect(result.current.decisions.model).toEqual({ mode: 'replace', value: 'https://example.com/model.png' })
    } else {
      expect(result.current.phase).not.toBe('dialog:model')
    }

    expect(result.current.phase).toBe('dialog:product')
    act(() => result.current.chooseKeep())
    expect(result.current.decisions.product).toEqual({ mode: 'keep', value: null })

    expect(result.current.phase).toBe('review')
    expect(Object.keys(result.current.decisions.texts)).toHaveLength(textCount)

    // The dialog log is a permanent record — every resolved dialog message
    // stays in the log, marked resolved, never removed.
    const dialogMessages = result.current.messages.filter((m) => m.kind === 'dialog')
    expect(dialogMessages.every((m) => m.chosenChoiceId)).toBe(true)
  })
})

describe('segmentation failure', () => {
  it('surfaces the error and stays in the segmenting phase rather than crashing forward', async () => {
    mockStartAiSegmentation.mockRejectedValue(new Error('네트워크 오류'))
    const { result } = renderAIStudio()

    act(() => result.current.selectRefBrand('경쟁사A'))
    act(() => result.current.selectRefAd('ad-1'))
    act(() => result.current.selectBrandProduct('healthykiki', '1'))

    await waitFor(() => expect(result.current.segmentationError).toBe('네트워크 오류'))
    expect(result.current.phase).toBe('segmenting')
    expect(mockShowToast).toHaveBeenCalledWith('분석 실패: 네트워크 오류')
  })
})

describe('chooseCustom', () => {
  it('ignores blank/whitespace-only free text rather than resolving the dialog', async () => {
    mockStartAiSegmentation.mockResolvedValue({ segments: makeSegments(0), imageUrl: 'https://example.com/ad.png' })
    const { result } = renderAIStudio()

    act(() => result.current.selectRefBrand('경쟁사A'))
    act(() => result.current.selectRefAd('ad-1'))
    act(() => result.current.selectBrandProduct('healthykiki', '1'))
    await waitFor(() => expect(result.current.phase).toBe('dialog:background'))

    act(() => result.current.chooseCustom('   '))
    expect(result.current.phase).toBe('dialog:background', 'blank free text must not advance the phase')
    expect(result.current.decisions.background).toBeNull()
  })
})

describe('resetConversation', () => {
  it('returns every piece of state to its initial value', async () => {
    mockStartAiSegmentation.mockResolvedValue({ segments: makeSegments(0), imageUrl: 'https://example.com/ad.png' })
    const { result } = renderAIStudio()

    act(() => result.current.selectRefBrand('경쟁사A'))
    act(() => result.current.selectRefAd('ad-1'))
    act(() => result.current.selectBrandProduct('healthykiki', '1'))
    await waitFor(() => expect(result.current.phase).toBe('dialog:background'))

    act(() => result.current.resetConversation())

    expect(result.current.phase).toBe('select-brand')
    // A fresh conversation isn't a BLANK log — it re-seeds the initial
    // "pick a brand" prompt (see resetConversation's own comment), same as
    // opening the screen for the first time.
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].kind).toBe('choices')
    expect(result.current.segments).toEqual([])
    expect(result.current.selectedRefBrand).toBeNull()
    expect(result.current.decisions).toEqual({ background: null, texts: {}, model: null, product: null })
  })
})
