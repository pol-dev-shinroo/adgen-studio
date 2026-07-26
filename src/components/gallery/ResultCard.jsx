import { useState } from 'react'
import { useGallery } from '../../context/GalleryContext.jsx'
import { useAds } from '../../context/AdsContext.jsx'
import Thumb from '../common/Thumb.jsx'
import Badge from '../common/Badge.jsx'
import ImageLightbox from '../common/ImageLightbox.jsx'

// Every result here is an already-finished render (see
// adaptGeneratedResult.js) — the in-progress state lives in
// GenerationProgress.jsx instead, driven by the active job, not by cards in
// this grid.
export default function ResultCard({ result }) {
  const { approveResult } = useGallery()
  const { ads } = useAds()
  const [compareOpen, setCompareOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const referenceAd = ads.find((a) => String(a.id) === String(result.referenceAdId))
  // ImageLightbox expects ORIGINAL (non-embeddable) links — it converts
  // them itself. referenceAd.images[0] is the reference ad's own original
  // image; result.originalImage is the generated image's raw Drive link.
  const compareImages = [referenceAd?.images?.[0], result.originalImage].filter(Boolean)

  return (
    <div className="card res">
      <Thumb gradient="g5" image={result.image} fit="contain">
        <Badge variant={result.approved ? 'live' : 'run'}>{result.approved ? '승인됨' : '미승인'}</Badge>
      </Thumb>
      <div className="body">
        <div className="meta" style={{ color: 'var(--sub)', fontSize: 12 }}>
          {result.brand} · {result.format} · REF AD {result.referenceAdId}
        </div>
        <div className="acts">
          <a
            className="btn ghost sm"
            href={result.image}
            download
            target="_blank"
            rel="noopener noreferrer"
          >
            ⬇ 다운로드
          </a>
          <button className="btn ghost sm" onClick={() => setCompareOpen(true)} disabled={compareImages.length < 2}>
            🔀 비교
          </button>
          <button className="btn pri sm" onClick={() => approveResult(result.id)}>
            {result.approved ? '✔ 승인됨' : '✔ 승인'}
          </button>
        </div>
      </div>

      {compareOpen && (
        <ImageLightbox
          images={compareImages}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  )
}
