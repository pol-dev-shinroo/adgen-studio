import { createContext, useContext, useState, useCallback } from 'react'
import { initialAds } from '../data/initialAds.js'
import { useNavigation } from './NavigationContext.jsx'

const AdsContext = createContext(null)

export function AdsProvider({ children }) {
  const { showToast } = useNavigation()
  const [ads, setAds] = useState(initialAds)
  const [brandFilter, setBrandFilter] = useState('전체')
  const [collected, setCollected] = useState([])
  const [lastQuery, setLastQuery] = useState('')

  // Simulates the real-time collection call: downloads the creative, then
  // dedupes against what's already archived by Ad ID before saving anything new.
  const collect = useCallback((query) => {
    const q = query.trim()
    if (!q) {
      showToast('브랜드명 또는 AD ID를 입력하세요')
      return
    }
    showToast(`"${q}" 실시간 수집 중... (이미지·동영상 다운로드)`)
    setTimeout(() => {
      setAds((prevAds) => {
        const dup = prevAds.slice(0, 2).map((a) => ({ ...a, isDup: true }))
        const isNumeric = /^\d+$/.test(q)
        const label = isNumeric ? `AD ${q}` : q
        const fresh = [
          { id: 102938475699, brand: label, title: '신제품 런칭\n사전예약 40%', gradient: 'g7', media: 'video', desc: '방금 수집 · 스토리 9:16', live: true, isDup: false },
          { id: 102938475700, brand: label, title: '베스트셀러\n리뷰 1만 돌파', gradient: 'g5', media: 'image', desc: '방금 수집 · 피드 1:1', live: true, isDup: false },
        ]
        const merged = [...prevAds]
        fresh.forEach((f) => {
          if (!merged.find((a) => a.id === f.id)) merged.push(f)
        })
        setCollected([...fresh, ...dup])
        setLastQuery(q)
        showToast(`수집 완료: 신규 ${fresh.length}건 · 중복 ${dup.length}건`)
        return merged
      })
    }, 900)
  }, [showToast])

  const renameBrand = useCallback((id, newName) => {
    setAds((prev) => prev.map((a) => (a.id === id ? { ...a, brand: newName } : a)))
    showToast(`브랜드명이 '${newName}'(으)로 수정됐습니다 — 이후 브랜드별 조회에 반영`)
  }, [showToast])

  const brands = [...new Set(ads.map((a) => a.brand))]

  return (
    <AdsContext.Provider value={{ ads, brands, brandFilter, setBrandFilter, collected, lastQuery, collect, renameBrand }}>
      {children}
    </AdsContext.Provider>
  )
}

export function useAds() {
  const ctx = useContext(AdsContext)
  if (!ctx) throw new Error('useAds must be used within AdsProvider')
  return ctx
}
