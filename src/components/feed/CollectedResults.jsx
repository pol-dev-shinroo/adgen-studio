import { useAds } from '../../context/AdsContext.jsx'
import AdCard from './AdCard.jsx'

export default function CollectedResults({ onOpenDetail }) {
  const { collected, lastQuery } = useAds()

  if (!collected.length) {
    return (
      <p className="sub" style={{ marginBottom: 14 }}>
        아직 수집 결과가 없습니다. 위에서 검색해 실시간 수집을 실행하세요.
      </p>
    )
  }

  const freshCount = collected.filter((a) => !a.isDup).length
  const dupCount = collected.filter((a) => a.isDup).length

  return (
    <div>
      <p className="sub" style={{ marginBottom: 14 }}>
        "{lastQuery}" 수집 완료 — 신규 {freshCount}건 아카이빙, 중복 {dupCount}건 (저장 생략)
      </p>
      <div className="grid">
        {collected.map((ad, i) => (
          <AdCard
            key={`${ad.id}-${i}`}
            ad={ad}
            onOpenDetail={onOpenDetail}
            note={
              ad.isDup ? (
                <div className="dupnote">🗂 이미 아카이빙된 광고 — 중복 저장하지 않음</div>
              ) : (
                <div className="dupnote" style={{ background: '#e9e9fb', color: 'var(--brand)', borderColor: '#c9c9f0' }}>
                  ✦ 신규 아카이빙됨
                </div>
              )
            }
          />
        ))}
      </div>
    </div>
  )
}
