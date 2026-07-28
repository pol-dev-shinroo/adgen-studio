import { formatKRW } from '../utils/currency.js'
import { toEmbeddableImageUrl } from './adaptAd.js'

// Adapts a raw sheet product row (keyed by the 12-column PRODUCT_COLUMNS
// layout — see backend/src/mappers/product.mapper.js) into the shape the
// products UI (ProductCard/ProductDetailModal/ProductBrowser, and Studio
// Step 3) is built around. Mirrors adaptAd.js's role for the ad feed.
export function adaptProduct(product) {
  const images = (product['Image URL'] || '').split('\n').filter(Boolean)
  const extractedImageLink = product['Extracted Image URL'] || ''

  // A resync rewrites Price/Promotion Info/Ad Hook Copy every time (see
  // product.mapper.js's SYNC_COLUMNS), so a user correction can't live in
  // those cells directly without getting silently wiped on the next sync —
  // same problem EXTRACTION_COLUMNS solved for the extracted image, solved
  // the same way here with a separate *_Override column per field. This
  // adapter is what actually applies the override-over-synced precedence;
  // product.mapper.js itself stays unaware of it.
  const priceOverrideRaw = product['Price Override'] || ''
  const promotionInfoOverrideRaw = product['Promotion Info Override'] || ''
  const adHookCopyOverrideRaw = product['Ad Hook Copy Override'] || ''

  return {
    id: product['Product ID'],
    brand: product['Brand'] || '',
    name: product['Product Name'] || '(이름 없음)',
    // Effective values — override if the user has set one, else the synced
    // value. Same field names as before this feature existed, so nothing
    // downstream (ProductDetailModal, Studio Step 3) needs to change to
    // pick this up automatically.
    priceFormatted: formatKRW(priceOverrideRaw || product['Price']),
    promotionInfo: promotionInfoOverrideRaw || product['Promotion Info'] || '없음',
    adHookCopy: adHookCopyOverrideRaw || product['Ad Hook Copy'] || '없음',
    productFeatures: product['제품특성'] || '없음',
    benefits: product['효과효능'] || '없음',
    painPoints: product['페인포인트'] || '없음',
    authorityTrust: product['권위신뢰'] || '없음',
    images,
    primaryImage: images[0] || '',
    lastSynced: product['Last Synced'] || '',
    // Extraction uploads go through the same Drive pipeline as archived ad
    // media, so the stored value is a webViewLink (HTML viewer page, not
    // raw image bytes) — needs the same thumbnail-endpoint conversion
    // adaptAd.js applies before it's usable as an <img src>.
    extractedImage: extractedImageLink ? toEmbeddableImageUrl(extractedImageLink, 'w800') : '',
    extractedAt: product['Extracted At'] || '',
    // Raw override-only values (blank if not overridden) — lets an edit
    // form tell "this field is currently overridden" apart from "this is
    // just the synced value", which the effective fields above can't do on
    // their own once a synced value happens to already look edited.
    priceOverrideRaw,
    promotionInfoOverrideRaw,
    adHookCopyOverrideRaw,
    raw: product,
  }
}
