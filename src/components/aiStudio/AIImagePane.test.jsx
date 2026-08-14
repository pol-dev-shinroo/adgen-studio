import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import AIImagePane from './AIImagePane.jsx'

// Only useAIStudio is mocked — AIImagePane's own rendering/measurement logic
// is real. jsdom doesn't do real layout (clientWidth/naturalWidth are 0 by
// default), so every test that needs pixel-accurate positioning stubs those
// two inputs directly on the rendered nodes before firing the image's load
// event — that's the exact same information the real browser would supply.
const mockUseAIStudio = vi.fn()
vi.mock('../../context/AIStudioContext.jsx', () => ({
  useAIStudio: () => mockUseAIStudio(),
}))

const SEGMENTS = [
  { id: 'background-0', type: 'background', label: '배경', box: { x: 0, y: 0, width: 1, height: 1 } },
  { id: 'text-1', type: 'text', label: '문구1: 최대 71% 할인', text: '최대 71% 할인', box: { x: 0.1, y: 0.2, width: 0.3, height: 0.15 } },
  { id: 'product-100', type: 'product', label: '제품', box: { x: 0.5, y: 0.4, width: 0.5, height: 0.5 } },
]

function setup(overrides) {
  mockUseAIStudio.mockReturnValue({
    imageUrl: 'https://drive.google.com/file/d/abc123/view',
    segments: SEGMENTS,
    activeSegmentId: 'text-1',
    phase: 'dialog:text:text-1',
    backgroundImageUrl: null,
    backgroundImageLoading: false,
    backgroundImageError: null,
    ...overrides,
  })
  return render(<AIImagePane />)
}

// Stubs a 400x300 frame showing an 800x400 (2:1) image — wider than the
// frame's own 4:3 aspect, so object-fit:contain letterboxes top/bottom:
// rendered image is 400x200, centered, offsetY 50px, offsetX 0px. Mirrors
// exactly what the real browser computes for object-fit:contain.
function stubLetterboxedLayout(container) {
  const frame = container.querySelector('.ai-image-frame')
  const img = container.querySelector('.ai-image-img')
  Object.defineProperty(frame, 'clientWidth', { value: 400, configurable: true })
  Object.defineProperty(frame, 'clientHeight', { value: 300, configurable: true })
  Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: 400, configurable: true })
  fireEvent.load(img)
  return { frame, img }
}

describe('AIImagePane — non-background segments: pixel-accurate positioning (Part FF bbox fix)', () => {
  it('positions the highlight box relative to the actual RENDERED (letterboxed) image content, not the frame', async () => {
    const { container } = setup({ activeSegmentId: 'text-1', phase: 'dialog:text:text-1' })
    stubLetterboxedLayout(container)

    // Rendered image rect: offsetX 0, offsetY 50, width 400, height 200.
    // Segment box {x:0.1, y:0.2, width:0.3, height:0.15} against that rect:
    // left = 0 + 0.1*400 = 40, top = 50 + 0.2*200 = 90, width = 0.3*400 = 120, height = 0.15*200 = 30.
    await waitFor(() => {
      const box = container.querySelector('.ai-image-highlight')
      expect(box).not.toBeNull()
      expect(box.style.left).toBe('40px')
      expect(box.style.top).toBe('90px')
      expect(box.style.width).toBe('120px')
      expect(box.style.height).toBe('30px')
    })
  })

  it('renders no highlight box at all before the image has loaded (avoids a flash at the wrong position)', () => {
    const { container } = setup({ activeSegmentId: 'text-1', phase: 'dialog:text:text-1' })
    // No stubLetterboxedLayout call — image never "loads" in this test.
    expect(container.querySelector('.ai-image-highlight')).toBeNull()
  })
})

describe('AIImagePane — background segment: isolated image, not a box or mask (Part FF-3 redesign)', () => {
  it('shows the isolated background image in place of the original ad, with no highlight box', async () => {
    const { container } = setup({
      activeSegmentId: 'background-0',
      phase: 'dialog:background',
      backgroundImageUrl: 'https://drive.google.com/file/d/bg999/view',
    })

    const img = container.querySelector('.ai-image-img')
    expect(img.src).toContain('bg999')

    expect(container.querySelector('.ai-image-highlight')).toBeNull()
    const label = container.querySelector('.ai-image-highlight-label-fixed')
    expect(label.textContent).toBe('배경 (분리된 이미지)')
  })

  it('shows a loading overlay over the original ad while isolation is still in progress', () => {
    const { container } = setup({
      activeSegmentId: 'background-0',
      phase: 'dialog:background',
      backgroundImageUrl: null,
      backgroundImageLoading: true,
    })

    const img = container.querySelector('.ai-image-img')
    expect(img.src).toContain('abc123') // still the original ad, not swapped yet
    expect(container.querySelector('.ai-image-loading-overlay')).not.toBeNull()
    expect(container.querySelector('.ai-image-highlight')).toBeNull()
  })

  it('falls back to the original ad image (no box) and shows an error label when isolation failed', () => {
    const { container } = setup({
      activeSegmentId: 'background-0',
      phase: 'dialog:background',
      backgroundImageUrl: null,
      backgroundImageLoading: false,
      backgroundImageError: '이미지 생성 실패',
    })

    const img = container.querySelector('.ai-image-img')
    expect(img.src).toContain('abc123')
    expect(container.querySelector('.ai-image-highlight')).toBeNull()
    const label = container.querySelector('.ai-image-highlight-label-fixed')
    expect(label.textContent).toBe('배경 이미지 준비 실패 — 원본 표시 중')
  })
})
