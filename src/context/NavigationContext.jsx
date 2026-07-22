import { createContext, useContext, useState, useCallback, useRef } from 'react'

const NavigationContext = createContext(null)

export function NavigationProvider({ children }) {
  const [screen, setScreen] = useState('feed')
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const timerRef = useRef(null)

  const go = useCallback((s) => setScreen(s), [])

  const showToast = useCallback((msg) => {
    setToastMsg(msg)
    setToastVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setToastVisible(false), 2800)
  }, [])

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
