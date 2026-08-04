import { createContext, useContext, useState, useCallback } from 'react'
import { useNavigation } from './NavigationContext.jsx'
import { useGallery } from './GalleryContext.jsx'
import { useProducts } from './ProductsContext.jsx'
import { useAds } from './AdsContext.jsx'

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
  const { ads } = useAds()

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
  // Part O: raw per-brand ad-selection state, keyed by brand display name —
  // same convention as productOverrides. Generation wiring is explicitly
  // out of scope for this part; this only needs to survive step navigation
  // the same way everything else here does. checkedAdIds: which of the
  // brand's own ads are checked. selectedPrice/selectedPromotion/
  // selectedAdHooks: chosen from whatever the checked+extracted ads
  // actually offer (derived below, in adSelections). selectedSheetAdIds:
  // which checked+extracted ads' reference sheets are kept selected in the
  // gallery — a separate selection from checkedAdIds, since unchecking an
  // ad in the list and deselecting its sheet in the gallery are different
  // user actions with different controls.
  const [adSelectionOverrides, setAdSelectionOverrides] = useState({})
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

  // Derived per active brand, the same way `selections` derives from
  // productOverrides above — reactive to both the raw override state and
  // to the live `ads` list (an ad getting extracted, or a checked ad
  // dropping out of the list, immediately reflows the derived options).
  // availablePrices/availablePromotions/availableAdHooks are deduped across
  // every checked ad that's already been extracted — an ad that's checked
  // but not yet extracted contributes nothing, matching every other
  // extraction gate in this app. Stale selections (a price that's no
  // longer offered because its ad got unchecked) self-heal the same way
  // productOverrides' stale product names do.
  const adSelections = {}
  myBrands.filter((b) => b.active).forEach((b) => {
    const override = adSelectionOverrides[b.name] || {}
    const brandAds = ads.filter((a) => a.brand === b.name)
    const brandAdIds = new Set(brandAds.map((a) => a.id))

    const checkedAdIds = (override.checkedAdIds || []).filter((id) => brandAdIds.has(id))
    const extractedChecked = brandAds.filter((a) => checkedAdIds.includes(a.id) && a.extractedReference)

    const availablePrices = [...new Set(extractedChecked.map((a) => a.extractedCopy?.price).filter(Boolean))]
    const availablePromotions = [...new Set(extractedChecked.map((a) => a.extractedCopy?.promotion).filter(Boolean))]
    const availableAdHooks = [...new Set(extractedChecked.flatMap((a) => a.extractedCopy?.adHooks || []))]
    const availableSheetAdIds = extractedChecked.map((a) => a.id)

    adSelections[b.name] = {
      checkedAdIds,
      availablePrices,
      availablePromotions,
      availableAdHooks,
      availableSheetAdIds,
      selectedPrice: availablePrices.includes(override.selectedPrice) ? override.selectedPrice : null,
      selectedPromotion: availablePromotions.includes(override.selectedPromotion) ? override.selectedPromotion : null,
      selectedAdHooks: (override.selectedAdHooks || []).filter((h) => availableAdHooks.includes(h)),
      selectedSheetAdIds: (override.selectedSheetAdIds || []).filter((id) => availableSheetAdIds.includes(id)),
    }
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

  // Toggles one ad in/out of a brand's checked-ads list. Unlike
  // toggleProductSelection, this CAN go empty — there's no "must always
  // have one" rule for ads the way there is for products.
  const toggleAdChecked = useCallback((brandName, adId) => {
    setAdSelectionOverrides((prev) => {
      const current = prev[brandName]?.checkedAdIds || []
      const next = current.includes(adId) ? current.filter((id) => id !== adId) : [...current, adId]
      return { ...prev, [brandName]: { ...prev[brandName], checkedAdIds: next } }
    })
  }, [])

  // 전체 선택 for the ad list — checks every ad ID passed in, or clears the
  // list entirely if every one of them is already checked (so the single
  // control correctly acts as an indeterminate-aware toggle: partial or
  // none checked -> select all; all checked -> deselect all).
  const toggleAllAdsChecked = useCallback((brandName, allAdIds) => {
    setAdSelectionOverrides((prev) => {
      const current = prev[brandName]?.checkedAdIds || []
      const allChecked = allAdIds.length > 0 && allAdIds.every((id) => current.includes(id))
      return { ...prev, [brandName]: { ...prev[brandName], checkedAdIds: allChecked ? [] : [...allAdIds] } }
    })
  }, [])

  const selectAdPrice = useCallback((brandName, price) => {
    setAdSelectionOverrides((prev) => ({ ...prev, [brandName]: { ...prev[brandName], selectedPrice: price } }))
  }, [])

  const selectAdPromotion = useCallback((brandName, promotion) => {
    setAdSelectionOverrides((prev) => ({ ...prev, [brandName]: { ...prev[brandName], selectedPromotion: promotion } }))
  }, [])

  const toggleAdHookSelection = useCallback((brandName, hook) => {
    setAdSelectionOverrides((prev) => {
      const current = prev[brandName]?.selectedAdHooks || []
      const next = current.includes(hook) ? current.filter((h) => h !== hook) : [...current, hook]
      return { ...prev, [brandName]: { ...prev[brandName], selectedAdHooks: next } }
    })
  }, [])

  // Reference-sheet gallery selection — deliberately separate state from
  // checkedAdIds (see the adSelectionOverrides comment above): unchecking
  // an ad in the list and deselecting its sheet in the gallery are
  // different controls, even though a sheet can only ever be selected for
  // an ad that's currently checked+extracted (enforced by the self-heal in
  // the adSelections derivation above, not here).
  const toggleSheetSelected = useCallback((brandName, adId) => {
    setAdSelectionOverrides((prev) => {
      const current = prev[brandName]?.selectedSheetAdIds || []
      const next = current.includes(adId) ? current.filter((id) => id !== adId) : [...current, adId]
      return { ...prev, [brandName]: { ...prev[brandName], selectedSheetAdIds: next } }
    })
  }, [])

  const toggleAllSheetsSelected = useCallback((brandName, allAdIds) => {
    setAdSelectionOverrides((prev) => {
      const current = prev[brandName]?.selectedSheetAdIds || []
      const allSelected = allAdIds.length > 0 && allAdIds.every((id) => current.includes(id))
      return { ...prev, [brandName]: { ...prev[brandName], selectedSheetAdIds: allSelected ? [] : [...allAdIds] } }
    })
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

  // Part O interim-state note (deliberate, not an oversight): Step 3's UI
  // now also shows the new brand-scoped ad-selection panel (checked ads,
  // extracted reference sheets, chosen price/promotion/adHooks — all in
  // `adSelections` above), but generation wiring is explicitly out of scope
  // for that part. This validation below, and the actual startGeneration
  // payload further down, still only look at `selections`/productOverrides
  // and each selected product's `extractedReferences` — exactly as they did
  // before Part O. Nothing here reads `adSelections` yet. That means a user
  // can fully fill out the new ad panel and still be blocked by (or only
  // gated by) the old per-product extraction check, with no visible link
  // between the two — genuinely inconsistent, left for a later part to
  // connect once the new selections actually feed a real generation call.
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

    const missingExtraction = selectedProducts.filter(
      ({ product }) => !product.extractedReferences.some((r) => r.type === 'product')
    )
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
        adSelections, toggleAdChecked, toggleAllAdsChecked,
        selectAdPrice, selectAdPromotion, toggleAdHookSelection,
        toggleSheetSelected, toggleAllSheetsSelected,
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
