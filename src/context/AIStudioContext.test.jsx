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
// Part FF-2: resolves to a harmless default (no url) so existing tests that
// never assert on background-image behavior aren't forced to also mock this
// out one by one — real background-isolation behavior gets its own
// describe block below.
const mockStartAiBackgroundImage = vi.fn().mockResolvedValue({ backgroundImageUrl: null })
// Part SS: conversation persistence — default to "no saved history" /
// "save succeeds" so every existing test above (which never touches
// persistence) behaves exactly as before.
const mockListAiConversations = vi.fn().mockResolvedValue({ conversations: [] })
const mockGetAiConversation = vi.fn()
const mockSaveAiConversation = vi.fn().mockResolvedValue({ ok: true })

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
  startAiBackgroundImage: (...args) => mockStartAiBackgroundImage(...args),
  listAiConversations: (...args) => mockListAiConversations(...args),
  getAiConversation: (...args) => mockGetAiConversation(...args),
  saveAiConversation: (...args) => mockSaveAiConversation(...args),
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
  mockStartAiBackgroundImage.mockResolvedValue({ backgroundImageUrl: null })
  mockListAiConversations.mockResolvedValue({ conversations: [] })
  mockSaveAiConversation.mockResolvedValue({ ok: true })
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

describe('background image isolation (Part FF-2)', () => {
  it('fires exactly once when entering dialog:background, and stores the resulting URL', async () => {
    mockStartAiSegmentation.mockResolvedValue({ segments: makeSegments(0), imageUrl: 'https://example.com/ad.png' })
    mockStartAiBackgroundImage.mockResolvedValue({ backgroundImageUrl: 'https://example.com/bg-isolated.png' })
    const { result } = renderAIStudio()

    act(() => result.current.selectRefBrand('경쟁사A'))
    act(() => result.current.selectRefAd('ad-1'))
    act(() => result.current.selectBrandProduct('healthykiki', '1'))
    await waitFor(() => expect(result.current.phase).toBe('dialog:background'))

    await waitFor(() => expect(result.current.backgroundImageUrl).toBe('https://example.com/bg-isolated.png'))
    expect(mockStartAiBackgroundImage).toHaveBeenCalledWith('ad-1')
    expect(mockStartAiBackgroundImage).toHaveBeenCalledTimes(1)
    expect(result.current.backgroundImageLoading).toBe(false)
    expect(result.current.backgroundImageError).toBeNull()

    // Answering the dialog and moving on must not re-trigger a second,
    // wasted real image_generation call.
    act(() => result.current.chooseKeep())
    expect(mockStartAiBackgroundImage).toHaveBeenCalledTimes(1)
  })

  it('a failed isolation surfaces an error but never blocks the dialog itself from being answered', async () => {
    mockStartAiSegmentation.mockResolvedValue({ segments: makeSegments(0), imageUrl: 'https://example.com/ad.png' })
    mockStartAiBackgroundImage.mockRejectedValue(new Error('이미지 생성 실패'))
    const { result } = renderAIStudio()

    act(() => result.current.selectRefBrand('경쟁사A'))
    act(() => result.current.selectRefAd('ad-1'))
    act(() => result.current.selectBrandProduct('healthykiki', '1'))
    await waitFor(() => expect(result.current.phase).toBe('dialog:background'))

    await waitFor(() => expect(result.current.backgroundImageError).toBe('이미지 생성 실패'))
    expect(result.current.backgroundImageUrl).toBeNull()
    expect(result.current.backgroundImageLoading).toBe(false)

    // The background dialog itself is independent of whether its preview
    // image loaded — a failed preview must never block the user from
    // answering.
    act(() => result.current.chooseKeep())
    expect(result.current.decisions.background).toEqual({ mode: 'keep', value: null })
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
    expect(result.current.backgroundImageUrl).toBeNull()
    expect(result.current.backgroundImageLoading).toBe(false)
    expect(result.current.backgroundImageError).toBeNull()
    expect(result.current.sourceResult).toBeNull()
  })
})

// Part OO: startFromResult seeds a conversation from one of OUR OWN prior
// 생성 스튜디오 results ("이어서 편집") instead of always starting blank.
describe('startFromResult + seeded resetConversation (Part OO)', () => {
  function makeResult(overrides = {}) {
    return {
      id: 'gen-1', brand: '헬시키키', refBrand: '경쟁사A', referenceAdId: 'ad-1', productId: '1',
      image: 'https://example.com/result-thumb-w600.png',
      originalImage: 'https://drive.google.com/file/d/RESULT_FILE/view',
      originalReferenceAdImage: 'https://example.com/original-ad.png',
      ...overrides,
    }
  }

  it('jumps straight to segmenting with the 4 selection states + sourceImageUrl/sourceResult set from the seed', async () => {
    mockStartAiSegmentation.mockResolvedValue({ segments: makeSegments(0), imageUrl: 'https://example.com/result-thumb-w600.png' })
    const { result } = renderAIStudio()
    const seedResult = makeResult()

    act(() => result.current.startFromResult(seedResult, mockMyBrands))
    act(() => result.current.resetConversation())

    expect(result.current.phase).toBe('segmenting')
    expect(result.current.selectedRefBrand).toBe('경쟁사A')
    expect(result.current.selectedRefAdId).toBe('ad-1')
    expect(result.current.selectedBrandKey).toBe('healthykiki')
    expect(result.current.selectedProductId).toBe('1')
    expect(result.current.sourceResult).toEqual(seedResult)
    // The permanent Drive URL, never the w600 embeddable thumbnail variant.
    expect(result.current.messages[0].text).toMatch(/이어서 편집/)

    // The existing runSegmentation effect for phase 'segmenting' must fire
    // exactly as it already does, now carrying sourceImageUrl through.
    await waitFor(() => expect(mockStartAiSegmentation).toHaveBeenCalledTimes(1))
    expect(mockStartAiSegmentation).toHaveBeenCalledWith('ad-1', 'https://drive.google.com/file/d/RESULT_FILE/view')
  })

  it('falls back to a normal blank start (with a console.warn) when the result\'s brand can\'t be resolved to a known brand key', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderAIStudio()
    const seedResult = makeResult({ brand: '없어진브랜드' })

    act(() => result.current.startFromResult(seedResult, mockMyBrands))
    act(() => result.current.resetConversation())

    expect(result.current.phase).toBe('select-brand')
    expect(result.current.sourceResult).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('a normal (non-seeded) visit behaves exactly as before — resetConversation with no prior startFromResult call starts blank', () => {
    const { result } = renderAIStudio()
    act(() => result.current.resetConversation())

    expect(result.current.phase).toBe('select-brand')
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].kind).toBe('choices')
    expect(result.current.sourceResult).toBeNull()
    expect(mockStartAiSegmentation).not.toHaveBeenCalled()
  })
})

// Part SS: conversation persistence — autosave, resume-on-load, and the
// "a Part-OO seed always wins" rule.
describe('conversation persistence (Part SS)', () => {
  it('skips autosaving while still on the unanswered select-brand prompt, then saves (debounced) once a dialog is answered', async () => {
    mockStartAiSegmentation.mockResolvedValue({ segments: makeSegments(0), imageUrl: 'https://example.com/ad.png' })
    const { result } = renderAIStudio()
    act(() => result.current.resetConversation())

    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(mockSaveAiConversation).not.toHaveBeenCalled()

    act(() => result.current.selectRefBrand('경쟁사A'))
    act(() => result.current.selectRefAd('ad-1'))
    act(() => result.current.selectBrandProduct('healthykiki', '1'))
    await waitFor(() => expect(result.current.phase).toBe('dialog:background'))

    await waitFor(() => expect(mockSaveAiConversation).toHaveBeenCalled(), { timeout: 2000 })
    const [id, payload] = mockSaveAiConversation.mock.calls.at(-1)
    expect(id).toBe(result.current.conversationId)
    expect(payload.phase).toBe('dialog:background')
    expect(payload.selectedRefAdId).toBe('ad-1')
    expect(payload.selectedBrandKey).toBe('healthykiki')
  })

  it('loadConversation hydrates every relevant piece of state from getAiConversation, including the active dialog segment', async () => {
    mockGetAiConversation.mockResolvedValue({
      id: 'conv-99',
      selectedBrandKey: 'healthykiki', selectedRefBrand: '경쟁사A', selectedRefAdId: 'ad-1', selectedProductId: '1',
      phase: 'dialog:background',
      imageUrl: 'https://example.com/ad.png',
      messages: [{ id: 1, role: 'ai', kind: 'text', text: 'hi' }],
      segments: makeSegments(0),
      decisions: { background: null, texts: {}, model: null, product: null },
      sourceResult: null,
    })
    const { result } = renderAIStudio()

    await act(async () => { await result.current.loadConversation('conv-99') })

    expect(result.current.conversationId).toBe('conv-99')
    expect(result.current.phase).toBe('dialog:background')
    expect(result.current.selectedRefAdId).toBe('ad-1')
    expect(result.current.messages).toEqual([{ id: 1, role: 'ai', kind: 'text', text: 'hi' }])
    expect(result.current.activeSegmentId).toBe('background-0')
  })

  it('initializeConversation resumes the most recently saved conversation when no Part-OO seed is pending', async () => {
    mockListAiConversations.mockResolvedValue({
      conversations: [{ id: 'conv-recent', label: '최근 대화', updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    mockGetAiConversation.mockResolvedValue({
      id: 'conv-recent', selectedBrandKey: null, selectedRefBrand: null, selectedRefAdId: null, selectedProductId: null,
      phase: 'select-ad', imageUrl: null, messages: [{ id: 1, role: 'user', text: '경쟁사A' }], segments: [],
      decisions: { background: null, texts: {}, model: null, product: null }, sourceResult: null,
    })
    const { result } = renderAIStudio()

    await act(async () => { await result.current.initializeConversation() })

    expect(result.current.conversationId).toBe('conv-recent')
    expect(result.current.phase).toBe('select-ad')
  })

  it('a pending Part-OO seed always starts a NEW conversation via initializeConversation, never resuming the last saved one', async () => {
    mockListAiConversations.mockResolvedValue({
      conversations: [{ id: 'conv-old', label: '이전 대화', updatedAt: '2020-01-01T00:00:00.000Z' }],
    })
    mockStartAiSegmentation.mockResolvedValue({ segments: makeSegments(0), imageUrl: 'https://example.com/result-thumb-w600.png' })
    const { result } = renderAIStudio()
    const seedResult = {
      id: 'gen-1', brand: '헬시키키', refBrand: '경쟁사A', referenceAdId: 'ad-1', productId: '1',
      image: 'https://example.com/result-thumb-w600.png', originalImage: 'https://drive.google.com/file/d/RESULT_FILE/view',
    }

    act(() => result.current.startFromResult(seedResult, mockMyBrands))
    await act(async () => { await result.current.initializeConversation() })

    // The seeded flow races straight through 'segmenting' into
    // runSegmentation's own resolution — what matters here is that it never
    // resumed conv-old (phase would be 'select-ad') and did seed sourceResult.
    expect(result.current.phase).not.toBe('select-ad')
    expect(result.current.sourceResult).toEqual(seedResult)
    expect(mockGetAiConversation).not.toHaveBeenCalled()
  })
})
