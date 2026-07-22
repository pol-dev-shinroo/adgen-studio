import { useAds } from '../../context/AdsContext.jsx'
import AdCard from './AdCard.jsx'

export default function AdGrid() {
  const { ads, brandFilter } = useAds()
  const list = brandFilter === '전체' ? ads : ads.filter((a) => a.brand === brandFilter)
  return (
    <div className="grid">
      {list.map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  )
}
