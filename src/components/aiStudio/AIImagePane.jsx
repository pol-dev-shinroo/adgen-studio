import { useAIStudio } from '../../context/AIStudioContext.jsx'
import { toEmbeddableImageUrl } from '../../api/adaptAd.js'

// Part EE §2 top pane: the reference ad image, highlighting whichever
// segment the current dialog concerns (activeSegmentId) — read-only,
// best-effort (§9 explicitly rules out manual bounding-box adjustment).
//
// The 'background' segment is a special case, not just another box: a
// single bordered rectangle over "a representative background area" (what
// adSegmentation.service.js's own box for that segment actually is) doesn't
// communicate "this is the background" nearly as clearly as showing the
// user what background actually IS — everything that ISN'T one of the
// other, foreground segments. So for background specifically, we ignore
// that segment's own box entirely and instead dim every OTHER (text/
// product/model) segment's box, leaving only the true background area at
// full brightness. Every other segment type keeps the original single-box
// highlight unchanged.
export default function AIImagePane() {
  const { imageUrl, segments, activeSegmentId, phase } = useAIStudio()

  if (!imageUrl) {
    return (
      <div className="ai-image-pane ai-image-pane-empty">
        <p className="sub">{phase === 'segmenting' ? '광고 이미지를 분석하고 있습니다...' : '광고를 선택하면 여기에 표시됩니다.'}</p>
      </div>
    )
  }

  const activeSegment = segments.find((s) => s.id === activeSegmentId)
  const isBackgroundActive = activeSegment?.type === 'background'
  const foregroundSegments = isBackgroundActive ? segments.filter((s) => s.type !== 'background') : []
  const embeddable = toEmbeddableImageUrl(imageUrl, 'w1000')

  return (
    <div className="ai-image-pane">
      <div className="ai-image-frame">
        <img src={embeddable} alt="" className="ai-image-img" />

        {activeSegment && !isBackgroundActive && (
          <div
            className="ai-image-highlight"
            style={{
              left: `${activeSegment.box.x * 100}%`,
              top: `${activeSegment.box.y * 100}%`,
              width: `${activeSegment.box.width * 100}%`,
              height: `${activeSegment.box.height * 100}%`,
            }}
          >
            <span className="ai-image-highlight-label">{activeSegment.label}</span>
          </div>
        )}

        {isBackgroundActive && (
          <>
            <span className="ai-image-highlight-label ai-image-highlight-label-fixed">{activeSegment.label}</span>
            {foregroundSegments.map((seg) => (
              <div
                key={seg.id}
                className="ai-image-mask-cutout"
                style={{
                  left: `${seg.box.x * 100}%`,
                  top: `${seg.box.y * 100}%`,
                  width: `${seg.box.width * 100}%`,
                  height: `${seg.box.height * 100}%`,
                }}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
