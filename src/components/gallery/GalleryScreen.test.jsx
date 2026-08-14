import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NavigationProvider } from '../../context/NavigationContext.jsx'
import { GalleryProvider, useGallery } from '../../context/GalleryContext.jsx'
import Toast from '../layout/Toast.jsx'
import GalleryScreen from './GalleryScreen.jsx'

// A whole-job generation failure verification: a real 400 from the real
// backend's validation (e.g. prepareInputs's "no extracted reference
// image" / "unknown product" errors) surfaces through backendClient.js's
// request() as err.message = body.error — simulated here by mocking only
// the network boundary (global.fetch), same as the "real or simulated
// failure" the task explicitly allows. Everything above the network call
// (GalleryContext's onError, useJobPolling, GalleryScreen's render) is the
// real, unmocked code.
const REAL_ERROR_TEXT = '다음 제품은 아직 참조 이미지가 추출되지 않았습니다 — 상품관리에서 먼저 추출해주세요: 테스트 제품'

function TriggerButton({ input }) {
  const { startGeneration } = useGallery()
  return <button onClick={() => startGeneration(input)}>__trigger__</button>
}

function renderGallery(triggerInput) {
  return render(
    <NavigationProvider>
      <GalleryProvider>
        <Toast />
        <TriggerButton input={triggerInput} />
        <GalleryScreen />
      </GalleryProvider>
    </NavigationProvider>
  )
}

const baseInput = {
  refBrand: '경쟁사', refAdIds: ['1'], brand: { key: 'healthykiki', productIds: ['1'] },
  formats: ['1:1 피드'], quantity: 1, styleIntensity: 60, instructions: '', adCopyOverride: null, referenceSheetImageUrl: null,
}

beforeEach(() => {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GalleryScreen: whole-job generation failure', () => {
  it('a real 400 validation error persists in a readable panel with the full text, and the copy button copies it exactly', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (url.includes('/api/generate/results')) {
        return { ok: true, status: 200, json: async () => ({ results: [] }) }
      }
      if (url.includes('/api/generate') && options?.method === 'POST') {
        return { ok: false, status: 400, json: async () => ({ error: REAL_ERROR_TEXT }) }
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    }))

    renderGallery(baseInput)

    fireEvent.click(screen.getByText('__trigger__'))

    // The persistent panel — not just a toast — must show the FULL,
    // untruncated real error text.
    const panelText = await screen.findByText(REAL_ERROR_TEXT)
    expect(panelText).toBeInTheDocument()

    // The toast also fires (additive, not a replacement).
    await waitFor(() => {
      expect(screen.getByText(`생성 중 오류가 발생했습니다: ${REAL_ERROR_TEXT}`)).toBeInTheDocument()
    })

    const copyButtons = screen.getAllByText('복사')
    fireEvent.click(copyButtons[0])

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(REAL_ERROR_TEXT)
    })
    // NavigationContext's toast queue shows one message at a time and only
    // advances to the next queued one after TOAST_DISPLAY_MS (2.8s real
    // time) — the earlier "생성 중 오류가 발생했습니다..." toast is still
    // showing, so "복사되었습니다" is queued behind it, not shown instantly.
    await waitFor(() => {
      expect(screen.getByText('복사되었습니다')).toBeInTheDocument()
    }, { timeout: 4000 })
  }, 8000)

  it('the copy button falls back to execCommand when the Clipboard API is unavailable, and still confirms success', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    document.execCommand = vi.fn().mockReturnValue(true)

    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (url.includes('/api/generate/results')) return { ok: true, status: 200, json: async () => ({ results: [] }) }
      if (url.includes('/api/generate') && options?.method === 'POST') {
        return { ok: false, status: 400, json: async () => ({ error: REAL_ERROR_TEXT }) }
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    }))

    renderGallery(baseInput)
    fireEvent.click(screen.getByText('__trigger__'))
    await screen.findByText(REAL_ERROR_TEXT)

    fireEvent.click(screen.getAllByText('복사')[0])

    await waitFor(() => expect(document.execCommand).toHaveBeenCalledWith('copy'))
    // Same toast-queue delay as the previous test — the error toast is
    // still showing when the copy confirmation gets queued behind it.
    await waitFor(() => expect(screen.getByText('복사되었습니다')).toBeInTheDocument(), { timeout: 4000 })
  }, 8000)

  it('starting a new generation clears the previous error panel', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (url.includes('/api/generate/results')) return { ok: true, status: 200, json: async () => ({ results: [] }) }
      if (url.includes('/api/generate') && options?.method === 'POST') {
        return { ok: false, status: 400, json: async () => ({ error: REAL_ERROR_TEXT }) }
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    }))

    renderGallery(baseInput)
    fireEvent.click(screen.getByText('__trigger__'))
    await screen.findByText(REAL_ERROR_TEXT)

    // Real fetch will 400 again on the second attempt too, but the panel
    // must clear the instant a new attempt starts (setLastError(null) at
    // the top of startGeneration), not just once a new result lands.
    fireEvent.click(screen.getByText('__trigger__'))
    await waitFor(() => expect(screen.queryByText(REAL_ERROR_TEXT)).not.toBeInTheDocument())
  })
})

describe('GalleryScreen: partial per-item failure list', () => {
  it('each failed item shows its full untruncated error text with its own copy button, alongside the existing retry button', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (url.includes('/api/generate/results')) return { ok: true, status: 200, json: async () => ({ results: [] }) }
      if (url.endsWith('/api/generate') && options?.method === 'POST') {
        return { ok: true, status: 202, json: async () => ({ jobId: 'job-1' }) }
      }
      if (url.includes('/api/generate/job-1')) {
        const failures = [{ adId: '1', format: '1:1 피드', productId: '1', error: '가짜 렌더링 오류: 콘텐츠 정책 위반 (매우 긴 실제 에러 메시지 예시입니다 잘리지 않아야 합니다)' }]
        return {
          ok: true, status: 200,
          json: async () => ({
            jobId: 'job-1', status: 'done', progress: { phase: 'done', totalRenders: 1, rendersDone: 1, recentItems: [] },
            summary: { totalRenders: 1, succeeded: 0, failed: 1, failures, resultIds: [] },
          }),
        }
      }
      throw new Error(`Unexpected fetch call: ${url}`)
    }))

    renderGallery(baseInput)
    fireEvent.click(screen.getByText('__trigger__'))

    // useJobPolling waits pollIntervalMs (1500ms, real setTimeout) before its
    // first status poll, so this needs more than testing-library's default
    // 1000ms findBy timeout.
    const errorText = await screen.findByText(/가짜 렌더링 오류.*잘리지 않아야 합니다/, {}, { timeout: 3000 })
    expect(errorText).toBeInTheDocument()
    // Not the shared ellipsis-truncated class used for the compact prefix.
    expect(errorText.className).toContain('job-progress-item-error')
    expect(errorText.className).not.toContain('job-progress-item-name')

    expect(screen.getByText('↻ 재시도')).toBeInTheDocument()

    fireEvent.click(screen.getAllByText('복사')[0])
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        '가짜 렌더링 오류: 콘텐츠 정책 위반 (매우 긴 실제 에러 메시지 예시입니다 잘리지 않아야 합니다)'
      )
    })
  }, 8000)
})
