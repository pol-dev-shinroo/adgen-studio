// Product-sync progress panel, shown inline under a brand's config card
// while a sync job is running. Mirrors feed/CollectionProgress.jsx's shape
// (phase label + bar + recent-items list) via studio.css's .sync-* classes,
// a scoped variant of feed.css's .cp-* classes rather than a cross-import.

const STATUS_LABEL = {
  synced: { label: '완료', cls: 'synced' },
  failed: { label: '실패', cls: 'failed' },
}

function SyncStatusChip({ status }) {
  const chip = STATUS_LABEL[status] ?? { label: '처리 중', cls: 'processing' }
  return <span className={`sync-chip ${chip.cls}`}>{chip.label}</span>
}

function phaseLabel(progress) {
  const { phase, productsProcessed, totalProducts } = progress
  if (phase === 'fetching') return '자사몰에서 제품 목록을 불러오는 중...'
  if (phase === 'analyzing') return `AI 분석 중 (${productsProcessed}/${totalProducts})`
  if (phase === 'saving') return '시트에 저장 중...'
  if (phase === 'cleaning up') return '정리 중...'
  return '처리 중...'
}

export default function SyncProgress({ job }) {
  const progress = job?.progress ?? {}
  const { phase, totalProducts, productsProcessed, recentItems = [] } = progress

  // Only "analyzing" has a known total to compute a real percentage against
  // — the initial fetch has no count until it returns, and saving/cleanup
  // are short, roughly-fixed-cost steps.
  const percent = phase === 'analyzing' && totalProducts > 0
    ? Math.min(100, Math.round((productsProcessed / totalProducts) * 100))
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
            <div key={`${item.productId}-${i}`} className="sync-item">
              <div className="sync-item-name">{item.productName}</div>
              <SyncStatusChip status={item.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
