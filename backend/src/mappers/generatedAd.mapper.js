// Maps one rendered image's metadata to the "생성결과" sheet row. Pure
// module, same convention as ad.mapper.js/product.mapper.js: no config/env
// imports, unit-testable in isolation.

export const GENERATED_AD_COLUMNS = [
  'Generation ID',
  'Brand',
  'Reference Ad ID',
  'Format',
  'Style Intensity',
  'Instructions',
  'Image URL',
  'Status',
  'Created At',
]

export function mapGeneratedAd({
  generationId, brand, referenceAdId, format, styleIntensity, instructions, imageUrl,
  createdAt = new Date().toISOString(),
}) {
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
  }
}

export function toRow(mappedGeneratedAd) {
  return GENERATED_AD_COLUMNS.map((column) => mappedGeneratedAd[column] ?? '')
}
