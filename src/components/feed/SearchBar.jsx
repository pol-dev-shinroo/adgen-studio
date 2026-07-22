import { useState } from 'react'
import { useAds } from '../../context/AdsContext.jsx'

export default function SearchBar() {
  const { collect } = useAds()
  const [query, setQuery] = useState('')

  return (
    <div className="searchbar">
      <input
        placeholder="브랜드명 또는 AD ID(숫자) 입력 — 예: 뉴트리원 또는 102938475601"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') collect(query) }}
      />
      <button className="btn pri" onClick={() => collect(query)}>🔍 실시간 수집</button>
    </div>
  )
}
