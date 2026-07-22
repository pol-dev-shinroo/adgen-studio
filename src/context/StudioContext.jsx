import { createContext, useContext, useState, useCallback } from 'react'
import { initialMyBrands } from '../data/initialBrands.js'
import { useNavigation } from './NavigationContext.jsx'
import { useGallery } from './GalleryContext.jsx'

const StudioContext = createContext(null)

const DEFAULT_FORMATS = ['1:1 피드', '4:5 피드']

function defaultSelectionFor(brand) {
  const firstProduct = Object.keys(brand.products)[0]
  return { product: firstProduct, priceIdx: 0, promoIdx: 0, msgIdx: 0 }
}

export function StudioProvider({ children }) {
  const { showToast, go } = useNavigation()
  const { addResult } = useGallery()

  const [step, setStepRaw] = useState(1)
  const [refBrand, setRefBrandState] = useState(null)
  const [refAdIds, setRefAdIds] = useState([])
  const [myBrands, setMyBrands] = useState(initialMyBrands)
  const [selections, setSelections] = useState(() => {
    const init = {}
    initialMyBrands.filter((b) => b.active).forEach((b) => { init[b.name] = defaultSelectionFor(b) })
    return init
  })
  const [formats, setFormats] = useState(DEFAULT_FORMATS)
  const [quantity, setQuantity] = useState('2장')
  const [styleIntensity, setStyleIntensity] = useState(60)
  const [instructions, setInstructions] = useState('')

  const pickRefBrand = useCallback((brand) => {
    setRefBrandState(brand)
    setRefAdIds([])
  }, [])

  const toggleRefAd = useCallback((id) => {
    setRefAdIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const toggleMyBrand = useCallback((index) => {
    setMyBrands((prev) => {
      const next = prev.map((b, i) => (i === index ? { ...b, active: !b.active } : b))
      const brand = next[index]
      setSelections((sel) => {
        if (brand.active && !sel[brand.name]) {
          return { ...sel, [brand.name]: defaultSelectionFor(brand) }
        }
        return sel
      })
      return next
    })
  }, [])

  const setProductName = useCallback((brandName, productName) => {
    setSelections((sel) => ({ ...sel, [brandName]: { product: productName, priceIdx: 0, promoIdx: 0, msgIdx: 0 } }))
  }, [])

  const setProductField = useCallback((brandName, field, idx) => {
    setSelections((sel) => ({ ...sel, [brandName]: { ...sel[brandName], [field]: idx } }))
  }, [])

  const toggleFormat = useCallback((fmt) => {
    setFormats((prev) => (prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]))
  }, [])

  const setStep = useCallback((n) => {
    if (n >= 2 && !refBrand) {
      showToast('레퍼런스 브랜드를 먼저 선택하세요')
      return
    }
    setStepRaw(n)
  }, [refBrand, showToast])

  // Jumps here from the feed's "이 광고로 생성하기" button: pre-fills the
  // reference brand/ad and drops the user straight onto step 2.
  const prefillFromAd = useCallback((brand, adId) => {
    setRefBrandState(brand)
    setRefAdIds([adId])
    setStepRaw(2)
    go('studio')
    showToast(`'${brand}' 광고가 레퍼런스로 선택됐습니다`)
  }, [go, showToast])

  const goPrev = useCallback(() => {
    setStepRaw((s) => Math.max(1, s - 1))
  }, [])

  const goNext = useCallback(() => {
    if (step === 2 && refAdIds.length === 0) {
      showToast('광고소재를 1개 이상 선택하세요')
      return
    }
    if (step < 4) {
      setStepRaw(step + 1)
      return
    }
    const activeBrands = myBrands.filter((b) => b.active)
    activeBrands.forEach((b) => {
      const sel = selections[b.name]
      formats.forEach((fmt) => {
        addResult({
          title: `${b.name} ${sel?.product ?? ''}`.trim(),
          gradient: 'g5',
          status: 'run',
          progress: 0,
          desc: `레퍼런스: ${refBrand} · ${fmt} · 생성 시작`,
        })
      })
    })
    showToast('생성 잡이 시작됐습니다 — 결과 갤러리에서 진행 상황을 확인하세요')
    setTimeout(() => go('gallery'), 900)
  }, [step, refAdIds, myBrands, formats, selections, refBrand, addResult, showToast, go])

  return (
    <StudioContext.Provider
      value={{
        step, setStep, goNext, goPrev,
        refBrand, pickRefBrand,
        refAdIds, toggleRefAd,
        myBrands, toggleMyBrand,
        selections, setProductName, setProductField,
        formats, toggleFormat,
        quantity, setQuantity,
        styleIntensity, setStyleIntensity,
        instructions, setInstructions,
        prefillFromAd,
      }}
    >
      {children}
    </StudioContext.Provider>
  )
}

export function useStudio() {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used within StudioProvider')
  return ctx
}
