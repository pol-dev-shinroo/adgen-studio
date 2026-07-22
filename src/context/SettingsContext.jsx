import { createContext, useContext, useState, useCallback } from 'react'
import { initialProductReview } from '../data/initialProductReview.js'
import { useNavigation } from './NavigationContext.jsx'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const { showToast } = useNavigation()
  const [products, setProducts] = useState(initialProductReview)
  const [openId, setOpenId] = useState(initialProductReview[0]?.id ?? null)

  const toggleOpen = useCallback((id) => {
    setOpenId((prev) => (prev === id ? null : id))
  }, [])

  const editField = useCallback((productId, fieldIndex, newValue) => {
    setProducts((prev) => prev.map((p) => {
      if (p.id !== productId) return p
      const fields = p.fields.map((f, i) => {
        if (i !== fieldIndex) return f
        const options = [...f.options]
        options[0] = newValue
        return { ...f, options, note: '수정됨', noteType: undefined }
      })
      return { ...p, fields }
    }))
    showToast('수정값이 저장됐습니다 — 생성 스튜디오 드롭다운에 반영')
  }, [showToast])

  const markReviewed = useCallback((productId) => {
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, status: 'ok' } : p)))
    showToast('검토 완료 처리됐습니다')
  }, [showToast])

  return (
    <SettingsContext.Provider value={{ products, openId, toggleOpen, editField, markReviewed }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
