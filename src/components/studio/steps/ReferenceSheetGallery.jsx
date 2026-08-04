import { useState, useRef, useEffect } from 'react'
import { formatDateTime } from '../../../utils/date.js'
import ImageLightbox from '../../common/ImageLightbox.jsx'

// Part O: one composed reference sheet per checked+extracted ad (Part N's
// design — never a per-entity array), so this is genuinely "one card per
// source ad." A horizontally-scrolling filmstrip rather than a plain grid
// per the client's own request for "the most creative and effective
// UI/UX" here specifically — each card pairs the reference sheet with a
// small "출처" (source) footer identifying exactly which ad it came from
// (mini thumbnail + AD ID + copy snippet), so the connection stays obvious
// even once several are selected side by side. Selection here is separate
// state from the ad-list checkboxes above (see StudioContext) and doesn't
// feed generation yet — out of scope for this part, just captured.
export default function ReferenceSheetGallery({ sheetAds, selectedSheetAdIds, onToggle, onToggleAll }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const allSelected = sheetAds.length > 0 && sheetAds.every((a) => selectedSheetAdIds.includes(a.id))
  const someSelected = selectedSheetAdIds.length > 0 && !allSelected
  const selectAllRef = useRef(null)
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  const lightboxImages = sheetAds.map((a) => a.extractedReference?.imageUrl).filter(Boolean)

  return (
    <div className="sheet-gallery">
      <div className="sheet-gallery-head">
        <div className="sect" style={{ marginBottom: 0 }}>
          참조 이미지 시트 <span className="hint">— 광고별로 추출된 참조 이미지 모음, 사용할 시트를 선택하세요</span>
        </div>
        <label className="ad-sel-allrow" style={{ marginBottom: 0 }}>
          <input type="checkbox" ref={selectAllRef} checked={allSelected} onChange={onToggleAll} />
          전체 선택 <span className="count">{selectedSheetAdIds.length}/{sheetAds.length}개 선택됨</span>
        </label>
      </div>

      <div className="sheet-gallery-row">
        {sheetAds.map((ad, i) => {
          const isSelected = selectedSheetAdIds.includes(ad.id)
          const copyText = (ad.raw?.['Post Content'] || ad.title || '').replace(/\n/g, ' ')
          return (
            <div key={ad.id} className={`sheet-card ${isSelected ? 'selected' : ''}`}>
              <input
                type="checkbox"
                className="sheet-card-check"
                checked={isSelected}
                onChange={() => onToggle(ad.id)}
              />
              <div className="sheet-card-img" onClick={() => setLightboxIndex(i)}>
                <img src={ad.extractedReference.imageUrl} alt="" />
              </div>
              <div className="sheet-card-source">
                <img className="sheet-card-source-thumb" src={ad.image} alt="" />
                <div className="sheet-card-source-text">
                  <div className="sheet-card-source-id">출처: AD {String(ad.id).slice(-4)} · {formatDateTime(ad.extractedReference.extractedAt, { dateStyle: 'medium', fallback: '' })}</div>
                  {copyText && <div className="sheet-card-source-copy">{copyText}</div>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
