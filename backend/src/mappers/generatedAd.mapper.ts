// Maps one rendered image's metadata to the "생성결과" sheet row. Pure
// module, same convention as ad.mapper.js/product.mapper.js: no config/env
// imports, unit-testable in isolation.

export interface GeneratedAdRow {
  'Generation ID': string
  'Brand': string
  'Reference Ad ID': string
  'Format': string
  'Style Intensity': string
  'Instructions': string
  'Image URL': string
  'Status': string
  'Created At': string
  'Product ID': string
}

export const GENERATED_AD_COLUMNS: (keyof GeneratedAdRow)[] = [
  'Generation ID',
  'Brand',
  'Reference Ad ID',
  'Format',
  'Style Intensity',
  'Instructions',
  'Image URL',
  'Status',
  'Created At',
  // Appended, not inserted — same convention as EXTRACTION_COLUMNS/
  // OVERRIDE_COLUMNS in product.mapper.js, so existing rows/columns never
  // shift. Added when Step 3 gained multi-product selection: one render can
  // now be attributed to a specific product within a multi-product batch.
  'Product ID',
]

export interface MapGeneratedAdInput {
  generationId?: string
  brand?: string
  referenceAdId?: string
  format?: string
  styleIntensity?: number | string
  instructions?: string
  imageUrl?: string
  productId?: string
  createdAt?: string
}

export function mapGeneratedAd({
  generationId, brand, referenceAdId, format, styleIntensity, instructions, imageUrl, productId,
  createdAt = new Date().toISOString(),
}: MapGeneratedAdInput): GeneratedAdRow {
  return {
    'Generation ID': String(generationId ?? ''),
    'Brand': brand ?? '',
    'Reference Ad ID': String(referenceAdId ?? ''),
    'Format': format ?? '',
    'Style Intensity': String(styleIntensity ?? ''),
    'Instructions': instructions || '',
    'Image URL': imageUrl ?? '',
    // Every freshly-rendered image starts unapproved — approveResult is a
    // separate, explicit user action in the Gallery.
    'Status': '미승인',
    'Created At': createdAt,
    'Product ID': String(productId ?? ''),
  }
}

export function toRow(mappedGeneratedAd: GeneratedAdRow): string[] {
  return GENERATED_AD_COLUMNS.map((column) => mappedGeneratedAd[column] ?? '')
}
