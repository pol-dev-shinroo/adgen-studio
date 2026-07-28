import { useState, useEffect } from 'react'
import RetryImage from './RetryImage.jsx'

// fit: 'cover' (default — matches every existing ad/feed usage, where a
// wide screenshot should crop top/bottom rather than letterbox) or
// 'contain' (for product photos: a tall bottle/tube must never be
// cropped — better to show the whole product against a neutral backdrop).
// Applied as an inline style rather than a CSS class so it wins regardless
// of which screen's scoped .thumb-img rule this renders under.
export default function Thumb({ gradient, image, fit = 'cover', className, children, onClick }) {
  const [imageFailed, setImageFailed] = useState(false)

  // Reset if a re-collection swaps in a different (or newly-working) image
  // for the same card instance — otherwise a prior failure would stick
  // around forever showing the gradient even once a good image arrives.
  useEffect(() => {
    setImageFailed(false)
  }, [image])

  const showImage = Boolean(image) && !imageFailed
  const cls = [
    'thumb', showImage ? 'has-image' : gradient, fit === 'contain' && 'thumb-contain',
    onClick && showImage && 'thumb-clickable', className,
  ].filter(Boolean).join(' ')
  return (
    <div className={cls} onClick={onClick}>
      {showImage && (
        <RetryImage
          src={image}
          alt=""
          className="thumb-img"
          style={{ objectFit: fit }}
          onFinalError={() => setImageFailed(true)}
        />
      )}
      {children}
    </div>
  )
}
