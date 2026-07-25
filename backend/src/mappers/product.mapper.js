// Maps one raw Cafe24 product + its GPT analysis result to the sheet row.
// Pure module: no config/env imports, so it stays unit-testable in isolation.
// The caller supplies the brand's display name (not the internal brand key)
// since this module has no access to config.brands.

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

function pick(obj, keys) {
  if (obj == null) return undefined
  for (const key of keys) {
    const value = obj[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

export function mapProduct(brand, rawProduct, analysis, { syncedAt = new Date().toISOString() } = {}) {
  const productId = pick(rawProduct, ['product_no', 'productNo']) ?? ''
  const imageUrl = pick(rawProduct, ['list_image', 'small_image', 'detail_image', 'tiny_image']) ?? ''

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
    'Image URL': imageUrl,
    'Last Synced': syncedAt,
  }
}

export function toRow(mappedProduct) {
  return PRODUCT_COLUMNS.map((column) => mappedProduct[column] ?? '')
}
