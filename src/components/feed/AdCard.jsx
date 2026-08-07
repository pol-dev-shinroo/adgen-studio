import { useState } from 'react'
import Thumb from '../common/Thumb.jsx'
import Badge from '../common/Badge.jsx'
import { useAds } from '../../context/AdsContext.jsx'
import { useStudio } from '../../context/StudioContext.jsx'

export default function AdCard({ ad, note, onOpenDetail, selectable, selected, onToggleSelect }) {
  const { renameBrand } = useAds()
  const { prefillFromAd } = useStudio()
  // Part W: replaces window.prompt() — the one native browser dialog left
  // in an app that otherwise uses its own modal language everywhere else
  // (product field overrides, Pinecone reset confirmation) — with an
  // inline editable field, the smallest affordance that fits a single
  // short text value next to where it's already displayed.
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(ad.brand)

  const startRename = (e) => {
    e.stopPropagation()
    setDraftName(ad.brand)
    setEditingName(true)
  }

  const commitRename = () => {
    const next = draftName.trim()
    if (next && next !== ad.brand) renameBrand(ad.id, next)
    setEditingName(false)
  }

  const cancelRename = () => setEditingName(false)

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
          {editingName ? (
            <span className="name-edit" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') cancelRename()
                }}
              />
              <button type="button" className="name-edit-btn" onClick={commitRename} aria-label="저장">✓</button>
              <button type="button" className="name-edit-btn" onClick={cancelRename} aria-label="취소">✕</button>
            </span>
          ) : (
            <>
              {ad.brand}{' '}
              {!selectable && (
                <button type="button" className="edit" title="브랜드명 수정" onClick={startRename}>✏️</button>
              )}
            </>
          )}
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
