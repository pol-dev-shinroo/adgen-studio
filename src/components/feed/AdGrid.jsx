import { useAds } from '../../context/AdsContext.jsx'
import PageLoader from '../common/PageLoader.jsx'
import AdCard from './AdCard.jsx'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export default function AdGrid({ onOpenDetail }) {
  const { ads, brandFilter, mediaFilter, recentOnly, adsLoading } = useAds()

  const cutoff = Date.now() - SEVEN_DAYS_MS
  const list = ads.filter((ad) => {
    if (brandFilter !== '전체' && ad.brand !== brandFilter) return false
    if (mediaFilter !== 'all' && ad.media !== mediaFilter) return false
    if (recentOnly) {
      const scrapedAt = new Date(ad.raw?.['Date Scraped'] ?? '').getTime()
      if (!(scrapedAt >= cutoff)) return false
    }
    return true
  })

  if (adsLoading && list.length === 0) return <PageLoader />

  // Part W: every other list screen in this app (ProductBrowser, Gallery,
  // StepReferenceAds) handles "no results" explicitly with a distinct
  // message per cause — this one only handled the loading case, silently
  // rendering a blank grid for a genuinely empty archive or a filter
  // combination matching nothing.
  if (ads.length === 0) {
    return <p className="sub">아직 수집된 광고가 없습니다 — 위에서 브랜드명 또는 AD ID를 검색해 실시간 수집을 시작하세요.</p>
  }
  if (list.length === 0) {
    return <p className="sub">현재 필터 조건에 맞는 광고가 없습니다.</p>
  }

  return (
    <div className="grid">
      {list.map((ad) => (
        <AdCard key={ad.id} ad={ad} onOpenDetail={onOpenDetail} />
      ))}
    </div>
  )
}
