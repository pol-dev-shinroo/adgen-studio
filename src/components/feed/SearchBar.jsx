import { useState } from 'react'
import { useAds } from '../../context/AdsContext.jsx'

const MIN_LIMIT = 10
const MAX_LIMIT = 200 // hard ceiling — matches the backend's own cap (sync Apify call, timeout risk above this)
const DEFAULT_LIMIT = 50
const STEP = 10

export default function SearchBar() {
  const { collect, activeJob } = useAds()
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const isRunning = Boolean(activeJob)

  // Guarding here (not just via the button's disabled attribute) covers the
  // Enter-key path too, so a double-click or a stray Enter can't fire a
  // second overlapping collection job.
  const handleCollect = () => {
    if (isRunning) return
    collect(query, limit)
  }

  return (
    <div className="searchbar-wrap">
      <div className="searchbar">
        <input
          placeholder="브랜드명 또는 AD ID(숫자) 입력 — 예: 뉴트리원 또는 102938475601"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCollect() }}
        />
        <button className="btn pri" onClick={handleCollect} disabled={isRunning}>
          {isRunning && <span className="collect-dot" />}
          🔍 실시간 수집
        </button>
      </div>
      <div className="collect-limit">
        <span className="collect-limit-label">최대 {limit}개 수집</span>
        <input
          type="range"
          min={MIN_LIMIT}
          max={MAX_LIMIT}
          step={STEP}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        />
      </div>
    </div>
  )
}
