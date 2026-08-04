import { useEffect, useState } from 'react'

const STAGES = ['이미지 분석 중...', '참조 이미지 생성 중...']
const STAGE_INTERVAL_MS = 3500

// Shared "actively working" indicator for every 참조 이미지 추출 action
// (product and, from Part N on, ad extraction alike) — replaces a generic
// Spinner with something that reads as "scanning" the specific source
// photo it's overlaid on: an animated scan-line sweep, a pulsing glow
// border, and staged status text that advances over time. The backend
// call is a single request/response with no real progress events to
// report, so the staged text is a narrative approximation of what a
// detection(-then-compose) extraction call is actually doing, not a
// literal progress bar.
//
// Usage: render as a child of the source Thumb you want to show as
// "being scanned" — Thumb already renders {children} inside its own
// position:relative .thumb wrapper (same trick Badge already uses), so
// this needs no wrapper of its own.
export default function ScanningOverlay({ active }) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    if (!active) {
      setStageIndex(0)
      return
    }
    const timer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1))
    }, STAGE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [active])

  if (!active) return null

  return (
    <div className="scan-overlay" aria-hidden="true">
      <div className="scan-line" />
      <div className="scan-caption">{STAGES[stageIndex]}</div>
    </div>
  )
}
