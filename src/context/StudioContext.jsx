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
  // Part S: raw per-brand product-reference-selection state, keyed by brand
  // display name — same convention as productOverrides. Replaces Part O's
  // ad-driven adSelectionOverrides entirely (real user testing found ads
  // were the wrong data source for our own brand's products — see
  // ProductReferencePanel.jsx's header comment). selectedImageKeys:
  // extractedReferences[] entries the user checked in the gallery, each
  // identified by a `${productName}::${index}` key (derived below, in
  // productRefSelections — there's no per-entry ID today, but name+index is
  // stable for as long as the product's own reference list doesn't reorder,
  // which extraction never does). selectedPrice/selectedPromotion/
  // selectedAdHooks: chosen from whatever the currently-selected products
  // actually offer (also derived below).
  const [productRefOverrides, setProductRefOverrides] = useState({})
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
  // productOverrides above — reactive to both the raw override state and to
  // the live products list (a fresh extraction, or a product dropping out
  // of the current selection, immediately reflows the derived gallery/
  // options). galleryItems flattens every currently-selected product's own
  // extractedReferences[] entries into one list, each tagged with a stable
  // key and which product it came from — the "user sees the list but knows
  // which [product] each one comes from" requirement, re-scoped from ads to
  // products. availablePrices/availablePromotions/availableAdHooks are
  // deduped across every currently-selected product, skipping blank/'없음'
  // values (formatKRW's blank sentinel is '-', adaptProduct.js's is '없음').
  // Stale selections (an image key or price no longer offered because its
  // product got deselected) self-heal the same way productOverrides' stale
  // product names do.
  const productRefSelections = {}
  myBrands.filter((b) => b.active).forEach((b) => {
    const override = productRefOverrides[b.name] || {}
    const selectedNames = (selections[b.name]?.products || []).filter((n) => b.products[n])

    const galleryItems = selectedNames.flatMap((name) => {
      const product = b.products[name]
      return product.extractedReferences.map((ref, index) => ({
        key: `${name}::${index}`, productName: name, product, ref,
      }))
    })
    const galleryKeys = new Set(galleryItems.map((item) => item.key))

    const availablePrices = [...new Set(selectedNames.map((n) => b.products[n].price).filter((v) => v && v !== '-'))]
    const availablePromotions = [
      ...new Set(selectedNames.map((n) => b.products[n].promotionInfo).filter((v) => v && v !== '없음')),
    ]
    const availableAdHooks = [
      ...new Set(selectedNames.map((n) => b.products[n].adHookCopy).filter((v) => v && v !== '없음')),
    ]

    productRefSelections[b.name] = {
      galleryItems,
      selectedImageKeys: (override.selectedImageKeys || []).filter((k) => galleryKeys.has(k)),
      availablePrices,
      availablePromotions,
      availableAdHooks,
      selectedPrice: availablePrices.includes(override.selectedPrice) ? override.selectedPrice : null,
      selectedPromotion: availablePromotions.includes(override.selectedPromotion) ? override.selectedPromotion : null,
      selectedAdHooks: (override.selectedAdHooks || []).filter((h) => availableAdHooks.includes(h)),
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

  // Toggles one gallery entry (one specific extractedReferences[] item) in/
  // out of a brand's selected-image-keys list. Can go empty — there's no
  // "must always have one" rule here the way there is for product selection
  // itself.
  const toggleImageKeySelected = useCallback((brandName, key) => {
    setProductRefOverrides((prev) => {
      const current = prev[brandName]?.selectedImageKeys || []
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
      return { ...prev, [brandName]: { ...prev[brandName], selectedImageKeys: next } }
    })
  }, [])

  // 전체 선택 for the reference-image gallery — selects every key passed in,
  // or clears the list entirely if every one of them is already selected
  // (indeterminate-aware toggle, same convention as every other 전체 선택
  // in this app).
  const toggleAllImageKeysSelected = useCallback((brandName, allKeys) => {
    setProductRefOverrides((prev) => {
      const current = prev[brandName]?.selectedImageKeys || []
      const allSelected = allKeys.length > 0 && allKeys.every((k) => current.includes(k))
      return { ...prev, [brandName]: { ...prev[brandName], selectedImageKeys: allSelected ? [] : [...allKeys] } }
    })
  }, [])

  const selectProductRefPrice = useCallback((brandName, price) => {
    setProductRefOverrides((prev) => ({ ...prev, [brandName]: { ...prev[brandName], selectedPrice: price } }))
  }, [])

  const selectProductRefPromotion = useCallback((brandName, promotion) => {
    setProductRefOverrides((prev) => ({ ...prev, [brandName]: { ...prev[brandName], selectedPromotion: promotion } }))
  }, [])

  const toggleProductRefHookSelection = useCallback((brandName, hook) => {
    setProductRefOverrides((prev) => {
      const current = prev[brandName]?.selectedAdHooks || []
      const next = current.includes(hook) ? current.filter((h) => h !== hook) : [...current, hook]
      return { ...prev, [brandName]: { ...prev[brandName], selectedAdHooks: next } }
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

    // Part P (re-sourced in Part S): real, user-picked copy from the
    // product-reference panel (the SAME brand `b` the rest of this payload
    // is already built for), used instead of the backend's Pinecone lookup
    // when the user actually touched the panel. Only sent if at least one
    // of the three is actually populated — omitted (null) otherwise, so
    // anyone who never touches the panel gets exactly the old behavior.
    const brandRefSel = productRefSelections[b.name]
    const hasAdCopyOverride = !!brandRefSel && (
      brandRefSel.selectedPrice || brandRefSel.selectedPromotion || brandRefSel.selectedAdHooks.length > 0
    )
    const adCopyOverride = hasAdCopyOverride ? {
      price: brandRefSel.selectedPrice || null,
      promotion: brandRefSel.selectedPromotion || null,
      adHooks: brandRefSel.selectedAdHooks,
    } : null

    // Part S: checked gallery entries, split by role. A checked type:
    // 'product' entry overrides which of THAT product's own real reference
    // images the backend renders with — only when exactly one is checked
    // for a given product (two checked at once is ambiguous, so that
    // product is simply left out of the map and falls back to the
    // backend's own default, same as if nothing were checked for it at
    // all). A checked non-product entry (e.g. a model shot) is the style
    // reference — first one in gallery order, capped to one, same Part Q
    // one-image plumbing on the backend, just sourced from products now.
    const checkedItems = (brandRefSel?.galleryItems || [])
      .filter((item) => brandRefSel.selectedImageKeys.includes(item.key))

    const productImageOverrides = {}
    selectedProducts.forEach(({ product }) => {
      const checkedForProduct = checkedItems.filter(
        (item) => item.product.productId === product.productId && item.ref.type === 'product'
      )
      if (checkedForProduct.length === 1) {
        productImageOverrides[product.productId] = checkedForProduct[0].ref.imageUrl
      }
    })

    const styleReferenceItem = checkedItems.find((item) => item.ref.type !== 'product')
    const referenceSheetImageUrl = styleReferenceItem?.ref.imageUrl || null

    const brandPayload = { key: b.key, productIds: selectedProducts.map(({ product }) => product.productId) }
    if (Object.keys(productImageOverrides).length > 0) {
      brandPayload.productImageOverrides = productImageOverrides
    }

    startGeneration({
      refBrand,
      refAdIds,
      brand: brandPayload,
      formats,
      quantity: qty,
      styleIntensity,
      instructions,
      adCopyOverride,
      referenceSheetImageUrl,
    })

    showToast('생성 잡이 시작됐습니다 — 결과 갤러리에서 진행 상황을 확인하세요')
    // Switch tabs immediately, before the job's first poll even lands —
    // same convention as prefillFromAd's synchronous go('studio') elsewhere
    // in this file, rather than the old mock's artificial setTimeout delay.
    go('gallery')
  }, [
    step, refAdIds, myBrands, formats, selections, productRefSelections, refBrand, quantity, styleIntensity,
    instructions, startGeneration, showToast, go,
  ])

  return (
    <StudioContext.Provider
      value={{
        step, setStep, goNext, goPrev,
        refBrand, pickRefBrand,
        refAdIds, toggleRefAd,
        myBrands, toggleMyBrand,
        selections, toggleProductSelection,
        productRefSelections, toggleImageKeySelected, toggleAllImageKeysSelected,
        selectProductRefPrice, selectProductRefPromotion, toggleProductRefHookSelection,
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
