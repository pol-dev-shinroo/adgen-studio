import { useAIStudio } from '../../context/AIStudioContext.jsx'
import { toEmbeddableImageUrl } from '../../api/adaptAd.js'

// Part EE §2 top pane: the reference ad image, with a single highlight
// rectangle over whichever segment the current dialog concerns
// (activeSegmentId) — read-only, best-effort (§9 explicitly rules out
// manual bounding-box adjustment).
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
  const embeddable = toEmbeddableImageUrl(imageUrl, 'w1000')

  return (
    <div className="ai-image-pane">
      <div className="ai-image-frame">
        <img src={embeddable} alt="" className="ai-image-img" />
        {activeSegment && (
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
      </div>
    </div>
  )
}
