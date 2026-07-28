import { createContext, useContext, useState, useCallback, useRef } from 'react'

const NavigationContext = createContext(null)
const TOAST_DISPLAY_MS = 2800

export function NavigationProvider({ children }) {
  const [screen, setScreen] = useState('feed')
  // A queue rather than a single overwritten message — a second showToast()
  // call while one is still visible (common during multi-step flows, e.g.
  // discard-then-refetch) used to silently replace the first, losing
  // whichever message lost the race. Toast.jsx itself is unchanged — it
  // just renders whatever toastMsg/toastVisible currently say, same as
  // before; all the queueing lives here.
  const [toastQueue, setToastQueue] = useState([]) // [{id, msg}, ...]
  const [toastVisible, setToastVisible] = useState(false)
  // A ref, not state — this only gates whether a dequeue timer is already
  // running. Driving that off state (e.g. via a useEffect keyed on
  // toastVisible) would re-trigger the effect the instant setToastVisible
  // (true) itself commits, tearing down the timer it had just armed.
  const showingRef = useRef(false)

  const go = useCallback((s) => setScreen(s), [])

  // Shows the front of `queue` if nothing is currently displayed; once its
  // display window elapses, dequeues and recurses so the next queued toast
  // (if any) plays immediately after — never overlapping two toasts.
  const playNext = useCallback((queue) => {
    if (showingRef.current || queue.length === 0) return
    showingRef.current = true
    setToastVisible(true)
    setTimeout(() => {
      setToastVisible(false)
      showingRef.current = false
      setToastQueue((prev) => {
        const next = prev.slice(1)
        playNext(next)
        return next
      })
    }, TOAST_DISPLAY_MS)
  }, [])

  const showToast = useCallback((msg) => {
    setToastQueue((prev) => {
      const next = [...prev, { id: Date.now() + Math.random(), msg }]
      playNext(next)
      return next
    })
  }, [playNext])

  const toastMsg = toastQueue[0]?.msg ?? ''

  return (
    <NavigationContext.Provider value={{ screen, go, toastMsg, toastVisible, showToast }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider')
  return ctx
}
