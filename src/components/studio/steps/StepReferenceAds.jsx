import { useState } from 'react'
import { useAds } from '../../../context/AdsContext.jsx'
import { useStudio } from '../../../context/StudioContext.jsx'
import Thumb from '../../common/Thumb.jsx'
import Badge from '../../common/Badge.jsx'
import AdDetailModal from '../../feed/AdDetailModal.jsx'

export default function StepReferenceAds() {
  const { ads } = useAds()
  const { refBrand, refAdIds, toggleRefAd } = useStudio()
  const [detailAd, setDetailAd] = useState(null)
  const list = ads.filter((a) => a.brand === refBrand)

  const openDetail = (e, ad) => {
    e.stopPropagation()
    setDetailAd(ad)
  }

  return (
    <>
      <div className="sect">
        <span>{refBrand}</span> 광고소재 선택{' '}
        <span className="hint">— 여러 개 다중선택 가능 · 이미지가 아닌 레이아웃·컬러·카피 구조만 분석에 사용</span>
      </div>

      {list.length === 0 ? (
        <p className="sub">
          "{refBrand}"에 아카이브된 광고 소재가 없습니다. 경쟁사 광고 피드에서 먼저 수집해주세요.
        </p>
      ) : (
        <div className="refrow">
          {list.map((ad) => {
            const copyText = (ad.raw?.['Post Content'] || ad.title || '').replace(/\n/g, ' ')
            return (
              <div
                key={ad.id}
                className={`refpick ${refAdIds.includes(ad.id) ? 'on' : ''}`}
                onClick={() => toggleRefAd(ad.id)}
              >
                <Thumb gradient={ad.gradient} image={ad.image}>
                  <Badge variant={ad.live ? 'live' : 'arch'} className="state">
                    {ad.live ? '게재중' : '아카이브'}
                  </Badge>
                  <Badge variant="media">
                    {ad.media === 'video' ? '🎬 동영상' : '🖼 이미지'}
                  </Badge>
                </Thumb>
                <div className="refpick-body">
                  {copyText && <div className="refpick-copy">{copyText}</div>}
                  <div className="refpick-foot">
                    <span>AD {String(ad.id).slice(-4)}</span>
                    <button className="refpick-detail" onClick={(e) => openDetail(e, ad)}>상세보기</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {detailAd && <AdDetailModal ad={detailAd} onClose={() => setDetailAd(null)} />}
    </>
  )
}
