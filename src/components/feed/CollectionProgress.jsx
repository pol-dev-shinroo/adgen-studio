import JobProgress from '../common/JobProgress.jsx'
import RetryImage from '../common/RetryImage.jsx'
import { toEmbeddableImageUrl } from '../../api/adaptAd.js'

const STATUS_CHIP = {
  processing: { label: '처리 중', cls: 'processing' },
  new: { label: '신규', cls: 'new' },
  updated: { label: '업데이트', cls: 'updated' },
  unchanged: { label: '변경없음', cls: 'unchanged' },
}

function phaseLabel(progress) {
  const { phase, currentKeyword, adsProcessed, totalAdsFound } = progress
  if (phase === 'scraping') return `"${currentKeyword}" 메타 광고 검색 중... (몇 분 정도 걸릴 수 있어요)`
  if (phase === 'archiving') return `이미지 저장 중 (${adsProcessed}/${totalAdsFound})`
  if (phase === 'saving') return '저장 중...'
  return '처리 중...'
}

// Only "archiving" has a known total to compute a real percentage against —
// "scraping" has no way to know how many ads Apify will return until it
// returns, and "saving" is a short, roughly-fixed-cost Sheets write.
function percent(progress) {
  const { phase, totalAdsFound, adsProcessed } = progress
  return phase === 'archiving' && totalAdsFound > 0
    ? Math.min(100, Math.round((adsProcessed / totalAdsFound) * 100))
    : null
}

function renderItem(item) {
  const chip = STATUS_CHIP[item.status] ?? STATUS_CHIP.processing
  return (
    <div key={item.adArchiveId} className="job-progress-item">
      {item.thumbnail ? (
        <RetryImage
          src={toEmbeddableImageUrl(item.thumbnail, 'w300')}
          alt=""
          className="job-progress-item-thumb"
          fallback={<div className="job-progress-item-thumb job-progress-item-placeholder" />}
        />
      ) : (
        <div className="job-progress-item-thumb job-progress-item-placeholder" />
      )}
      <div className="job-progress-item-body">
        <div className="job-progress-item-brand">{item.brand}</div>
        <div className="job-progress-item-snippet">{item.snippet}</div>
      </div>
      <span className={`job-progress-chip ${chip.cls}`}>{chip.label}</span>
    </div>
  )
}

export default function CollectionProgress({ job }) {
  return (
    <JobProgress job={job} variant="collect" phaseLabel={phaseLabel} percent={percent} renderItem={renderItem} />
  )
}
