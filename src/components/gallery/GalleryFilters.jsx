import Chip from '../common/Chip.jsx'

export default function GalleryFilters({ filter, setFilter, brands }) {
  return (
    <div className="filters">
      <Chip active={filter === '전체'} onClick={() => setFilter('전체')}>전체</Chip>
      {brands.map((b) => (
        <Chip key={b} active={filter === b} onClick={() => setFilter(b)}>{b}</Chip>
      ))}
      <Chip active={filter === '승인됨'} onClick={() => setFilter('승인됨')}>✔ 승인됨</Chip>
    </div>
  )
}
