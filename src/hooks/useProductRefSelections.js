// Part EE: pulled out of StudioContext.jsx, which used to compute this
// ~30-line derivation inline, once per active brand. AIStudioContext.jsx
// needs the exact same derivation for its own single selected product, so
// this is now the one place it exists — both contexts call it and layer
// their own override state (selectedImageKeys/selectedPrice/...) on top,
// since which of these is actually chosen varies per context and isn't this
// function's concern. Not a stateful hook (no useState/useEffect of its
// own) — named/placed under src/hooks/ per this app's convention (see
// useJobPolling.js) since it's called from render bodies the same way a
// real hook would be.
//
// brand: one entry from ProductsContext's `brands` (has a `.products`
// dict keyed by name — see ProductsContext.jsx's groupByBrand).
// selectedNames: which of that brand's products are currently selected.
// Returns the four DERIVED lists a reference-image gallery/copy-picker
// needs — never the selected/override side, which is caller-specific.
export function useProductRefSelections(brand, selectedNames) {
  const validNames = selectedNames.filter((n) => brand.products[n])

  const galleryItems = validNames.flatMap((name) => {
    const product = brand.products[name]
    return product.extractedReferences.map((ref, index) => ({
      key: `${name}::${index}`, productName: name, product, ref,
    }))
  })

  const availablePrices = [...new Set(validNames.map((n) => brand.products[n].price).filter((v) => v && v !== '-'))]
  const availablePromotions = [
    ...new Set(validNames.map((n) => brand.products[n].promotionInfo).filter((v) => v && v !== '없음')),
  ]
  const availableAdHooks = [
    ...new Set(validNames.map((n) => brand.products[n].adHookCopy).filter((v) => v && v !== '없음')),
  ]

  return { galleryItems, availablePrices, availablePromotions, availableAdHooks }
}
