// Maps one raw Cafe24 product + its GPT analysis result to the sheet row.
// Pure module: no config/env imports, so it stays unit-testable in isolation.
// The caller supplies the brand's display name (not the internal brand key)
// since this module has no access to config.brands.

import { pick } from './pickField.js'

// Columns the sync job (mapProduct/upsertProductRows) owns and rewrites on
// every resync.
export interface ProductSyncFields {
  'Product ID': string
  'Brand': string
  'Product Name': string
  'Price': string
  'Promotion Info': string
  'Ad Hook Copy': string
  '제품특성': string
  '효과효능': string
  '페인포인트': string
  '권위신뢰': string
  'Image URL': string
  'Last Synced': string
}

export const SYNC_COLUMNS: (keyof ProductSyncFields)[] = [
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

// Written only by the separate image-extraction path (productImageExtraction
// .service.js's updateProductField), never by the sync job. Appended, not
// inserted, so the live sheet's existing 12-column header/data stay in
// place. Kept as their own export (not just tacked onto PRODUCT_COLUMNS)
// so productSheets.service.js's upsert can restrict its resync writes to
// SYNC_COLUMNS only — a resync's mapProduct() output never has these keys,
// so a full-row overwrite would otherwise blank out extraction results
// every time a product's sheet row is refreshed.
export interface ProductExtractionFields {
  'Extracted Image URL': string
  'Extracted At': string
}

export const EXTRACTION_COLUMNS: (keyof ProductExtractionFields)[] = ['Extracted Image URL', 'Extracted At']

// Same reasoning as EXTRACTION_COLUMNS, for the same reason: Price/
// Promotion Info/Ad Hook Copy are all in SYNC_COLUMNS, so the resync job
// rewrites them every time. A user's manual correction written directly
// into one of those cells would get silently wiped on the next resync.
// These three "*_Override" columns give the user their own space the sync
// job never touches; adaptProduct.js is what actually decides whether to
// show the override or fall back to the synced value — this mapper stays
// unaware of that precedence, same as it's unaware of anything display-side.
export interface ProductOverrideFields {
  'Price Override': string
  'Promotion Info Override': string
  'Ad Hook Copy Override': string
}

export const OVERRIDE_COLUMNS: (keyof ProductOverrideFields)[] = [
  'Price Override', 'Promotion Info Override', 'Ad Hook Copy Override',
]

// The full sheet row shape — mapProduct() only ever produces
// ProductSyncFields (see its return type below); the extraction/override
// columns only ever get filled in by their own separate write paths, never
// by a resync. toRow() accepts a Partial<ProductRow> for exactly that
// reason — a bare mapProduct() output is a valid (if partial) row.
export type ProductRow = ProductSyncFields & ProductExtractionFields & ProductOverrideFields

export const PRODUCT_COLUMNS: (keyof ProductRow)[] = [...SYNC_COLUMNS, ...EXTRACTION_COLUMNS, ...OVERRIDE_COLUMNS]

const IMAGE_FIELD_PRIORITY = ['detail_image', 'list_image', 'small_image', 'tiny_image']
const MAX_IMAGES = 20

// The raw Cafe24 product detail object — externally versioned API JSON, so
// left loose the same way ad.mapper.ts's RawAdItem is, rather than modeled
// field-by-field for this phase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawCafe24Product = Record<string, any>

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
function collectImages(rawProduct: RawCafe24Product): string[] {
  const primary = IMAGE_FIELD_PRIORITY
    .map((field) => rawProduct?.[field])
    .find((url) => typeof url === 'string' && url.trim())
  return primary ? [...new Set([primary])].slice(0, MAX_IMAGES) : []
}

export interface MapProductOptions {
  syncedAt?: string
}

// analysis: the raw GPT few-shot analysis result — its Korean keys are
// specific to that analysis JSON shape (not the sheet contract this phase
// focuses on), so left loose rather than modeled here.
export function mapProduct(
  brand: string,
  rawProduct: RawCafe24Product,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: Record<string, any> | null | undefined,
  { syncedAt = new Date().toISOString() }: MapProductOptions = {}
): ProductSyncFields {
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

export function toRow(mappedProduct: Partial<ProductRow>): string[] {
  return PRODUCT_COLUMNS.map((column) => mappedProduct[column] ?? '')
}
