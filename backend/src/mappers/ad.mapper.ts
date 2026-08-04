// Maps one raw facebook-ads-scraper actor item to the 20-column sheet row.
// Pure module: no config/env imports, so it stays unit-testable in isolation.

import { pick } from './pickField.js'

// The raw scraper actor item's shape is Apify-controlled, externally
// versioned JSON (already handled defensively at runtime via pick()'s
// alias-list lookups for exactly this reason) — not a contract this project
// owns the way the sheet row below is, so it's left as `any` rather than
// modeled field-by-field for this phase, matching how loosely this data was
// always actually handled at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawAdItem = Record<string, any>

// The columns the scraper/collect job owns and rewrites on every resync —
// see AdExtractedReferenceFields below for the one column that doesn't
// belong to this group.
export interface AdSyncFields {
  'Ad Archive ID': string
  'Brand': string
  'Status': string
  'Start Date': string
  'End Date': string
  'Date Scraped': string
  'Search Keyword': string
  'Display Format': string
  'Post Content': string
  'Title': string
  'Bottom Content': string
  'CTA Text': string
  'Landing URL': string
  'Archived Image Links': string
  'Image Links': string
  'Video Link': string
  'Archived Thumbnail': string
  'Video Thumbnail': string
  // Surfaced by the test suite (not by this pass's own logic changes,
  // which is why it's flagged rather than "fixed"): unlike every other
  // column here, mapAd never wraps this one in String() — a numeric
  // collationCount (including 0) passes straight through. Typed as the
  // union it actually is rather than forced to `string`, so a future
  // consumer that assumes `.trim()`/`.split()` works on it is a compile
  // error, not a runtime surprise.
  'Variant Count': string | number
  'Platforms': string
  'Ad Library URL': string
  'Page ID': string
}

export const SYNC_COLUMNS: (keyof AdSyncFields)[] = [
  'Ad Archive ID',
  'Brand',
  'Status',
  'Start Date',
  'End Date',
  'Date Scraped',
  'Search Keyword',
  'Display Format',
  'Post Content',
  'Title',
  'Bottom Content',
  'CTA Text',
  'Landing URL',
  'Archived Image Links',
  'Image Links',
  'Video Link',
  'Archived Thumbnail',
  'Video Thumbnail',
  'Variant Count',
  'Platforms',
  'Ad Library URL',
  'Page ID',
]

// Part N: written only by adImageExtraction.service.js's own write path,
// never by a resync (mapAd() never produces this key — see mapAd's return
// type below) — appended, not inserted, same append-only rule as every
// other column addition in this project. A single JSON object (not an
// array like products' Part M column), since this pipeline always composes
// exactly one reference-sheet image per extraction, not a per-entity list.
export interface AdExtractedReferenceFields {
  'Extracted Reference JSON': string
}

export const EXTRACTED_REFERENCE_COLUMNS: (keyof AdExtractedReferenceFields)[] = ['Extracted Reference JSON']

// The full sheet row shape — mapAd() only ever produces AdSyncFields (see
// its return type below); the extracted-reference column only ever gets
// filled in by its own separate write path, never by a resync. toRow()
// accepts a Partial<AdRow> for exactly that reason — a bare mapAd() output
// is a valid (if partial) row.
export type AdRow = AdSyncFields & AdExtractedReferenceFields

export const AD_COLUMNS: (keyof AdRow)[] = [...SYNC_COLUMNS, ...EXTRACTED_REFERENCE_COLUMNS]

function toDateString(value: unknown): string {
  if (typeof value === 'number') return new Date(value * 1000).toISOString().slice(0, 10)
  return (value as string) || ''
}

const IMAGE_URL_KEYS = ['originalImageUrl', 'original_image_url', 'resizedImageUrl', 'resized_image_url']
const VIDEO_URL_KEYS = ['videoHdUrl', 'video_hd_url', 'videoSdUrl', 'video_sd_url']
const VIDEO_PREVIEW_KEYS = ['videoPreviewImageUrl', 'video_preview_image_url']

export interface MapAdOptions {
  keyword?: string
  scrapedAt?: string
}

export function mapAd(item: RawAdItem, { keyword = '', scrapedAt = new Date().toISOString() }: MapAdOptions = {}): AdSyncFields {
  const snapshot = item.snapshot || {}
  const images = pick(snapshot, ['images']) || []
  const cards = pick(snapshot, ['cards']) || []
  const videos = pick(snapshot, ['videos']) || []

  const adArchiveId = pick(item, ['adArchiveID', 'ad_archive_id', 'adArchiveId']) ?? ''
  const isActive = pick(item, ['isActive', 'is_active'])

  const body = pick(snapshot, ['body']) || {}
  const postContent = typeof body === 'string' ? body : body.text ?? ''

  const imageLinks = [...new Set(
    [...images, ...cards].map((entry: RawAdItem) => pick(entry, IMAGE_URL_KEYS)).filter(Boolean)
  )].join('\n')

  const cardVideoUrls = [...new Set(cards.map((c: RawAdItem) => pick(c, VIDEO_URL_KEYS)).filter(Boolean))]
  const videoLink = cardVideoUrls.length > 0
    ? cardVideoUrls.join('\n')
    : pick(videos[0], VIDEO_URL_KEYS) ?? ''

  const videoThumbnail = pick(videos[0], VIDEO_PREVIEW_KEYS)
    ?? cards.map((c: RawAdItem) => pick(c, VIDEO_PREVIEW_KEYS)).find(Boolean)
    ?? ''

  const platformsRaw = pick(item, ['publisherPlatform', 'publisher_platform'])
  const platforms = Array.isArray(platformsRaw) ? platformsRaw.join(', ') : platformsRaw || ''

  return {
    'Ad Archive ID': String(adArchiveId),
    'Brand': pick(item, ['pageName', 'page_name']) ?? '',
    'Status': isActive === true ? '게재중' : isActive === false ? '종료' : '',
    'Start Date': toDateString(pick(item, ['startDate', 'start_date'])),
    'End Date': toDateString(pick(item, ['endDate', 'end_date'])),
    'Date Scraped': scrapedAt,
    'Search Keyword': keyword,
    'Display Format': pick(snapshot, ['displayFormat', 'display_format']) ?? '',
    'Post Content': postContent,
    'Title': pick(snapshot, ['title']) ?? '',
    'Bottom Content': pick(snapshot, ['linkDescription', 'link_description']) ?? '',
    'CTA Text': pick(snapshot, ['ctaText', 'cta_text']) ?? '',
    'Landing URL': pick(snapshot, ['linkUrl', 'link_url']) ?? '',
    'Image Links': imageLinks,
    // Filled in by collect.service after the Drive uploads finish; the
    // mapper itself stays a pure raw-item → row transform.
    'Archived Image Links': '',
    'Archived Thumbnail': '',
    'Video Link': videoLink,
    'Video Thumbnail': videoThumbnail,
    'Variant Count': pick(item, ['collationCount', 'collation_count']) ?? '',
    'Platforms': platforms,
    'Ad Library URL': pick(item, ['url'])
      || (adArchiveId ? `https://www.facebook.com/ads/library/?id=${adArchiveId}` : ''),
    'Page ID': String(pick(item, ['pageId', 'page_id']) ?? ''),
  }
}

export function toRow(mappedAd: Partial<AdRow>): (string | number)[] {
  return AD_COLUMNS.map((column) => mappedAd[column] ?? '')
}
