// Maps one raw facebook-ads-scraper actor item to the 20-column sheet row.
// Pure module: no config/env imports, so it stays unit-testable in isolation.

export const AD_COLUMNS = [
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
  'Image Links',
  'Archived Image Links',
  'Archived Thumbnail',
  'Video Link',
  'Video Thumbnail',
  'Variant Count',
  'Platforms',
  'Ad Library URL',
  'Page ID',
]

// The actor has shipped both camelCase and snake_case field names over time,
// so every lookup tries the known aliases in order.
function pick(obj, keys) {
  if (obj == null) return undefined
  for (const key of keys) {
    const value = obj[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

function toDateString(value) {
  if (typeof value === 'number') return new Date(value * 1000).toISOString().slice(0, 10)
  return value || ''
}

const IMAGE_URL_KEYS = ['originalImageUrl', 'original_image_url', 'resizedImageUrl', 'resized_image_url']
const VIDEO_URL_KEYS = ['videoHdUrl', 'video_hd_url', 'videoSdUrl', 'video_sd_url']
const VIDEO_PREVIEW_KEYS = ['videoPreviewImageUrl', 'video_preview_image_url']

export function mapAd(item, { keyword = '', scrapedAt = new Date().toISOString() } = {}) {
  const snapshot = item.snapshot || {}
  const images = pick(snapshot, ['images']) || []
  const cards = pick(snapshot, ['cards']) || []
  const videos = pick(snapshot, ['videos']) || []

  const adArchiveId = pick(item, ['adArchiveID', 'ad_archive_id', 'adArchiveId']) ?? ''
  const isActive = pick(item, ['isActive', 'is_active'])

  const body = pick(snapshot, ['body']) || {}
  const postContent = typeof body === 'string' ? body : body.text ?? ''

  const imageLinks = [...new Set(
    [...images, ...cards].map((entry) => pick(entry, IMAGE_URL_KEYS)).filter(Boolean)
  )].join('\n')

  const cardVideoUrls = [...new Set(cards.map((c) => pick(c, VIDEO_URL_KEYS)).filter(Boolean))]
  const videoLink = cardVideoUrls.length > 0
    ? cardVideoUrls.join('\n')
    : pick(videos[0], VIDEO_URL_KEYS) ?? ''

  const videoThumbnail = pick(videos[0], VIDEO_PREVIEW_KEYS)
    ?? cards.map((c) => pick(c, VIDEO_PREVIEW_KEYS)).find(Boolean)
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

export function toRow(mappedAd) {
  return AD_COLUMNS.map((column) => mappedAd[column] ?? '')
}
