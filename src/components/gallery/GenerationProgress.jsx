import JobProgress from '../common/JobProgress.jsx'

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

// Only the rendering phase has a known total to compute a real percentage
// against — analyzing/researching/writing run once per reference ad before
// any render count is meaningful yet.
function percent(progress) {
  const { rendersDone, totalRenders } = progress
  return typeof progress.phase === 'string' && progress.phase.startsWith('rendering') && totalRenders > 0
    ? Math.min(100, Math.round((rendersDone / totalRenders) * 100))
    : null
}

export default function GenerationProgress({ job, onRetry }) {
  const renderItem = (item, i) => (
    <div key={`${item.adId}-${item.format}-${i}`} className="job-progress-item">
      <div className="job-progress-item-name">
        AD {item.adId} · {item.format}{item.productId ? ` · 제품 ${item.productId}` : ''}
      </div>
      {item.status === 'failed' ? (
        <button className="btn ghost sm" onClick={() => onRetry(item)}>↻ 재시도</button>
      ) : (
        <span className="job-progress-chip synced">완료</span>
      )}
    </div>
  )

  return <JobProgress job={job} phaseLabel={phaseLabel} percent={percent} renderItem={renderItem} />
}
