// Maps one raw Cafe24 product + its GPT analysis result to the sheet row.
// Pure module: no config/env imports, so it stays unit-testable in isolation.
// The caller supplies the brand's display name (not the internal brand key)
// since this module has no access to config.brands.

import { pick } from './pickField.js'

export const PRODUCT_COLUMNS = [
  'Product ID',
  'Brand',
  'Product Name',
  'Price',
  'Promotion Info',
  'Ad Hook Copy',
  '제품특성',
  '효과효능',
  '페인포인트',
  '권위신뢰',
  'Image URL',
  'Last Synced',
]

const IMAGE_FIELD_PRIORITY = ['detail_image', 'list_image', 'small_image', 'tiny_image']
const MAX_IMAGES = 20

// Cafe24's product detail endpoint exposes 4 differently-sized renditions
// of ONE product photo (detail/list/small/tiny image folders), not a real
// photo gallery — confirmed against the live API: explicitly requesting
// additional_image/sub_images/images via `fields` comes back empty, and
// GET /admin/products/{no}/images 404s "No API found". So only the
// best-quality rendition is kept here rather than all 4 (treating them as
// 4 separate images would show the same photo repeatedly and make the
// "이미지 N장" gallery count misleading). The array/newline-joined shape
// (matching ad.mapper.js's Image Links) is kept anyway, so nothing here
// needs to change if Cafe24 ever exposes genuine additional photos.
function collectImages(rawProduct) {
  const primary = IMAGE_FIELD_PRIORITY
    .map((field) => rawProduct?.[field])
    .find((url) => typeof url === 'string' && url.trim())
  return primary ? [...new Set([primary])].slice(0, MAX_IMAGES) : []
}

export function mapProduct(brand, rawProduct, analysis, { syncedAt = new Date().toISOString() } = {}) {
  const productId = pick(rawProduct, ['product_no', 'productNo']) ?? ''
  const images = collectImages(rawProduct)

  return {
    'Product ID': String(productId),
    'Brand': brand ?? '',
    'Product Name': pick(rawProduct, ['product_name', 'productName']) ?? '',
    'Price': pick(rawProduct, ['price', 'retail_price']) ?? '',
    'Promotion Info': analysis?.['프로모션정보'] ?? '없음',
    'Ad Hook Copy': analysis?.['광고 후킹 카피'] ?? '없음',
    '제품특성': analysis?.['제품특성'] ?? '없음',
    '효과효능': analysis?.['효과효능'] ?? '없음',
    '페인포인트': analysis?.['페인포인트'] ?? '없음',
    '권위신뢰': analysis?.['권위/신뢰/인증'] ?? '없음',
    'Image URL': images.join('\n'),
    'Last Synced': syncedAt,
  }
}

export function toRow(mappedProduct) {
  return PRODUCT_COLUMNS.map((column) => mappedProduct[column] ?? '')
}
