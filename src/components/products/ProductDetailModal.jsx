import { useState } from 'react'
import Modal from '../common/Modal.jsx'
import ImageLightbox from '../common/ImageLightbox.jsx'
import RetryImage from '../common/RetryImage.jsx'

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ko-KR')
}

function Field({ label, value, emphasized }) {
  if (!value) return null
  return (
    <div className={`dtl-field${emphasized ? ' emphasized' : ''}`}>
      <div className="dtl-label">{label}</div>
      <div className="dtl-value">{value}</div>
    </div>
  )
}

// Structured like AdDetailModal.jsx (same "ad-detail"/"dtl-*" classes, from
// feed.css — imported alongside products.css in ProductsScreen.jsx — and
// the same ImageLightbox reused as-is, not duplicated): image gallery grid,
// then 기본 정보 and AI 분석 sections.
export default function ProductDetailModal({ product, onClose }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  if (!product) return null

  // Same two-stage Escape/backdrop-click handling as AdDetailModal: while
  // the lightbox is open, the first close just closes that.
  const handleModalClose = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex(null)
    } else {
      onClose()
    }
  }

  return (
    <Modal onClose={handleModalClose}>
      <div className="ad-detail">
        <button className="modal-close" onClick={handleModalClose} aria-label="닫기">✕</button>

        <div className="dtl-gallery">
          {product.images.length > 0 ? (
            product.images.map((src, i) => (
              <RetryImage
                key={i}
                src={src}
                alt=""
                onClick={() => setLightboxIndex(i)}
                fallback={<div className="thumb g5" style={{ cursor: 'default' }} />}
              />
            ))
          ) : (
            <div className="thumb g5" />
          )}
        </div>

        <div className="dtl-section">
          <div className="dtl-sect-title">기본 정보</div>
          <div className="dtl-header">
            <h2>{product.name}</h2>
            <span className="badge new">{product.priceFormatted}</span>
          </div>
          <div className="dtl-grid">
            <Field label="브랜드" value={product.brand} />
            <Field label="마지막 동기화" value={formatDateTime(product.lastSynced)} />
          </div>
        </div>

        <div className="dtl-section">
          <div className="dtl-sect-title">AI 분석</div>
          <Field label="프로모션" value={product.promotionInfo} emphasized />
          <Field label="광고 후킹 카피" value={product.adHookCopy} emphasized />
          <Field label="제품특성" value={product.productFeatures} />
          <Field label="효과효능" value={product.benefits} />
          <Field label="페인포인트" value={product.painPoints} />
          <Field label="권위/신뢰/인증" value={product.authorityTrust} />
        </div>
      </div>
      {lightboxIndex !== null && (
        <ImageLightbox
          images={product.images}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </Modal>
  )
}
