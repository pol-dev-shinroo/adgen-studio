import { useState, useEffect } from 'react'
import RetryImage from './RetryImage.jsx'

export default function Thumb({ gradient, image, className, children }) {
  const [imageFailed, setImageFailed] = useState(false)

  // Reset if a re-collection swaps in a different (or newly-working) image
  // for the same card instance — otherwise a prior failure would stick
  // around forever showing the gradient even once a good image arrives.
  useEffect(() => {
    setImageFailed(false)
  }, [image])

  const showImage = Boolean(image) && !imageFailed
  const cls = ['thumb', showImage ? 'has-image' : gradient, className].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      {showImage && (
        <RetryImage src={image} alt="" className="thumb-img" onFinalError={() => setImageFailed(true)} />
      )}
      {children}
    </div>
  )
}
