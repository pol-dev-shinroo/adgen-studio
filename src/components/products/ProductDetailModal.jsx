import Modal from '../common/Modal.jsx'
import ImageLightbox from '../common/ImageLightbox.jsx'
import RetryImage from '../common/RetryImage.jsx'
import DetailField from '../common/DetailField.jsx'
import Thumb from '../common/Thumb.jsx'
import Badge from '../common/Badge.jsx'
import ScanningOverlay from '../common/ScanningOverlay.jsx'
import { formatDateTime } from '../../utils/date.js'
import { useGalleryLightbox } from '../../hooks/useGalleryLightbox.js'
import { useProducts } from '../../context/ProductsContext.jsx'

// Structured like AdDetailModal.jsx (same "ad-detail"/"dtl-*" classes, from
// feed.css — imported alongside products.css in ProductsScreen.jsx — and
// the same ImageLightbox reused as-is, not duplicated): image gallery grid,
// then 참조 이미지, 기본 정보, and AI 분석 sections.
export default function ProductDetailModal({ product, onClose }) {
  const { lightboxIndex, setLightboxIndex, closeModal } = useGalleryLightbox(onClose)
  const { brands, extractImage, extractingIds } = useProducts()
  if (!product) return null

  // product.brand is the Korean display name (from the sheet); the
  // extraction endpoint needs the internal brand key.
  const brandKey = brands.find((b) => b.name === product.brand)?.key
  const isExtracting = extractingIds.has(product.id)
  const handleExtract = () => brandKey && extractImage(brandKey, product.id)

  return (
    <Modal onClose={closeModal}>
      <div className="ad-detail">
        <button className="modal-close" onClick={closeModal} aria-label="닫기">✕</button>

        <div className="dtl-gallery">
          {product.images.length > 0 ? (
            product.images.map((src, i) => (
              // Only the first (primary) photo doubles as the "source
              // thumbnail" the ScanningOverlay scans while an extraction is
              // in flight — position:relative scoped to just this one item
              // rather than the whole gallery grid.
              <div key={i} style={{ position: 'relative' }}>
                <RetryImage
                  src={src}
                  alt=""
                  onClick={() => setLightboxIndex(i)}
                  fallback={<div className="thumb g5" style={{ cursor: 'default' }} />}
                />
                {i === 0 && <ScanningOverlay active={isExtracting} />}
              </div>
            ))
          ) : (
            <div className="thumb g5" />
          )}
        </div>

        <div className="dtl-section">
          <div className="dtl-sect-title">우리 제품 참조 이미지</div>
          {product.extractedReferences.length > 0 ? (
            <>
              {product.extractedReferences.map((ref, i) => (
                <div key={i} className="ref-preview" style={{ marginBottom: 10 }}>
                  <Thumb gradient="g5" image={ref.imageUrl} fit="contain" className="ref-thumb">
                    <Badge variant={ref.type === 'model' ? 'model' : 'live'}>
                      {ref.type === 'model' ? '모델' : (ref.label || '제품')}
                    </Badge>
                  </Thumb>
                  <div className="ref-meta">
                    <span className="sub">{ref.type === 'model' ? '모델' : (ref.label || '제품')} · 추출일: {formatDateTime(ref.extractedAt)}</span>
                  </div>
                </div>
              ))}
              <button className="btn ghost sm" disabled={isExtracting} onClick={handleExtract}>
                {isExtracting ? '추출 중...' : '다시 추출'}
              </button>
            </>
          ) : (
            <div className="ref-empty">
              <p className="sub">아직 추출된 참조 이미지가 없습니다 — 원본 사진에서 배경/모델을 제거한 제품 사진을 만듭니다.</p>
              <button className="btn pri sm" disabled={isExtracting} onClick={handleExtract}>
                {isExtracting ? '추출 중...' : '참조 이미지 추출'}
              </button>
            </div>
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
