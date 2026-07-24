import { useState } from 'react'
import Modal from '../common/Modal.jsx'
import ImageLightbox from '../common/ImageLightbox.jsx'
import { useStudio } from '../../context/StudioContext.jsx'
import { toEmbeddableImageUrl } from '../../api/adaptAd.js'

function formatDateTime(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso || '—' : d.toLocaleString('ko-KR')
}

function Field({ label, value, href }) {
  if (!value) return null
  return (
    <div className="dtl-field">
      <div className="dtl-label">{label}</div>
      {href ? (
        <a className="dtl-value link" href={href} target="_blank" rel="noopener noreferrer">{value}</a>
      ) : (
        <div className="dtl-value">{value}</div>
      )}
    </div>
  )
}

export default function AdDetailModal({ ad, onClose }) {
  const { prefillFromAd } = useStudio()
  const [lightboxIndex, setLightboxIndex] = useState(null)
  if (!ad) return null

  const raw = ad.raw ?? {}
  const galleryImages = ad.images.length > 0 ? ad.images.map((link) => toEmbeddableImageUrl(link)) : []

  const handleGenerate = () => {
    prefillFromAd(ad.brand, ad.id)
    onClose()
  }

  // If the lightbox is open, the first Escape/backdrop click closes just
  // that (handled here since both Modals share one document keydown
  // listener and this outer one fires first); a second closes the detail view.
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
          {galleryImages.length > 0 ? (
            galleryImages.map((src, i) => (
              <img key={i} src={src} alt="" onClick={() => setLightboxIndex(i)} />
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
            <Field label="Facebook 페이지명" value={ad.pageName} />
            <Field label="Display Format" value={raw['Display Format']} />
            <Field label="Platforms" value={raw['Platforms']} />
            <Field label="Variant Count" value={raw['Variant Count']} />
          </div>
        </div>

        <div className="dtl-section">
          <div className="dtl-sect-title">광고 카피</div>
          <Field label="Title" value={raw['Title']} />
          <Field label="Post Content" value={raw['Post Content']} />
          <Field label="Bottom Content" value={raw['Bottom Content']} />
          <Field label="CTA Text" value={raw['CTA Text']} />
          <Field label="Landing URL" value={raw['Landing URL']} href={raw['Landing URL']} />
        </div>

        <div className="dtl-section">
          <div className="dtl-sect-title">수집 정보</div>
          <div className="dtl-grid">
            <Field label="Start Date" value={raw['Start Date']} />
            <Field label="End Date" value={raw['End Date']} />
            <Field label="Date Scraped" value={formatDateTime(raw['Date Scraped'])} />
            <Field label="Search Keyword" value={raw['Search Keyword']} />
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
