import { createContext, useContext, useState, useCallback } from 'react'
import { useNavigation } from './NavigationContext.jsx'
import { useGallery } from './GalleryContext.jsx'
import { useProducts } from './ProductsContext.jsx'

const StudioContext = createContext(null)

const DEFAULT_FORMATS = ['1:1 피드', '4:5 피드']
const DEFAULT_ACTIVE_BRAND_KEY = 'healthykiki' // mirrors the old mock's single-brand-active-by-default

function defaultSelectionFor(brand) {
  const firstProduct = Object.keys(brand.products)[0]
  return { products: firstProduct ? [firstProduct] : [] }
}

export function StudioProvider({ children }) {
  const { showToast, go } = useNavigation()
  const { startGeneration } = useGallery()
  const { brands: productBrands } = useProducts()

  const [step, setStepRaw] = useState(1)
  const [refBrand, setRefBrandState] = useState(null)
  const [refAdIds, setRefAdIds] = useState([])
  const [activeBrandKeys, setActiveBrandKeys] = useState(() => new Set([DEFAULT_ACTIVE_BRAND_KEY]))
  // Only holds a brand's selection once the user explicitly toggles a
  // product; otherwise it falls back to defaultSelectionFor below. Holds an
  // array now (multiple products can be selected per brand) rather than a
  // single name. This also means a stale pick (a product that's since
  // dropped out of a resync) quietly self-heals — any names no longer in
  // b.products are dropped, and if that empties the array entirely it falls
  // back to the first available product instead of pointing at nothing.
  const [productOverrides, setProductOverrides] = useState({})
  const [formats, setFormats] = useState(DEFAULT_FORMATS)
  const [quantity, setQuantity] = useState('2장')
  const [styleIntensity, setStyleIntensity] = useState(60)
  const [instructions, setInstructions] = useState('')

  const myBrands = productBrands.map((b) => ({ ...b, active: activeBrandKeys.has(b.key) }))

  const selections = {}
  myBrands.filter((b) => b.active).forEach((b) => {
    const override = productOverrides[b.name]
    const validNames = (override?.products || []).filter((n) => b.products[n])
    selections[b.name] = validNames.length > 0 ? { products: validNames } : defaultSelectionFor(b)
  })

  const pickRefBrand = useCallback((brand) => {
    setRefBrandState(brand)
    setRefAdIds([])
  }, [])

  const toggleRefAd = useCallback((id) => {
    setRefAdIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const toggleMyBrand = useCallback((index) => {
    const key = productBrands[index]?.key
    if (!key) return
    setActiveBrandKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [productBrands])

  // Toggles one product in/out of a brand's selection, never letting it go
  // empty — a brand must always have at least one product chosen once it's
  // active. Computes the "before" state the same self-healing way the
  // `selections` calc above does (falling back to the default single
  // product when no override exists yet), so toggling a second product on
  // before ever touching the picker adds to the default pick instead of
  // silently replacing it.
  const toggleProductSelection = useCallback((brandName, productName) => {
    const brand = productBrands.find((b) => b.name === brandName)
    if (!brand) return

    setProductOverrides((prev) => {
      const override = prev[brandName]
      const validExisting = (override?.products || []).filter((n) => brand.products[n])
      const current = validExisting.length > 0 ? validExisting : defaultSelectionFor(brand).products

      let next
      if (current.includes(productName)) {
        if (current.length === 1) return prev // never let the selection go empty
        next = current.filter((n) => n !== productName)
      } else {
        next = [...current, productName]
      }
      return { ...prev, [brandName]: { products: next } }
    })
  }, [productBrands])

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
    if (activeBrands.length === 0) {
      showToast('생성할 브랜드를 먼저 선택하세요')
      return
    }
    if (formats.length === 0) {
      showToast('포맷을 1개 이상 선택하세요')
      return
    }

    // The backend's generation job is single-brand-per-request (like every
    // other job in this app — sync/collect/extract are all one-job-at-a-
    // time too), and the shared useJobPolling slot in GalleryContext can
    // only track one active job's progress at once. Multi-brand-active is
    // still a valid selection for Step 3 (it drives per-brand product
    // config), but generation itself only ever runs for the first active
    // brand — a real product decision for a later session if simultaneous
    // multi-brand generation turns out to matter in practice.
    const b = activeBrands[0]
    if (activeBrands.length > 1) {
      showToast(`${activeBrands.length}개 브랜드가 선택됐지만, 생성은 '${b.name}'에 대해서만 실행됩니다`)
    }

    const sel = selections[b.name]
    // Same self-heal as the `selections` computation: only names still
    // present in b.products count.
    const selectedProducts = (sel?.products || [])
      .filter((n) => b.products[n])
      .map((n) => ({ name: n, product: b.products[n] }))

    if (selectedProducts.length === 0) {
      showToast(`'${b.name}'의 제품을 먼저 선택하세요`)
      return
    }

    const missingExtraction = selectedProducts.filter(({ product }) => !product.extractedImage)
    if (missingExtraction.length > 0) {
      showToast(
        `참조 이미지가 없는 제품이 있습니다 — 상품관리에서 먼저 추출해주세요: ` +
        missingExtraction.map(({ name }) => name).join(', ')
      )
      return
    }

    const qty = Number(String(quantity).replace(/\D/g, '')) || 1

    startGeneration({
      refBrand,
      refAdIds,
      brand: { key: b.key, productIds: selectedProducts.map(({ product }) => product.productId) },
      formats,
      quantity: qty,
      styleIntensity,
      instructions,
    })

    showToast('생성 잡이 시작됐습니다 — 결과 갤러리에서 진행 상황을 확인하세요')
    // Switch tabs immediately, before the job's first poll even lands —
    // same convention as prefillFromAd's synchronous go('studio') elsewhere
    // in this file, rather than the old mock's artificial setTimeout delay.
    go('gallery')
  }, [
    step, refAdIds, myBrands, formats, selections, refBrand, quantity, styleIntensity, instructions,
    startGeneration, showToast, go,
  ])

  return (
    <StudioContext.Provider
      value={{
        step, setStep, goNext, goPrev,
        refBrand, pickRefBrand,
        refAdIds, toggleRefAd,
        myBrands, toggleMyBrand,
        selections, toggleProductSelection,
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
