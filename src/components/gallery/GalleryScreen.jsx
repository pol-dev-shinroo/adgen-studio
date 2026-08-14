import { useState } from 'react'
import '../../styles/gallery.css'
import GalleryFilters from './GalleryFilters.jsx'
import ResultCard from './ResultCard.jsx'
import GenerationProgress from './GenerationProgress.jsx'
import PageLoader from '../common/PageLoader.jsx'
import { useGallery } from '../../context/GalleryContext.jsx'
import { useNavigation } from '../../context/NavigationContext.jsx'
import { copyToClipboard } from '../../utils/clipboard.js'

// Shared by the whole-job error panel and each partial-failure list item
// below — both need "copy this exact error text" with the same toast
// confirmation/fallback-failure handling.
function CopyErrorButton({ text, showToast, className = 'btn ghost sm' }) {
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const ok = await copyToClipboard(text)
        showToast(ok ? '복사되었습니다' : '복사에 실패했습니다 — 직접 선택해 복사해주세요')
      }}
    >
      복사
    </button>
  )
}

export default function GalleryScreen() {
  const { results, activeJob, lastSummary, lastError, retryResult, resultsLoading } = useGallery()
  const { showToast } = useNavigation()
  const [filter, setFilter] = useState('전체')

  const brands = [...new Set(results.map((r) => r.brand).filter(Boolean))]
  const visible = results.filter((r) => {
    if (filter === '전체') return true
    if (filter === '승인됨') return !!r.approved
    return r.brand === filter
  })

  return (
    <section>
      <div className="head">
        <div>
          <h1>결과 갤러리</h1>
          <p className="sub">생성된 광고 이미지 · 브랜드별 필터</p>
        </div>
      </div>

      {activeJob && <GenerationProgress job={activeJob} onRetry={retryResult} />}

      {/* A whole-job failure (the generation request itself never completed —
          a validation error, a network/server error, or a lost job) is a
          different situation from the partial per-item failure list below
          (the job ran and some individual renders failed) — kept as its own
          visually distinct panel, not folded into lastSummary's. Persists
          until the next generation attempt (see GalleryContext's lastError),
          unlike the toast it accompanies. */}
      {!activeJob && lastError && (
        <div className="job-progress error-panel">
          <div className="job-progress-label">생성 실패</div>
          <div className="error-panel-text">{lastError}</div>
          <div className="error-panel-actions">
            <CopyErrorButton text={lastError} showToast={showToast} className="btn ghost sm" />
          </div>
        </div>
      )}

      {!activeJob && lastSummary?.failed > 0 && (
        <div className="job-progress">
          <div className="job-progress-label">
            지난 생성 결과: 성공 {lastSummary.succeeded}건 · 실패 {lastSummary.failed}건
          </div>
          <div className="job-progress-list">
            {lastSummary.failures.map((f, i) => (
              <div key={`${f.adId}-${i}`} className="job-progress-item">
                <div className="job-progress-item-body">
                  <div className="job-progress-item-name">
                    AD {f.adId}{f.format ? ` · ${f.format}` : ''}{f.productId ? ` · 제품 ${f.productId}` : ''}
                  </div>
                  <div className="job-progress-item-error">{f.error}</div>
                </div>
                <div className="job-progress-item-actions">
                  <CopyErrorButton text={f.error} showToast={showToast} className="btn ghost sm" />
                  {f.format && (
                    <button className="btn ghost sm" onClick={() => retryResult(f)}>↻ 재시도</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <GalleryFilters filter={filter} setFilter={setFilter} brands={brands} />

      {resultsLoading && results.length === 0 ? (
        <PageLoader />
      ) : results.length === 0 ? (
        <p className="sub">아직 생성된 결과가 없습니다 — 생성 스튜디오에서 광고를 생성해보세요.</p>
      ) : (
        <div className="grid">
          {visible.map((r) => <ResultCard key={r.id} result={r} />)}
        </div>
      )}
    </section>
  )
}
