import { useAds } from '../../context/AdsContext.jsx'
import Chip from '../common/Chip.jsx'

export default function BrandFilterBar() {
  const { brands, brandFilter, setBrandFilter } = useAds()
  return (
    <div className="filters">
      <Chip active={brandFilter === '전체'} onClick={() => setBrandFilter('전체')}>전체</Chip>
      {brands.map((b) => (
        <Chip key={b} active={brandFilter === b} onClick={() => setBrandFilter(b)}>{b}</Chip>
      ))}
      <Chip>🖼 이미지</Chip>
      <Chip>🎬 동영상</Chip>
      <Chip>🗓 최근 7일</Chip>
    </div>
  )
}
