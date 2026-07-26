import Modal from '../common/Modal.jsx'
import ImageLightbox from '../common/ImageLightbox.jsx'
import RetryImage from '../common/RetryImage.jsx'
import DetailField from '../common/DetailField.jsx'
import { useStudio } from '../../context/StudioContext.jsx'
import { toEmbeddableImageUrl } from '../../api/adaptAd.js'
import { formatDateTime } from '../../utils/date.js'
import { useGalleryLightbox } from '../../hooks/useGalleryLightbox.js'

export default function AdDetailModal({ ad, onClose }) {
  const { prefillFromAd } = useStudio()
  const { lightboxIndex, setLightboxIndex, closeModal } = useGalleryLightbox(onClose)
  if (!ad) return null

  const raw = ad.raw ?? {}
  const galleryImages = ad.images.length > 0 ? ad.images.map((link) => toEmbeddableImageUrl(link)) : []

  const handleGenerate = () => {
    prefillFromAd(ad.brand, ad.id)
    onClose()
  }

  return (
    <Modal onClose={closeModal}>
      <div className="ad-detail">
        <button className="modal-close" onClick={closeModal} aria-label="닫기">✕</button>

        <div className="dtl-gallery">
          {galleryImages.length > 0 ? (
            galleryImages.map((src, i) => (
              <RetryImage
                key={i}
                src={src}
                alt=""
                onClick={() => setLightboxIndex(i)}
                fallback={<div className={`thumb ${ad.gradient}`} style={{ cursor: 'default' }} />}
              />
            ))
          ) : (
            <div className={`thumb ${ad.gradient}`} />
          )}
        </div>
        {raw['Video Link'] && (
          <a className="dtl-video-link" href={raw['Video Link'].split('\n')[0]} target="_blank" rel="noopener noreferrer">
            🎬 원본 동영상 링크 열기
          </a>
        )}

        <div className="dtl-section">
          <div className="dtl-header">
            <h2>{ad.brand}</h2>
            {ad.live !== undefined && (
              <span className={`badge ${ad.live ? 'live' : 'arch'}`}>{ad.live ? '게재중' : '아카이브'}</span>
            )}
          </div>
          <div className="dtl-grid">
            <DetailField label="Facebook 페이지명" value={ad.pageName} />
            <DetailField label="Display Format" value={raw['Display Format']} />
            <DetailField label="Platforms" value={raw['Platforms']} />
            <DetailField label="Variant Count" value={raw['Variant Count']} />
          </div>
        </div>

        <div className="dtl-section">
          <div className="dtl-sect-title">광고 카피</div>
          <DetailField label="Title" value={raw['Title']} />
          <DetailField label="Post Content" value={raw['Post Content']} />
          <DetailField label="Bottom Content" value={raw['Bottom Content']} />
          <DetailField label="CTA Text" value={raw['CTA Text']} />
          <DetailField label="Landing URL" value={raw['Landing URL']} href={raw['Landing URL']} />
        </div>

        <div className="dtl-section">
          <div className="dtl-sect-title">수집 정보</div>
          <div className="dtl-grid">
            <DetailField label="Start Date" value={raw['Start Date']} />
            <DetailField label="End Date" value={raw['End Date']} />
            <DetailField label="Date Scraped" value={formatDateTime(raw['Date Scraped'])} />
            <DetailField label="Search Keyword" value={raw['Search Keyword']} />
          </div>
        </div>

        <div className="dtl-footer">
          <div className="dtl-footer-links">
            {raw['Ad Library URL'] && (
              <a href={raw['Ad Library URL']} target="_blank" rel="noopener noreferrer">Ad Library에서 보기 ↗</a>
            )}
            <span className="dtl-adid">AD ID {raw['Ad Archive ID'] || ad.id}</span>
          </div>
          <button className="btn pri sm" onClick={handleGenerate}>
            ✨ 이 광고로 생성하기
          </button>
        </div>
      </div>
      {lightboxIndex !== null && (
        <ImageLightbox
          images={ad.images}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </Modal>
  )
}
