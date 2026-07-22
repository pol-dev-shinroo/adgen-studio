import { useAds } from '../../../context/AdsContext.jsx'
import { useStudio } from '../../../context/StudioContext.jsx'
import { brandColors } from '../../../data/initialAds.js'

export default function StepReferenceBrand() {
  const { ads, brands } = useAds()
  const { refBrand, pickRefBrand } = useStudio()

  return (
    <>
      <div className="sect">레퍼런스 브랜드 선택 <span className="hint">— 아카이브된 경쟁사 중 1개 선택</span></div>
      <div>
        {brands.map((b) => {
          const count = ads.filter((a) => a.brand === b).length
          return (
            <div key={b} className={`rbrand ${refBrand === b ? 'on' : ''}`} onClick={() => pickRefBrand(b)}>
              <div className="dot" style={{ background: brandColors[b] || '#5b5bd6' }}>{b[0]}</div>
              <div>
                <div className="nm">{b}</div>
                <div className="ds">아카이브 소재 {count}개</div>
              </div>
              <div className="radio" />
            </div>
          )
        })}
      </div>
    </>
  )
}
