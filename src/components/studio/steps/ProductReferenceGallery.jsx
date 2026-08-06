import { useState, useRef, useEffect } from 'react'
import { formatDateTime } from '../../../utils/date.js'
import Badge from '../../common/Badge.jsx'
import ImageLightbox from '../../common/ImageLightbox.jsx'

// Part S: repurposed from Part O's ReferenceSheetGallery (which sourced
// composed reference sheets from our own scraped ads — since replaced
// entirely, see StudioContext.jsx). Same UI pattern (filmstrip cards, each
// thumbnail opens ImageLightbox, its own checkbox, a small "which source
// did this come from" footer, an overall 전체 선택) — this time sourced
// from the selected products' own Part M extractedReferences[] instead.
// Each item is one { key, productName, product, ref } entry (see
// StudioContext.jsx's productRefSelections derivation for how `key` is
// built) — the footer now names the PRODUCT it came from (small product
// photo + name) rather than a source ad, and the thumbnail carries a
// product/model type badge (same convention ReferenceImagesScreen.jsx's
// card grid already uses).
//
// Part T: an item can now be a "text" entry (ref.text set, ref.imageUrl
// absent — a transcribed headline/subheadline/promo phrase, no cropped
// image asset behind it) alongside the existing "visual" entries (ref.
// imageUrl set). A text entry renders as a plain text card — no checkbox,
// no thumbnail/lightbox, since there's no image to select or click into,
// and wiring text entries into generation is explicitly a later part's
// job (see StudioContext.jsx). Every count/전체선택/lightbox computation
// below is scoped to the selectable (visual) subset only, so a text entry
// never counts against "선택됨" and can never end up silently marked
// selected by 전체 선택.
export default function ProductReferenceGallery({ items, selectedKeys, onToggle, onToggleAll }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const selectableItems = items.filter((item) => item.ref.imageUrl)
  const allSelected = selectableItems.length > 0 && selectableItems.every((item) => selectedKeys.includes(item.key))
  const someSelected = selectedKeys.length > 0 && !allSelected
  const selectAllRef = useRef(null)
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  const lightboxImages = selectableItems.map((item) => item.ref.imageUrl)

  return (
    <div className="sheet-gallery">
      <div className="sheet-gallery-head">
        <div className="sect" style={{ marginBottom: 0 }}>
          참조 이미지 갤러리 <span className="hint">— 선택한 제품에서 추출된 참조 이미지, 생성에 쓸 이미지를 선택하세요</span>
        </div>
        <label className="ad-sel-allrow" style={{ marginBottom: 0 }}>
          <input type="checkbox" ref={selectAllRef} checked={allSelected} onChange={onToggleAll} />
          전체 선택 <span className="count">{selectedKeys.length}/{selectableItems.length}개 선택됨</span>
        </label>
      </div>

      <div className="sheet-gallery-row">
        {items.map((item) => {
          const { ref, product, productName } = item
          const isVisual = !!ref.imageUrl
          const isSelected = isVisual && selectedKeys.includes(item.key)

          return (
            <div key={item.key} className={`sheet-card ${isSelected ? 'selected' : ''}`}>
              {isVisual ? (
                <>
                  <input
                    type="checkbox"
                    className="sheet-card-check"
                    checked={isSelected}
                    onChange={() => onToggle(item.key)}
                  />
                  <div className="sheet-card-img" onClick={() => setLightboxIndex(lightboxImages.indexOf(ref.imageUrl))}>
                    <img src={ref.imageUrl} alt="" />
                    <Badge variant={ref.type === 'model' ? 'model' : 'live'} className="sheet-card-type">
                      {ref.type === 'model' ? '모델' : (ref.label || '제품')}
                    </Badge>
                  </div>
                </>
              ) : (
                <div className="sheet-card-text">
                  <Badge variant="text" className="sheet-card-text-badge">{ref.label || '텍스트'}</Badge>
                  <div className="sheet-card-text-body">{ref.text}</div>
                </div>
              )}
              <div className="sheet-card-source">
                <img className="sheet-card-source-thumb" src={product.imageUrl} alt="" />
                <div className="sheet-card-source-text">
                  <div className="sheet-card-source-id">출처: {productName}</div>
                  <div className="sheet-card-source-copy">
                    추출일: {formatDateTime(ref.extractedAt, { dateStyle: 'medium', fallback: '-' })}
                  </div>
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
