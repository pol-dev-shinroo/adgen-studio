// Maps one rendered image's metadata to the "생성결과" sheet row. Pure
// module, same convention as ad.mapper.js/product.mapper.js: no config/env
// imports, unit-testable in isolation.

// One entry per swapped text element — same shape copywriting.service.js's
// writeReplacementCopy resolves per reference ad. location is a free-text
// description ("top-center within red-bordered box"), not coordinates —
// there is no bounding-box data anywhere in this pipeline yet, so this can
// only ever be a labeled copy list, not a pixel-positioned overlay.
export interface Replacement {
  location: string
  original_text: string
  new_text: string
}

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
  'Replacements JSON': string
  'Reference Ad Image URL': string
  'Product Reference Image URL': string
  'Style Reference Image URL': string
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
  // Appended when the Figma export feature needed the replacement-copy data
  // that runJob previously computed and threw away — see figma-export
  // endpoint (generation.controller.js) for the consumer.
  'Replacements JSON',
  // Part V: snapshotted at generation time — nothing to look up live for
  // these, since a product/style reference selection can change after the
  // fact. Style Reference Image URL is blank when no style reference was
  // used for that particular render, same "optional, empty when absent"
  // convention every other optional column here already follows.
  'Reference Ad Image URL',
  'Product Reference Image URL',
  'Style Reference Image URL',
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
  replacements?: Replacement[]
  createdAt?: string
  referenceAdImageUrl?: string
  productReferenceImageUrl?: string
  styleReferenceImageUrl?: string
}

export function mapGeneratedAd({
  generationId, brand, referenceAdId, format, styleIntensity, instructions, imageUrl, productId, replacements,
  createdAt = new Date().toISOString(),
  referenceAdImageUrl, productReferenceImageUrl, styleReferenceImageUrl,
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
    'Replacements JSON': JSON.stringify(replacements ?? []),
    'Reference Ad Image URL': referenceAdImageUrl || '',
    'Product Reference Image URL': productReferenceImageUrl || '',
    // Blank when no style reference was selected for this render — Part
    // Q/T's referenceSheetImageUrl was already optional at the job level.
    'Style Reference Image URL': styleReferenceImageUrl || '',
  }
}

export function toRow(mappedGeneratedAd: GeneratedAdRow): string[] {
  return GENERATED_AD_COLUMNS.map((column) => mappedGeneratedAd[column] ?? '')
}
