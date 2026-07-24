import { useState, useEffect } from 'react'

// drive.google.com/thumbnail is an undocumented endpoint that can
// intermittently throttle under bursts of many simultaneous requests (a
// grid of 15+ cards all loading at once), and can briefly fail right after
// a file's "anyone with link" permission is set but hasn't propagated yet
// — neither is a real "this image doesn't exist" failure, so it's worth a
// couple of retries before giving up.
const RETRY_DELAYS_MS = [600, 1800]

// onFinalError: optional — lets a parent (e.g. Thumb) react once retries
// are exhausted, such as falling back to its own gradient placeholder
// instead of (or in addition to) this component's own `fallback` node.
export default function RetryImage({ src, alt = '', fallback = null, onFinalError, ...imgProps }) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setAttempt(0)
    setFailed(false)
  }, [src])

  if (!src || failed) return fallback

  const attemptSrc = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}`

  const handleError = () => {
    if (attempt < RETRY_DELAYS_MS.length) {
      setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAYS_MS[attempt])
    } else {
      setFailed(true)
      onFinalError?.()
    }
  }

  return (
    <img
      key={attemptSrc}
      src={attemptSrc}
      alt={alt}
      loading="lazy"
      onError={handleError}
      {...imgProps}
    />
  )
}
