import { createContext, useContext, useState, useCallback } from 'react'
import { useNavigation } from './NavigationContext.jsx'
import { useGallery } from './GalleryContext.jsx'
import { useProducts } from './ProductsContext.jsx'
import { useProductRefSelections } from '../hooks/useProductRefSelections.js'

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
  // Part DD: replaces the old standalone formats/quantity — each selected
  // reference ad now gets its OWN formats/quantity (e.g. ad A -> 1 image,
  // ad B -> 2 images, possibly different formats), not one shared setting
  // applied uniformly across every selected ad. Keyed by adId; seeded with
  // a sane default the moment toggleRefAd adds that ad, deleted the moment
  // it's removed — never left orphaned once its ad is no longer selected.
  const [refAdConfigs, setRefAdConfigs] = useState({})
  const [styleIntensity, setStyleIntensity] = useState(60)
  // Part LL: 3 independently-settable creative decisions the old single 0-100
  // slider used to force together silently (see renderImage.service.js's
  // styleInstructionFor / copywriting.service.js's styleIntensityInstructionFor
  // for what each one actually drives on the backend). Seeded from the
  // slider's own initial value so a user who never touches the checkboxes
  // gets exactly the old thresholds; updateStyleIntensity below keeps them
  // in sync live while the slider is being dragged, but each is independently
  // toggleable by hand afterward.
  const [freeRestyle, setFreeRestyle] = useState(styleIntensity > 33)
  const [strongReferenceInfluence, setStrongReferenceInfluence] = useState(styleIntensity > 66)
  const [verbatimCopy, setVerbatimCopy] = useState(styleIntensity > 66)
  // Part MM: a 4th, independent checkbox — not wired to the slider at all
  // (deliberately: this is an opt-in creative-rewrite mode, not something
  // dragging the slider should ever silently turn on) and takes priority
  // over verbatimCopy entirely on the backend when checked. Defaults false.
  const [creativeCopy, setCreativeCopy] = useState(false)
  const [instructions, setInstructions] = useState('')

  const myBrands = productBrands.map((b) => ({ ...b, active: b.key === activeBrandKey }))

  const selections = {}
  myBrands.filter((b) => b.active).forEach((b) => {
    const override = productOverrides[b.name]
    const validNames = (override?.products || []).filter((n) => b.products[n])
    selections[b.name] = validNames.length > 0 ? { products: validNames } : defaultSelectionFor(b)
  })

  // BB-4: real up-front render-count preview, shown on Step 4 before the
  // user commits — mirrors goNext's own totalRenders math exactly so what's
  // shown here never drifts from what actually gets billed. Without this,
  // only the per-product multiplier was ever surfaced (Step 3's own "N개
  // 제품 × 선택한 포맷/수량에 따라..." hint) — the refAdIds multiplier picked
  // back in Step 2 was easy to forget about by Step 4.
  //
  // Part DD: each selected ad now carries its own formats/quantity (no more
  // single shared multiplier), so this sums formats.length x quantity PER
  // ad rather than multiplying by one shared figure — same math as the
  // backend's computeTotalRenders(products, refAdConfigs) in helpers.js, so
  // the two can never drift apart either.
  const activeBrand = myBrands.find((b) => b.active)
  const activeBrandProductCount = activeBrand
    ? (selections[activeBrand.name]?.products || []).filter((n) => activeBrand.products[n]).length
    : 0
  const totalRenders = activeBrandProductCount * refAdIds.reduce((sum, adId) => {
    const cfg = refAdConfigs[adId]
    const qtyNumber = cfg ? Number(String(cfg.quantity).replace(/\D/g, '')) || 1 : 0
    return sum + (cfg ? cfg.formats.length * qtyNumber : 0)
  }, 0)

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

    // Part EE: shared derivation — see useProductRefSelections.js for why
    // this now lives in one place instead of being computed inline here.
    const { galleryItems, availablePrices, availablePromotions, availableAdHooks } = useProductRefSelections(b, selectedNames)
    const galleryKeys = new Set(galleryItems.map((item) => item.key))

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

  // Part LL: single source of truth for "does the currently active brand
  // actually have a style reference / ad-copy override selected yet" —
  // previously only computed inline inside goNext (as brandRefSel/
  // hasAdCopyOverride/checkedItems/styleReferenceItem below), now also
  // needed by StepGenerationOptions.jsx to grey out checkboxes 2/3 when
  // they'd have no effect. Reused by goNext itself instead of re-deriving
  // it a second, possibly-divergent way.
  const brandRefSel = activeBrand ? productRefSelections[activeBrand.name] : null
  const checkedItemsForBrand = (brandRefSel?.galleryItems || [])
    .filter((item) => brandRefSel.selectedImageKeys.includes(item.key))
  const styleReferenceItemForBrand = checkedItemsForBrand.find((item) => item.ref.type !== 'product') || null
  const hasStyleReferenceForBrand = !!styleReferenceItemForBrand
  const hasAdCopyOverrideForBrand = !!brandRefSel && !!(
    brandRefSel.selectedPrice || brandRefSel.selectedPromotion || brandRefSel.selectedAdHooks.length > 0
  )

  // BB-1: re-clicking the already-active brand card (e.g. a user jumping
  // back to Step 1 via the wizard's step pills just to double-check it) is
  // a no-op — it must NOT reset refAdIds, or every ad picked in Step 2 gets
  // silently wiped with no warning.
  const pickRefBrand = useCallback((brand) => {
    if (brand === refBrand) return
    setRefBrandState(brand)
    setRefAdIds([])
  }, [refBrand])

  // Part DD: keeps refAdConfigs in lockstep with refAdIds — a newly-selected
  // ad is seeded with a sane default (mirrors the old global DEFAULT_FORMATS/
  // '1장' default) so StepGenerationOptions always has something to render
  // for it; a deselected ad's entry is deleted outright rather than left
  // orphaned (it would otherwise keep counting toward totalRenders/the
  // goNext payload for an ad that's no longer even selected).
  const toggleRefAd = useCallback((id) => {
    setRefAdIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setRefAdConfigs((prev) => {
      if (prev[id]) {
        const { [id]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [id]: { formats: DEFAULT_FORMATS, quantity: '1장' } }
    })
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

  // Part LL: the "checked dynamically upon dragging" behavior — re-derives
  // all 3 checkboxes' defaults live every time the slider itself moves,
  // without overwriting a value the user may have already hand-toggled
  // independently between drags (each drag re-derives fresh from the new
  // slider position, same as the very first render's initial useState above).
  const updateStyleIntensity = useCallback((value) => {
    setStyleIntensity(value)
    setFreeRestyle(value > 33)
    setStrongReferenceInfluence(value > 66)
    setVerbatimCopy(value > 66)
  }, [])

  // Part DD: per-ad replacements for the old global toggleFormat/setQuantity
  // — both are no-ops if `adId` somehow isn't in refAdConfigs yet (e.g. a
  // stray call before toggleRefAd has seeded it), same defensive posture as
  // toggleProductSelection's own brand-not-found guard above.
  const toggleAdFormat = useCallback((adId, fmt) => {
    setRefAdConfigs((prev) => {
      const cfg = prev[adId]
      if (!cfg) return prev
      const nextFormats = cfg.formats.includes(fmt) ? cfg.formats.filter((f) => f !== fmt) : [...cfg.formats, fmt]
      return { ...prev, [adId]: { ...cfg, formats: nextFormats } }
    })
  }, [])

  const setAdQuantity = useCallback((adId, qty) => {
    setRefAdConfigs((prev) => {
      const cfg = prev[adId]
      if (!cfg) return prev
      return { ...prev, [adId]: { ...cfg, quantity: qty } }
    })
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
    // Part DD: replaces the old single `formats.length === 0` check — every
    // selected ad now needs its OWN non-empty formats list, so a single
    // shared check no longer covers it. Names the specific ad so the user
    // knows which one still needs a format picked, same specificity as the
    // missingExtraction toast below.
    const adMissingFormat = refAdIds.find((adId) => (refAdConfigs[adId]?.formats.length ?? 0) === 0)
    if (adMissingFormat) {
      showToast(`AD ${adMissingFormat}의 포맷을 1개 이상 선택하세요`)
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

    // Part P (re-sourced in Part S): real, user-picked copy from the
    // product-reference panel (the SAME brand `b` the rest of this payload
    // is already built for), used instead of the backend's Pinecone lookup
    // when the user actually touched the panel. Only sent if at least one
    // of the three is actually populated — omitted (null) otherwise, so
    // anyone who never touches the panel gets exactly the old behavior.
    // Part LL: brandRefSel/hasAdCopyOverride*/checkedItems*/
    // styleReferenceItem* now come from the shared derivation above (`b`
    // here is always the same lookup as `activeBrand`), rather than being
    // recomputed a second time in here.
    const adCopyOverride = hasAdCopyOverrideForBrand ? {
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
    const productImageOverrides = {}
    selectedProducts.forEach(({ product }) => {
      const checkedForProduct = checkedItemsForBrand.filter(
        (item) => item.product.productId === product.productId && item.ref.type === 'product'
      )
      if (checkedForProduct.length === 1) {
        productImageOverrides[product.productId] = checkedForProduct[0].ref.imageUrl
      }
    })

    const referenceSheetImageUrl = styleReferenceItemForBrand?.ref.imageUrl || null
    // Part DD: which extracted-reference `type` the style reference came
    // from (e.g. 'model', 'badge') — lets renderImage.service.js tell a
    // face-swap-eligible model reference apart from a badge/logo one at
    // maximum style intensity. null whenever no style reference is set,
    // same optionality as referenceSheetImageUrl itself.
    const styleReferenceType = styleReferenceItemForBrand?.ref.type || null

    const brandPayload = { key: b.key, productIds: selectedProducts.map(({ product }) => product.productId) }
    if (Object.keys(productImageOverrides).length > 0) {
      brandPayload.productImageOverrides = productImageOverrides
    }

    // Part DD: refAdConfigs replaces the old flat refAdIds/formats/quantity
    // — each entry carries its own ad's formats/quantity, converting the
    // chip-string quantity ('2장') to a plain integer the same way the old
    // single `qty` conversion did.
    const refAdConfigsPayload = refAdIds.map((adId) => ({
      adId,
      formats: refAdConfigs[adId].formats,
      quantity: Number(String(refAdConfigs[adId].quantity).replace(/\D/g, '')) || 1,
    }))

    startGeneration({
      refBrand,
      refAdConfigs: refAdConfigsPayload,
      brand: brandPayload,
      styleIntensity,
      freeRestyle,
      strongReferenceInfluence,
      verbatimCopy,
      creativeCopy,
      instructions,
      adCopyOverride,
      referenceSheetImageUrl,
      styleReferenceType,
    })

    showToast('생성 잡이 시작됐습니다 — 결과 갤러리에서 진행 상황을 확인하세요')
    // Switch tabs immediately, before the job's first poll even lands —
    // same convention as prefillFromAd's synchronous go('studio') elsewhere
    // in this file, rather than the old mock's artificial setTimeout delay.
    go('gallery')
  }, [
    step, refAdIds, myBrands, refAdConfigs, selections, productRefSelections, refBrand, styleIntensity,
    freeRestyle, strongReferenceInfluence, verbatimCopy, creativeCopy, brandRefSel, checkedItemsForBrand,
    styleReferenceItemForBrand, hasAdCopyOverrideForBrand, instructions, startGeneration, showToast, go,
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
        refAdConfigs, toggleAdFormat, setAdQuantity,
        totalRenders, activeBrandProductCount,
        styleIntensity, setStyleIntensity, updateStyleIntensity,
        freeRestyle, setFreeRestyle, strongReferenceInfluence, setStrongReferenceInfluence,
        verbatimCopy, setVerbatimCopy, creativeCopy, setCreativeCopy,
        hasStyleReferenceForBrand, hasAdCopyOverrideForBrand,
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
