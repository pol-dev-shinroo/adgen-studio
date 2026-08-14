import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import AIImagePane from './AIImagePane.jsx'

// Only useAIStudio is mocked — AIImagePane's own rendering logic (the
// background-vs-everything-else branch fixed after real user testing found
// the original single-box background highlight uselessly vague) is real.
const mockUseAIStudio = vi.fn()
vi.mock('../../context/AIStudioContext.jsx', () => ({
  useAIStudio: () => mockUseAIStudio(),
}))

const SEGMENTS = [
  { id: 'background-0', type: 'background', label: '배경', box: { x: 0, y: 0, width: 1, height: 1 } },
  { id: 'text-1', type: 'text', label: '문구1: 최대 71% 할인', text: '최대 71% 할인', box: { x: 0.1, y: 0.1, width: 0.4, height: 0.15 } },
  { id: 'model-99', type: 'model', label: '모델', box: { x: 0, y: 0.3, width: 0.5, height: 0.6 } },
  { id: 'product-100', type: 'product', label: '제품', box: { x: 0.5, y: 0.4, width: 0.5, height: 0.5 } },
]

function setup(activeSegmentId) {
  mockUseAIStudio.mockReturnValue({
    imageUrl: 'https://drive.google.com/file/d/abc123/view',
    segments: SEGMENTS,
    activeSegmentId,
    phase: `dialog:${activeSegmentId}`,
  })
  return render(<AIImagePane />)
}

describe('AIImagePane — non-background segments (unchanged single-box behavior)', () => {
  it('renders exactly one bordered highlight box positioned at the active segment\'s own box, and no mask cutouts', () => {
    const { container } = setup('text-1')

    const boxes = container.querySelectorAll('.ai-image-highlight')
    expect(boxes.length).toBe(1)
    expect(boxes[0].style.left).toBe('10%')
    expect(boxes[0].style.top).toBe('10%')
    expect(boxes[0].style.width).toBe('40%')
    expect(boxes[0].style.height).toBe('15%')
    expect(boxes[0].textContent).toContain('문구1: 최대 71% 할인')

    expect(container.querySelectorAll('.ai-image-mask-cutout').length).toBe(0)
  })
})

describe('AIImagePane — background segment (inverted mask, Part EE follow-up fix)', () => {
  it('renders zero .ai-image-highlight boxes and instead dims every OTHER segment, leaving background itself unboxed', () => {
    const { container } = setup('background-0')

    // The background segment's own box must never be rendered as a
    // highlight — that was the original, reported-as-confusing behavior.
    expect(container.querySelectorAll('.ai-image-highlight').length).toBe(0)

    // Exactly one dimming cutout per non-background segment (text + model +
    // product here), each positioned at THAT segment's own box, not
    // background's.
    const cutouts = container.querySelectorAll('.ai-image-mask-cutout')
    expect(cutouts.length).toBe(SEGMENTS.length - 1)

    const positions = [...cutouts].map((el) => ({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height }))
    expect(positions).toContainEqual({ left: '10%', top: '10%', width: '40%', height: '15%' }) // text-1
    expect(positions).toContainEqual({ left: '0%', top: '30%', width: '50%', height: '60%' }) // model-99
    expect(positions).toContainEqual({ left: '50%', top: '40%', width: '50%', height: '50%' }) // product-100
  })

  it('shows the 배경 label pinned to a fixed corner, not anchored to a box', () => {
    const { container } = setup('background-0')

    const label = container.querySelector('.ai-image-highlight-label-fixed')
    expect(label).not.toBeNull()
    expect(label.textContent).toBe('배경')
  })
})
