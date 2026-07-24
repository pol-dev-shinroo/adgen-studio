import Thumb from '../common/Thumb.jsx'
import Badge from '../common/Badge.jsx'
import { useAds } from '../../context/AdsContext.jsx'
import { useStudio } from '../../context/StudioContext.jsx'

export default function AdCard({ ad, note, onOpenDetail, selectable, selected, onToggleSelect }) {
  const { renameBrand } = useAds()
  const { prefillFromAd } = useStudio()

  const handleRename = (e) => {
    e.stopPropagation()
    const next = window.prompt(
      `이 광고의 브랜드명(검색 키워드)을 수정합니다.\n(Drive 아카이브 폴더 및 피드 표시명에 반영)\n\n현재: ${ad.brand}`,
      ad.brand
    )
    if (next && next.trim()) renameBrand(ad.id, next.trim())
  }

  const handleGenerate = (e) => {
    e.stopPropagation()
    prefillFromAd(ad.brand, ad.id)
  }

  const handleCardClick = () => {
    if (selectable) {
      onToggleSelect?.(ad.id)
    } else {
      onOpenDetail?.(ad)
    }
  }

  const copyText = (ad.raw?.['Post Content'] || ad.title || '').replace(/\n/g, ' ')

  return (
    <div className={`card ad${selectable ? ' selectable' : ''}${selected ? ' selected' : ''}`} onClick={handleCardClick}>
      <Thumb gradient={ad.gradient} image={ad.image}>
        {selectable ? (
          <div
            className={`select-check${selected ? ' checked' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(ad.id) }}
          >
            {selected && '✓'}
          </div>
        ) : (
          <Badge variant={ad.live ? 'live' : 'arch'} className="state">
            {ad.live ? '게재중' : '아카이브'}
          </Badge>
        )}
        <Badge variant="media">
          {ad.media === 'video' ? '🎬 동영상' : '🖼 이미지'}
        </Badge>
      </Thumb>
      <div className="body">
        <div className="name">
          {ad.brand} {!selectable && <span className="edit" title="브랜드명 수정" onClick={handleRename}>✏️</span>}
        </div>
        {ad.pageName && ad.pageName !== ad.brand && (
          <div className="pagename">{ad.pageName}</div>
        )}
        {copyText && <div className="copy-line">{copyText}</div>}
        <div className="meta">AD ID {ad.id} · {ad.desc}</div>
        {note}
        {!selectable && (
          <button className="btn pri sm" onClick={handleGenerate}>
            ✨ 이 광고로 생성하기
          </button>
        )}
      </div>
    </div>
  )
}
