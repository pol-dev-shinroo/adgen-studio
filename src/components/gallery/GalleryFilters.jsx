import Chip from '../common/Chip.jsx'

// Part DD: `label` and `hideApproved` let GalleryScreen reuse this same
// component for the new "참고한 경쟁사" (reference/competitor brand) filter
// row, alongside the existing "우리 브랜드" row — the two are independent
// filter dimensions (AND-combined), so keeping them visually distinct (a
// small label prefix) matters so users don't mistake one for the other.
// hideApproved: the 승인됨 chip only makes sense for the main brand/status
// filter, not the ref-brand one, which has no notion of "approved."
export default function GalleryFilters({ filter, setFilter, brands, label, hideApproved = false }) {
  return (
    <div className="filters">
      {label && <span className="filters-label">{label}</span>}
      <Chip active={filter === '전체'} onClick={() => setFilter('전체')}>전체</Chip>
      {brands.map((b) => (
        <Chip key={b} active={filter === b} onClick={() => setFilter(b)}>{b}</Chip>
      ))}
      {!hideApproved && <Chip active={filter === '승인됨'} onClick={() => setFilter('승인됨')}>✔ 승인됨</Chip>}
    </div>
  )
}
