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
  // BB-2: single-select, not multi — StepMyBrand.jsx used to advertise
  // "다중선택 가능" and let a user fully configure several brands' products/
  // references, but goNext only ever generated for the first active one,
  // silently discarding the rest. Made honest by making this genuinely
  // single-select (a real string, not a Set) instead of adding real
  // multi-brand generation, which would need its own job-polling slot per
  // brand in GalleryContext — a bigger change than this UI ever needed.
  const [activeBrandKey, setActiveBrandKey] = useState(DEFAULT_ACTIVE_BRAND_KEY)
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

  const myBrands = productBrands.map((b) => ({ ...b, active: b.key === activeBrandKey }))

  const selections = {}
  myBrands.filter((b) => b.active).forEach((b) => {
    const override = productOverrides[b.name]
    const validNames = (override?.products || []).filter((n) => b.products[n])
    selections[b.name] = validNames.length > 0 ? { products: validNames } : defaultSelectionFor(b)
  })

  // BB-4: real up-front render-count preview, shown on Step 4 before the
  // user commits — mirrors goNext's own totalRenders math exactly
  // (productIds.length * refAdIds.length * formats.length * quantity) so
  // what's shown here never drifts from what actually gets billed. Without
  // this, only the per-product multiplier was ever surfaced (Step 3's own
  // "N개 제품 × 선택한 포맷/수량에 따라..." hint) — the refAdIds multiplier
  // picked back in Step 2 was easy to forget about by Step 4.
  const activeBrand = myBrands.find((b) => b.active)
  const activeBrandProductCount = activeBrand
    ? (selections[activeBrand.name]?.products || []).filter((n) => activeBrand.products[n]).length
    : 0
  const quantityNumber = Number(String(quantity).replace(/\D/g, '')) || 1
  const totalRenders = activeBrandProductCount * refAdIds.length * formats.length * quantityNumber

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

  // BB-1: re-clicking the already-active brand card (e.g. a user jumping
  // back to Step 1 via the wizard's step pills just to double-check it) is
  // a no-op — it must NOT reset refAdIds, or every ad picked in Step 2 gets
  // silently wiped with no warning.
  const pickRefBrand = useCallback((brand) => {
    if (brand === refBrand) return
    setRefBrandState(brand)
    setRefAdIds([])
  }, [refBrand])

  const toggleRefAd = useCallback((id) => {
    setRefAdIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  // BB-2: single-select — picks brand `index` as the one active brand.
  // Re-clicking the already-active brand is a no-op (nothing to reset here
  // today, but matches pickRefBrand's same-value-is-a-no-op convention).
  const selectMyBrand = useCallback((index) => {
    const key = productBrands[index]?.key
    if (!key || key === activeBrandKey) return
    setActiveBrandKey(key)
  }, [productBrands, activeBrandKey])

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

  // BB-6: bulk version, jumped to from AdGrid.jsx's multi-select toolbar —
  // reuses CollectedResults.jsx's existing select-mode/전체 선택 UI pattern
  // rather than a new one. All adIds must already share one brand (AdGrid
  // validates this before calling in) since Step 1/2 are inherently
  // single-reference-brand.
  const prefillFromAds = useCallback((brand, adIds) => {
    setRefBrandState(brand)
    setRefAdIds(adIds)
    setStepRaw(2)
    go('studio')
    showToast(`'${brand}' 광고 ${adIds.length}개가 레퍼런스로 선택됐습니다`)
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

    // BB-2: myBrands.active is now genuinely single-select (see
    // activeBrandKey above), so this is always exactly one brand — no more
    // "N brands selected but only generating for the first" surprise.
    const b = myBrands.find((br) => br.active)
    if (!b) {
      showToast('생성할 브랜드를 먼저 선택하세요')
      return
    }
    if (formats.length === 0) {
      showToast('포맷을 1개 이상 선택하세요')
      return
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
        myBrands, selectMyBrand,
        selections, toggleProductSelection,
        productRefSelections, toggleImageKeySelected, toggleAllImageKeysSelected,
        selectProductRefPrice, selectProductRefPromotion, toggleProductRefHookSelection,
        formats, toggleFormat,
        quantity, setQuantity,
        totalRenders, activeBrandProductCount,
        styleIntensity, setStyleIntensity,
        instructions, setInstructions,
        prefillFromAd, prefillFromAds,
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
