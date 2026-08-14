import { useState } from 'react'
import { LayoutGroup, motion } from 'framer-motion'
import { useAds } from '../../../context/AdsContext.jsx'
import { useStudio } from '../../../context/StudioContext.jsx'
import Thumb from '../../common/Thumb.jsx'
import Badge from '../../common/Badge.jsx'
import AdDetailModal from '../../feed/AdDetailModal.jsx'

// Part DD: shared spring config for every animated card move — snappy
// (high stiffness/damping) rather than the framer-motion default, which
// reads as sluggish for a reflow this frequent (every single toggle).
const CARD_TRANSITION = { type: 'spring', stiffness: 500, damping: 35 }

export default function StepReferenceAds() {
  const { ads } = useAds()
  const { refBrand, refAdIds, toggleRefAd } = useStudio()
  const [detailAd, setDetailAd] = useState(null)
  const list = ads.filter((a) => a.brand === refBrand)

  // Part DD: split into "선택됨"/"선택 가능" sections — refAdIds order is
  // preserved for the selected section (the order the user actually picked
  // them in), rather than falling back to the list's own scrape order.
  const selected = refAdIds.map((id) => list.find((a) => a.id === id)).filter(Boolean)
  const unselected = list.filter((a) => !refAdIds.includes(a.id))

  const openDetail = (e, ad) => {
    e.stopPropagation()
    setDetailAd(ad)
  }

  const renderCard = (ad, isSelected) => {
    const copyText = (ad.raw?.['Post Content'] || ad.title || '').replace(/\n/g, ' ')
    return (
      // `layout` alone gives FLIP-style animated repositioning when this
      // card's list membership/position changes (moving between the two
      // sections below) — no manual animation logic needed.
      <motion.div
        layout
        key={ad.id}
        transition={CARD_TRANSITION}
        className={`refpick ${isSelected ? 'on' : ''}`}
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
      </motion.div>
    )
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
        <LayoutGroup>
          {selected.length > 0 && (
            <>
              <div className="sub-sect">선택됨 ({selected.length})</div>
              <div className="refrow refrow-selected">
                {selected.map((ad) => renderCard(ad, true))}
              </div>
            </>
          )}
          <div className="sub-sect">선택 가능</div>
          <div className="refrow">
            {unselected.map((ad) => renderCard(ad, false))}
          </div>
        </LayoutGroup>
      )}

      {detailAd && <AdDetailModal ad={detailAd} onClose={() => setDetailAd(null)} />}
    </>
  )
}
