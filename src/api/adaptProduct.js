import { formatKRW } from '../utils/currency.js'
import { toEmbeddableImageUrl } from './adaptAd.js'

// Adapts a raw sheet product row (keyed by the 12-column PRODUCT_COLUMNS
// layout — see backend/src/mappers/product.mapper.js) into the shape the
// products UI (ProductCard/ProductDetailModal/ProductBrowser, and Studio
// Step 3) is built around. Mirrors adaptAd.js's role for the ad feed.
export function adaptProduct(product) {
  const images = (product['Image URL'] || '').split('\n').filter(Boolean)
  const extractedImageLink = product['Extracted Image URL'] || ''

  return {
    id: product['Product ID'],
    brand: product['Brand'] || '',
    name: product['Product Name'] || '(이름 없음)',
    priceFormatted: formatKRW(product['Price']),
    promotionInfo: product['Promotion Info'] || '없음',
    adHookCopy: product['Ad Hook Copy'] || '없음',
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
    extractedImage: extractedImageLink ? toEmbeddableImageUrl(extractedImageLink) : '',
    extractedAt: product['Extracted At'] || '',
    raw: product,
  }
}
