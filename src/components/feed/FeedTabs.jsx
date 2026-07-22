export default function FeedTabs({ tab, onChange, archiveCount, collectedCount }) {
  return (
    <div className="tabs">
      <button className={`tab ${tab === 'archive' ? 'on' : ''}`} onClick={() => onChange('archive')}>
        아카이브 <span className="cnt">{archiveCount}</span>
      </button>
      <button className={`tab ${tab === 'collected' ? 'on' : ''}`} onClick={() => onChange('collected')}>
        실시간 수집 결과 <span className="cnt">{collectedCount}</span>
      </button>
    </div>
  )
}
