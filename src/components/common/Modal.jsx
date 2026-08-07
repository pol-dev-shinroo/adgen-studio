import { useEffect, useRef } from 'react'

// Part W: this one shared component backs every modal in the app (ad/
// product detail, compare, lightbox) — adding dialog semantics and basic
// focus handling here fixes all of them at once, same leverage as the
// Chip fix. Only "basic" focus handling: move focus into the dialog on
// open, restore it to whatever had focus before on close — not a full
// Tab-cycling focus trap, which none of this app's modals need since
// their content is always short (a form, a few buttons, an image).
export default function Modal({ onClose, children, overlayClassName, dialogClassName }) {
  const dialogRef = useRef(null)
  const previouslyFocusedRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement
    const focusable = dialogRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    ;(focusable || dialogRef.current)?.focus()

    return () => {
      if (previouslyFocusedRef.current instanceof HTMLElement) {
        previouslyFocusedRef.current.focus()
      }
    }
  }, [])

  return (
    <div className={['modal-overlay', overlayClassName].filter(Boolean).join(' ')} onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={['modal-dialog', dialogClassName].filter(Boolean).join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
