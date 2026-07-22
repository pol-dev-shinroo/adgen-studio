import { useGallery } from '../../context/GalleryContext.jsx'

const STATUS_LABEL = { done: '완료', run: '생성중', fail: '실패' }
const STATUS_BADGE = { done: 'live', run: 'run', fail: 'fail' }

export default function ResultCard({ result }) {
  const { approveResult, retryResult } = useGallery()

  return (
    <div className="card res">
      <div className={`thumb ${result.gradient}`}>
        <span className={`badge ${STATUS_BADGE[result.status]}`}>{STATUS_LABEL[result.status]}</span>
        {result.title}
      </div>
      <div className="body">
        <div className="meta" style={{ color: 'var(--sub)', fontSize: 12 }}>{result.desc}</div>
        {result.status === 'run' ? (
          <div className="prog"><i style={{ width: `${result.progress ?? 64}%` }} /></div>
        ) : (
          <div className="acts">
            {result.status === 'done' ? (
              <>
                <button className="btn ghost sm">⬇ 다운로드</button>
                <button className="btn ghost sm">🔀 비교</button>
                <button className="btn pri sm" onClick={() => approveResult(result.id)}>
                  {result.approved ? '✔ 승인됨' : '✔ 승인'}
                </button>
              </>
            ) : (
              <button className="btn pri sm" onClick={() => retryResult(result.id)}>↻ 재시도</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
