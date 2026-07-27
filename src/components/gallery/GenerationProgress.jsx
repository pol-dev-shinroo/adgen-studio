// Generation-job progress panel, shown at the top of the Gallery while a
// job is running. Mirrors studio/steps/SyncProgress.jsx's shape (phase
// label + bar + recent-items list) via studio.css's .sync-* classes,
// reused directly rather than duplicated — this is one bundled SPA, so its
// CSS is already global regardless of which screen's JS imports the file
// (same reuse already established for .prod-card in Step 3).

function phaseLabel(progress) {
  const { phase, rendersDone, totalRenders } = progress
  if (phase === 'analyzing') return '레퍼런스 광고 분석 중...'
  if (phase === 'researching') return '우리 브랜드 데이터 조사 중...'
  if (phase === 'writing') return '카피 작성 중...'
  if (typeof phase === 'string' && phase.startsWith('rendering')) {
    return `이미지 생성 중 (${rendersDone}/${totalRenders})`
  }
  if (phase === 'saving') return '저장 중...'
  if (phase === 'done') return '완료'
  return '처리 중...'
}

export default function GenerationProgress({ job, onRetry }) {
  const progress = job?.progress ?? {}
  const { rendersDone, totalRenders, recentItems = [] } = progress

  // Only the rendering phase has a known total to compute a real percentage
  // against — analyzing/researching/writing run once per reference ad
  // before any render count is meaningful yet.
  const percent = typeof progress.phase === 'string' && progress.phase.startsWith('rendering') && totalRenders > 0
    ? Math.min(100, Math.round((rendersDone / totalRenders) * 100))
    : null

  return (
    <div className="sync-progress">
      <div className="sync-label">{phaseLabel(progress)}</div>
      <div className={`sync-bar${percent === null ? ' indeterminate' : ''}`}>
        {percent !== null && <div className="sync-bar-fill" style={{ width: `${percent}%` }} />}
      </div>

      {recentItems.length > 0 && (
        <div className="sync-list">
          {recentItems.map((item, i) => (
            <div key={`${item.adId}-${item.format}-${i}`} className="sync-item">
              <div className="sync-item-name">AD {item.adId} · {item.format}{item.productId ? ` · 제품 ${item.productId}` : ''}</div>
              {item.status === 'failed' ? (
                <button className="btn ghost sm" onClick={() => onRetry(item)}>↻ 재시도</button>
              ) : (
                <span className="sync-chip synced">완료</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
