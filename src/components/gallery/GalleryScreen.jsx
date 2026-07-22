import { useState } from 'react'
import '../../styles/gallery.css'
import GalleryFilters from './GalleryFilters.jsx'
import ResultCard from './ResultCard.jsx'
import { useGallery } from '../../context/GalleryContext.jsx'

export default function GalleryScreen() {
  const { results } = useGallery()
  const [filter, setFilter] = useState('전체')

  const brands = [...new Set(results.map((r) => r.title.split(' ')[0]))]
  const visible = results.filter((r) => {
    if (filter === '전체') return true
    if (filter === '승인됨') return !!r.approved
    return r.title.startsWith(filter)
  })

  return (
    <section>
      <div className="head">
        <div>
          <h1>결과 갤러리</h1>
          <p className="sub">생성된 광고 이미지 · 브랜드별 필터</p>
        </div>
      </div>
      <GalleryFilters filter={filter} setFilter={setFilter} brands={brands} />
      <div className="grid">
        {visible.map((r) => <ResultCard key={r.id} result={r} />)}
      </div>
    </section>
  )
}
