import { useEffect } from 'react'

export default function Modal({ onClose, children, overlayClassName, dialogClassName }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className={['modal-overlay', overlayClassName].filter(Boolean).join(' ')} onClick={onClose}>
      <div className={['modal-dialog', dialogClassName].filter(Boolean).join(' ')} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
