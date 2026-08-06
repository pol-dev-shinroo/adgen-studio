import { useState } from 'react'
import { useGallery } from '../../context/GalleryContext.jsx'
import { useAds } from '../../context/AdsContext.jsx'
import Thumb from '../common/Thumb.jsx'
import Badge from '../common/Badge.jsx'
import CompareModal from './CompareModal.jsx'

// Every result here is an already-finished render (see
// adaptGeneratedResult.js) — the in-progress state lives in
// GenerationProgress.jsx instead, driven by the active job, not by cards in
// this grid.
export default function ResultCard({ result }) {
  const { approveResult } = useGallery()
  const { ads } = useAds()
  const [compareOpen, setCompareOpen] = useState(false)

  const referenceAd = ads.find((a) => String(a.id) === String(result.referenceAdId))
  // Part V: prefer the snapshot generation.service.js persisted at
  // generation time (correct even if the ad feed changes later) — falls
  // back to the live AdsContext lookup only for rows that predate that
  // column, so older rows don't lose 비교 entirely.
  const referenceImage = result.originalReferenceAdImage || referenceAd?.images?.[0] || ''
  const compareImages = [referenceImage, result.originalImage].filter(Boolean)

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
        <CompareModal referenceImage={referenceImage} result={result} onClose={() => setCompareOpen(false)} />
      )}
    </div>
  )
}
