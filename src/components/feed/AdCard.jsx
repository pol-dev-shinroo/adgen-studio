import Thumb from '../common/Thumb.jsx'
import Badge from '../common/Badge.jsx'
import MultiLineText from '../common/MultiLineText.jsx'
import { useAds } from '../../context/AdsContext.jsx'
import { useStudio } from '../../context/StudioContext.jsx'

export default function AdCard({ ad, note }) {
  const { renameBrand } = useAds()
  const { prefillFromAd } = useStudio()

  const handleRename = () => {
    const next = window.prompt(
      `이 광고의 브랜드명을 수정합니다.\n(AD ID가 브랜드명과 다른 경우 실제 브랜드명으로 정리)\n\n현재: ${ad.brand}`,
      ad.brand
    )
    if (next && next.trim()) renameBrand(ad.id, next.trim())
  }

  return (
    <div className="card ad">
      <Thumb gradient={ad.gradient} image={ad.image}>
        <Badge variant={ad.live ? 'live' : 'arch'} className="state">
          {ad.live ? '게재중' : '아카이브'}
        </Badge>
        <Badge variant="media">
          {ad.media === 'video' ? '🎬 동영상' : '🖼 이미지'}
        </Badge>
        <MultiLineText text={ad.title} />
      </Thumb>
      <div className="body">
        <div className="name">
          {ad.brand} <span className="edit" title="브랜드명 수정" onClick={handleRename}>✏️</span>
        </div>
        <div className="meta">AD ID {ad.id} · {ad.desc}</div>
        {note}
        <button className="btn pri sm" onClick={() => prefillFromAd(ad.brand, ad.id)}>
          ✨ 이 광고로 생성하기
        </button>
      </div>
    </div>
  )
}
