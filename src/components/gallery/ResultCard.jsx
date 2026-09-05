import { useState } from 'react'
import { useGallery } from '../../context/GalleryContext.jsx'
import { useAds } from '../../context/AdsContext.jsx'
import { useAIStudio } from '../../context/AIStudioContext.jsx'
import { useProducts } from '../../context/ProductsContext.jsx'
import { useNavigation } from '../../context/NavigationContext.jsx'
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
  const { startFromResult } = useAIStudio()
  const { brands: myBrands } = useProducts()
  const { go } = useNavigation()
  const [compareOpen, setCompareOpen] = useState(false)

  // Part OO: "이어서 편집" needs to actually resolve to a real brand/product
  // to seed a working conversation — an older row that predates the
  // Product ID column, or a brand name that no longer matches any of our
  // current brands, can't be continued. Same "don't offer an action that
  // can't actually work" posture 비교's own disabled={compareImages.length
  // < 2} already uses on this same card.
  const canContinueInAiStudio = !!result.productId && myBrands.some((b) => b.name === result.brand)

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
          {/* Part DD: which competitor brand this render referenced —
              blank for rows that predate the Ref Brand column, so nothing
              extra renders for those. */}
          {result.refBrand ? ` · vs ${result.refBrand}` : ''}
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
          <button
            className="btn ghost sm"
            onClick={() => { startFromResult(result, myBrands); go('ai-studio') }}
            disabled={!canContinueInAiStudio}
            title={canContinueInAiStudio ? undefined : '이 결과는 이어서 편집할 수 없습니다 (브랜드/제품 정보 없음)'}
          >
            💬 생성 AI에서 이어서 편집
          </button>
        </div>
      </div>

      {compareOpen && (
        <CompareModal referenceImage={referenceImage} result={result} onClose={() => setCompareOpen(false)} />
      )}
    </div>
  )
}
