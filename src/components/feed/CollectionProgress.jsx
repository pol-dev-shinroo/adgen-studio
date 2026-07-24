import RetryImage from '../common/RetryImage.jsx'
import { toEmbeddableImageUrl } from '../../api/adaptAd.js'

const STATUS_CHIP = {
  processing: { label: '처리 중', cls: 'processing' },
  new: { label: '신규', cls: 'new' },
  updated: { label: '업데이트', cls: 'updated' },
  unchanged: { label: '변경없음', cls: 'unchanged' },
}

function StatusChip({ status }) {
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.processing
  return <span className={`progress-chip ${chip.cls}`}>{chip.label}</span>
}

function phaseLabel(progress) {
  const { phase, currentKeyword, adsProcessed, totalAdsFound } = progress
  if (phase === 'scraping') return `"${currentKeyword}" 메타 광고 검색 중... (몇 분 정도 걸릴 수 있어요)`
  if (phase === 'archiving') return `이미지 저장 중 (${adsProcessed}/${totalAdsFound})`
  if (phase === 'saving') return '저장 중...'
  return '처리 중...'
}

export default function CollectionProgress({ job }) {
  const progress = job?.progress ?? {}
  const { phase, totalAdsFound, adsProcessed, recentItems = [] } = progress

  // Only "archiving" has a known total to compute a real percentage against
  // — "scraping" has no way to know how many ads Apify will return until it
  // returns, and "saving" is a short, roughly-fixed-cost Sheets write.
  const percent = phase === 'archiving' && totalAdsFound > 0
    ? Math.min(100, Math.round((adsProcessed / totalAdsFound) * 100))
    : null

  return (
    <div className="collect-progress">
      <div className="cp-label">{phaseLabel(progress)}</div>
      <div className={`cp-bar${percent === null ? ' indeterminate' : ''}`}>
        {percent !== null && <div className="cp-bar-fill" style={{ width: `${percent}%` }} />}
      </div>

      {recentItems.length > 0 && (
        <div className="cp-list">
          {recentItems.map((item) => (
            <div key={item.adArchiveId} className="cp-item">
              {item.thumbnail ? (
                <RetryImage
                  src={toEmbeddableImageUrl(item.thumbnail)}
                  alt=""
                  className="cp-item-thumb"
                  fallback={<div className="cp-item-thumb cp-item-placeholder" />}
                />
              ) : (
                <div className="cp-item-thumb cp-item-placeholder" />
              )}
              <div className="cp-item-body">
                <div className="cp-item-brand">{item.brand}</div>
                <div className="cp-item-snippet">{item.snippet}</div>
              </div>
              <StatusChip status={item.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
