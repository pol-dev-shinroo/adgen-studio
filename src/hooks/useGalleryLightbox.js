import { useState } from 'react'

// Encapsulates a detail modal's image-lightbox state plus the two-stage
// Escape/backdrop-close behavior shared by AdDetailModal.jsx and
// ProductDetailModal.jsx: both Modals share one document keydown listener,
// and the outer (detail-view) one fires first, so while the lightbox is
// open, the first close just dismisses that; a second dismisses the whole
// detail view.
export function useGalleryLightbox(onClose) {
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const closeModal = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex(null)
    } else {
      onClose()
    }
  }

  return { lightboxIndex, setLightboxIndex, closeModal }
}
