import { getAllAds } from '../sheets/sheets.service.js'
import { getAllProducts } from '../sheets/productSheets.service.js'
import { findBrandDef, resolveProductReferenceImageUrl } from './helpers.js'

// Synchronous (well, awaited-but-fast) validation before any job/money is
// committed: unknown brand, unknown/unextracted product(s), or no matching
// reference ads all fail here with `.badRequest = true` rather than only
// surfacing after a job has already started (and, worse, after the
// expensive per-ad stages have already run). Enforced independently of the
// frontend's own pre-check (Studio Step 3/StudioContext.jsx's goNext also
// blocks on missing extraction) — the frontend can't be trusted as the only
// gate on a real-money endpoint.
//
// getAllProductsFn/getAllAdsFn are injected (defaulting to the real
// services) purely so this can be unit-tested without hitting Google
// Sheets — same pattern as analyzeProduct.service.js's pineconeService
// injection.
export async function prepareInputs(
  { refAdIds, brand },
  { getAllProductsFn = getAllProducts, getAllAdsFn = getAllAds } = {}
) {
  const brandDef = findBrandDef(brand?.key)
  if (!brandDef) {
    const err = new Error(`Unknown brand "${brand?.key}"`)
    err.badRequest = true
    throw err
  }

  const productIds = brand?.productIds || []
  if (productIds.length === 0) {
    const err = new Error('선택된 제품이 없습니다.')
    err.badRequest = true
    throw err
  }

  const allProducts = await getAllProductsFn()
  const brandProducts = allProducts.filter((p) => p['Brand'] === brandDef.name)

  const missingIds = []
  const resolved = []
  for (const productId of productIds) {
    const product = brandProducts.find((p) => p['Product ID'] === String(productId))
    if (!product) {
      missingIds.push(String(productId))
    } else {
      resolved.push({ productId: String(productId), product })
    }
  }
  if (missingIds.length > 0) {
    const err = new Error(
      `제품을 찾을 수 없습니다 (브랜드 "${brand.key}"): ${missingIds.join(', ')}`
    )
    err.badRequest = true
    throw err
  }

  // Part S: brand.productImageOverrides is an optional { [productId]: url }
  // map — see resolveProductReferenceImageUrl above for the verification
  // this goes through before an override is actually trusted.
  const productImageOverrides = brand?.productImageOverrides || {}
  const withFirstProductRef = resolved.map(({ productId, product }) => (
    { productId, product, extractedImageUrl: resolveProductReferenceImageUrl(product, productImageOverrides[productId]) }
  ))

  const unextracted = withFirstProductRef.filter(({ extractedImageUrl }) => !extractedImageUrl)
  if (unextracted.length > 0) {
    const names = unextracted.map(({ productId, product }) => product['Product Name'] || productId)
    const err = new Error(
      `다음 제품은 아직 참조 이미지가 추출되지 않았습니다 — 상품관리에서 먼저 추출해주세요: ${names.join(', ')}`
    )
    err.badRequest = true
    throw err
  }

  const products = withFirstProductRef.map(({ productId, extractedImageUrl }) => ({ productId, extractedImageUrl }))

  const allAds = await getAllAdsFn()
  const adsById = new Map(allAds.map((a) => [String(a['Ad Archive ID']), a]))
  const refAds = (refAdIds || []).map((id) => adsById.get(String(id))).filter(Boolean)
  if (refAds.length === 0) {
    const err = new Error('선택한 레퍼런스 광고를 찾을 수 없습니다.')
    err.badRequest = true
    throw err
  }

  return { brandDef, products, refAds }
}
