import { useAds } from '../../../context/AdsContext.jsx'
import { useStudio } from '../../../context/StudioContext.jsx'

export default function StepReferenceAds() {
  const { ads } = useAds()
  const { refBrand, refAdIds, toggleRefAd } = useStudio()
  const list = ads.filter((a) => a.brand === refBrand)

  return (
    <>
      <div className="sect">
        <span>{refBrand}</span> 광고소재 선택{' '}
        <span className="hint">— 여러 개 다중선택 가능 · 이미지가 아닌 레이아웃·컬러·카피 구조만 분석에 사용</span>
      </div>
      <div className="refrow">
        {list.map((ad) => (
          <div
            key={ad.id}
            className={`refpick ${refAdIds.includes(ad.id) ? 'on' : ''}`}
            onClick={() => toggleRefAd(ad.id)}
          >
            <div className={`thumb ${ad.gradient}`}>
              <span className="badge media">{ad.media === 'video' ? '🎬' : '🖼'}</span>
              {ad.title.split('\n')[0]}
            </div>
            <p>AD {String(ad.id).slice(-4)}</p>
          </div>
        ))}
      </div>
    </>
  )
}
