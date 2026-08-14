import { useState, useEffect, useRef, useCallback } from 'react'
import { useAIStudio } from '../../context/AIStudioContext.jsx'
import { toEmbeddableImageUrl } from '../../api/adaptAd.js'
import Spinner from '../common/Spinner.jsx'

// Part FF: measures the actual RENDERED image rect within its frame, in
// pixels. .ai-image-img uses object-fit:contain (so a screenshot's real
// aspect ratio is never cropped), which means the <img>'s own box is
// frequently SMALLER than its .ai-image-frame container in one dimension
// (letterboxed, centered by the frame's own flex centering) — every
// previous version of the highlight box was positioned as a percentage of
// the FRAME, not of this actual rendered image content, so whenever the two
// aspect ratios differed the box drifted off the real region it was meant
// to cover (the "box가 정확하게 관련 부분을 cover하지 않는" bug). Segment
// boxes are normalized 0..1 against the image's own natural pixel
// dimensions, so translating them correctly requires knowing exactly where
// the rendered image content starts/ends within the frame, not just what
// percentage of the frame's own box to use.
function useContainedImageRect(frameRef, imgRef, imgLoadToken) {
  const [rect, setRect] = useState(null)

  const measure = useCallback(() => {
    const frame = frameRef.current
    const img = imgRef.current
    if (!frame || !img || !img.naturalWidth || !img.naturalHeight) return
    const frameW = frame.clientWidth
    const frameH = frame.clientHeight
    if (!frameW || !frameH) return

    const imgAspect = img.naturalWidth / img.naturalHeight
    const frameAspect = frameW / frameH
    let width
    let height
    if (imgAspect > frameAspect) {
      width = frameW
      height = frameW / imgAspect
    } else {
      height = frameH
      width = frameH * imgAspect
    }
    setRect({ offsetX: (frameW - width) / 2, offsetY: (frameH - height) / 2, width, height })
  }, [frameRef, imgRef])

  useEffect(() => {
    if (!imgLoadToken) return undefined
    measure()
    const frame = frameRef.current
    // The frame's own box can change size independent of a window resize
    // (sidebar toggling, a layout breakpoint) — ResizeObserver catches all
    // of those, a window 'resize' listener alone wouldn't.
    if (!frame || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [imgLoadToken, measure, frameRef])

  return rect
}

// Part EE §2 top pane, redesigned twice since the original single-box-per-
// segment version (Part FF's follow-up, then this pass, per real user
// testing feedback on both):
//
// - Every non-background segment (text/model/product) still highlights a
//   box on the ORIGINAL ad image — unchanged in spirit, just now positioned
//   correctly via useContainedImageRect above instead of naive frame-
//   relative percentages.
// - The background dialog no longer highlights anything on the original ad
//   at all (neither a single box nor a dim-mask over the other segments,
//   both tried and rejected in earlier passes) — it instead displays a real,
//   separately generated image with the background isolated on its own
//   (backgroundImageUrl, from AIStudioContext's runBackgroundIsolation),
//   since showing the user what background actually IS is far clearer than
//   any highlight-over-the-original-ad technique. Falls back to the
//   original ad image (no highlight) if isolation is still loading or
//   failed, rather than leaving the pane blank.
export default function AIImagePane() {
  const {
    imageUrl, segments, activeSegmentId, phase,
    backgroundImageUrl, backgroundImageLoading, backgroundImageError,
  } = useAIStudio()

  const frameRef = useRef(null)
  const imgRef = useRef(null)
  const [imgLoadToken, setImgLoadToken] = useState(0)

  const activeSegment = segments.find((s) => s.id === activeSegmentId)
  const isBackgroundActive = activeSegment?.type === 'background'
  const showIsolatedBackground = isBackgroundActive && !!backgroundImageUrl
  const displaySourceUrl = showIsolatedBackground ? backgroundImageUrl : imageUrl

  // Re-measure whenever the actual displayed image changes (original ad <->
  // isolated background can have completely different natural dimensions).
  useEffect(() => {
    setImgLoadToken(0)
  }, [displaySourceUrl])

  const rect = useContainedImageRect(frameRef, imgRef, imgLoadToken)

  if (!imageUrl) {
    return (
      <div className="ai-image-pane ai-image-pane-empty">
        <p className="sub">{phase === 'segmenting' ? '광고 이미지를 분석하고 있습니다...' : '광고를 선택하면 여기에 표시됩니다.'}</p>
      </div>
    )
  }

  const embeddable = toEmbeddableImageUrl(displaySourceUrl, 'w1000')

  return (
    <div className="ai-image-pane">
      <div className="ai-image-frame" ref={frameRef}>
        <img
          ref={imgRef}
          src={embeddable}
          alt=""
          className="ai-image-img"
          onLoad={() => setImgLoadToken((n) => n + 1)}
        />

        {isBackgroundActive && backgroundImageLoading && (
          <div className="ai-image-loading-overlay">
            <Spinner size="md" />
            <span>배경 이미지를 준비하고 있습니다...</span>
          </div>
        )}

        {showIsolatedBackground && (
          <span className="ai-image-highlight-label ai-image-highlight-label-fixed">배경 (분리된 이미지)</span>
        )}

        {isBackgroundActive && !showIsolatedBackground && !backgroundImageLoading && backgroundImageError && (
          <span className="ai-image-highlight-label ai-image-highlight-label-fixed">
            배경 이미지 준비 실패 — 원본 표시 중
          </span>
        )}

        {activeSegment && !isBackgroundActive && rect && (
          <div
            className="ai-image-highlight"
            style={{
              left: `${rect.offsetX + activeSegment.box.x * rect.width}px`,
              top: `${rect.offsetY + activeSegment.box.y * rect.height}px`,
              width: `${activeSegment.box.width * rect.width}px`,
              height: `${activeSegment.box.height * rect.height}px`,
            }}
          >
            <span className="ai-image-highlight-label">{activeSegment.label}</span>
          </div>
        )}
      </div>
    </div>
  )
}
