import Modal from '../common/Modal.jsx'
import ImageLightbox from '../common/ImageLightbox.jsx'
import RetryImage from '../common/RetryImage.jsx'
import DetailField from '../common/DetailField.jsx'
import { formatDateTime } from '../../utils/date.js'
import { useGalleryLightbox } from '../../hooks/useGalleryLightbox.js'

// Structured like AdDetailModal.jsx (same "ad-detail"/"dtl-*" classes, from
// feed.css — imported alongside products.css in ProductsScreen.jsx — and
// the same ImageLightbox reused as-is, not duplicated): image gallery grid,
// then 기본 정보 and AI 분석 sections.
export default function ProductDetailModal({ product, onClose }) {
  const { lightboxIndex, setLightboxIndex, closeModal } = useGalleryLightbox(onClose)
  if (!product) return null

  return (
    <Modal onClose={closeModal}>
      <div className="ad-detail">
        <button className="modal-close" onClick={closeModal} aria-label="닫기">✕</button>

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
            <DetailField label="브랜드" value={product.brand} />
            <DetailField label="마지막 동기화" value={formatDateTime(product.lastSynced)} />
          </div>
        </div>

        <div className="dtl-section">
          <div className="dtl-sect-title">AI 분석</div>
          <DetailField label="프로모션" value={product.promotionInfo} emphasized />
          <DetailField label="광고 후킹 카피" value={product.adHookCopy} emphasized />
          <DetailField label="제품특성" value={product.productFeatures} />
          <DetailField label="효과효능" value={product.benefits} />
          <DetailField label="페인포인트" value={product.painPoints} />
          <DetailField label="권위/신뢰/인증" value={product.authorityTrust} />
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
