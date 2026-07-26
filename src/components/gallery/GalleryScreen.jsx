import { useState } from 'react'
import '../../styles/gallery.css'
import GalleryFilters from './GalleryFilters.jsx'
import ResultCard from './ResultCard.jsx'
import GenerationProgress from './GenerationProgress.jsx'
import { useGallery } from '../../context/GalleryContext.jsx'

export default function GalleryScreen() {
  const { results, activeJob, lastSummary, retryResult } = useGallery()
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

      {!activeJob && lastSummary?.failed > 0 && (
        <div className="sync-progress">
          <div className="sync-label">
            지난 생성 결과: 성공 {lastSummary.succeeded}건 · 실패 {lastSummary.failed}건
          </div>
          <div className="sync-list">
            {lastSummary.failures.map((f, i) => (
              <div key={`${f.adId}-${i}`} className="sync-item">
                <div className="sync-item-name">
                  AD {f.adId}{f.format ? ` · ${f.format}` : ''} — {f.error}
                </div>
                {f.format && (
                  <button className="btn ghost sm" onClick={() => retryResult(f)}>↻ 재시도</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <GalleryFilters filter={filter} setFilter={setFilter} brands={brands} />

      {results.length === 0 ? (
        <p className="sub">아직 생성된 결과가 없습니다 — 생성 스튜디오에서 광고를 생성해보세요.</p>
      ) : (
        <div className="grid">
          {visible.map((r) => <ResultCard key={r.id} result={r} />)}
        </div>
      )}
    </section>
  )
}
