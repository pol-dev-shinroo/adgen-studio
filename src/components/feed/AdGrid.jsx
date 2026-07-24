import { useAds } from '../../context/AdsContext.jsx'
import AdCard from './AdCard.jsx'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export default function AdGrid({ onOpenDetail }) {
  const { ads, brandFilter, mediaFilter, recentOnly } = useAds()

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

  return (
    <div className="grid">
      {list.map((ad) => (
        <AdCard key={ad.id} ad={ad} onOpenDetail={onOpenDetail} />
      ))}
    </div>
  )
}
