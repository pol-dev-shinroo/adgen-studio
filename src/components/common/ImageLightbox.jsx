import { useEffect } from 'react'
import Modal from './Modal.jsx'
import RetryImage from './RetryImage.jsx'
import { toEmbeddableImageUrl } from '../../api/adaptAd.js'

// images: array of the ORIGINAL Drive webViewLinks (not the embeddable
// thumbnail URLs) — this component builds both the larger preview src and
// the "open original" link from them, so callers only need to pass one array.
export default function ImageLightbox({ images, index, onIndexChange, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' && index < images.length - 1) onIndexChange(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [index, images.length, onIndexChange])

  const originalLink = images[index]
  const largeSrc = toEmbeddableImageUrl(originalLink, 'w1600')

  return (
    <Modal onClose={onClose} overlayClassName="lightbox-overlay" dialogClassName="lightbox-dialog">
      <div className="lightbox">
        <button className="modal-close" onClick={onClose} aria-label="닫기">✕</button>
        <RetryImage
          src={largeSrc}
          alt=""
          fallback={<div className="lightbox-fallback">이미지를 불러올 수 없습니다</div>}
        />
        <a className="lightbox-original-link" href={originalLink} target="_blank" rel="noopener noreferrer">
          원본 파일 열기 (Drive) ↗
        </a>
        {images.length > 1 && (
          <div className="lightbox-nav">
            <button disabled={index === 0} onClick={() => onIndexChange(index - 1)}>← 이전</button>
            <span>{index + 1} / {images.length}</span>
            <button disabled={index === images.length - 1} onClick={() => onIndexChange(index + 1)}>다음 →</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
