import { useAds } from '../../context/AdsContext.jsx'
import Chip from '../common/Chip.jsx'

export default function BrandFilterBar() {
  const { brands, brandFilter, setBrandFilter, mediaFilter, toggleMediaFilter, recentOnly, toggleRecentOnly } = useAds()
  return (
    <div className="filters">
      <Chip active={brandFilter === '전체'} onClick={() => setBrandFilter('전체')}>전체</Chip>
      {brands.map((b) => (
        <Chip key={b} active={brandFilter === b} onClick={() => setBrandFilter(b)}>{b}</Chip>
      ))}
      <Chip active={mediaFilter === 'image'} onClick={() => toggleMediaFilter('image')}>🖼 이미지</Chip>
      <Chip active={mediaFilter === 'video'} onClick={() => toggleMediaFilter('video')}>🎬 동영상</Chip>
      <Chip active={recentOnly} onClick={toggleRecentOnly}>🗓 최근 7일</Chip>
    </div>
  )
}
