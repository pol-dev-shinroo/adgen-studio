import JobProgress from '../../common/JobProgress.jsx'

const STATUS_LABEL = {
  synced: { label: '완료', cls: 'synced' },
  failed: { label: '실패', cls: 'failed' },
}

function phaseLabel(progress) {
  const { phase, productsProcessed, totalProducts } = progress
  if (phase === 'fetching') return '자사몰에서 제품 목록을 불러오는 중...'
  if (phase === 'analyzing') return `AI 분석 중 (${productsProcessed}/${totalProducts})`
  if (phase === 'saving') return '시트에 저장 중...'
  if (phase === 'cleaning up') return '정리 중...'
  return '처리 중...'
}

// Only "analyzing" has a known total to compute a real percentage against —
// the initial fetch has no count until it returns, and saving/cleanup are
// short, roughly-fixed-cost steps.
function percent(progress) {
  const { phase, totalProducts, productsProcessed } = progress
  return phase === 'analyzing' && totalProducts > 0
    ? Math.min(100, Math.round((productsProcessed / totalProducts) * 100))
    : null
}

function renderItem(item, i) {
  const chip = STATUS_LABEL[item.status] ?? { label: '처리 중', cls: 'processing' }
  return (
    <div key={`${item.productId}-${i}`} className="job-progress-item">
      <div className="job-progress-item-name">{item.productName}</div>
      <span className={`job-progress-chip ${chip.cls}`}>{chip.label}</span>
    </div>
  )
}

export default function SyncProgress({ job }) {
  return <JobProgress job={job} phaseLabel={phaseLabel} percent={percent} renderItem={renderItem} />
}
