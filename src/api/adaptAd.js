// Adapts a raw sheet ad row (keyed by the 22-column AD_COLUMNS layout — see
// backend/src/mappers/ad.mapper.js) into the shape the feed UI components
// (AdCard/AdGrid/BrandFilterBar/CollectedResults) were originally built
// around from src/data/initialAds.js: { id, brand, title, gradient, media,
// desc, live, image }. Adapting here (rather than reshaping every mock-data
// consumer) keeps the change localized to one file.

const GRADIENTS = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']

function gradientFor(id) {
  let hash = 0
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return GRADIENTS[hash % GRADIENTS.length]
}

function firstLink(newlineJoined) {
  return (newlineJoined || '').split('\n').find(Boolean) || ''
}

// The sheet stores Drive's webViewLink (.../file/d/<id>/view — an HTML
// viewer page, not raw image bytes), so it can't be used directly as an
// <img src>. Convert it to Drive's public thumbnail endpoint instead, which
// serves the actual image for anyone-with-link files. Exported so the detail
// modal can convert the rest of the gallery (adaptAd only converts the one
// card-thumbnail link).
export function toEmbeddableImageUrl(driveViewLink, size = 'w1000') {
  const id = driveViewLink.match(/\/file\/d\/([^/]+)/)?.[1]
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=${size}` : driveViewLink
}

function formatScrapedDate(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function buildTitle(ad) {
  const title = ad['Title']?.trim()
  const bottom = ad['Bottom Content']?.trim()
  const post = ad['Post Content']?.trim()
  const line1 = title || (post ? post.slice(0, 50) : '(제목 없음)')
  return bottom ? `${line1}\n${bottom}` : line1
}

// Part N/O: at most one composed reference-sheet image plus one copy
// object per ad, not a per-entity array like products' extraction column —
// see adImageExtraction.service.js. Safe fallback to null for ads that
// predate these columns or have malformed JSON — never throws.
function parseExtractedReference(raw) {
  try {
    const parsed = JSON.parse(raw || 'null')
    if (!parsed || typeof parsed !== 'object' || !parsed.imageUrl) return null
    // Same Drive-webViewLink-to-thumbnail-URL conversion every other
    // extracted image in this app needs before it's usable as an <img src>.
    return { ...parsed, imageUrl: toEmbeddableImageUrl(parsed.imageUrl, 'w1000') }
  } catch {
    return null
  }
}

function parseExtractedCopy(raw) {
  try {
    const parsed = JSON.parse(raw || 'null')
    if (!parsed || typeof parsed !== 'object') return null
    return {
      price: typeof parsed.price === 'string' ? parsed.price : null,
      promotion: typeof parsed.promotion === 'string' ? parsed.promotion : null,
      adHooks: Array.isArray(parsed.adHooks) ? parsed.adHooks.filter((h) => typeof h === 'string') : [],
    }
  } catch {
    return null
  }
}

export function adaptAd(ad) {
  const id = ad['Ad Archive ID']
  const dateStr = formatScrapedDate(ad['Date Scraped'])
  const format = ad['Display Format'] || ad['Platforms'] || ''
  const imageLink = firstLink(ad['Archived Image Links']) || ad['Archived Thumbnail'] || ''

  return {
    id,
    // Primary label is the search keyword (matches how Drive folders are
    // grouped); the ad's real Facebook Page name survives separately as
    // pageName since it's often noisy/inconsistent (e.g. "antical.1").
    brand: ad['Search Keyword'] || ad['Brand'] || '(브랜드 미상)',
    pageName: ad['Brand'] || '',
    title: buildTitle(ad),
    gradient: gradientFor(id),
    media: ad['Video Link'] ? 'video' : 'image',
    desc: [dateStr && `${dateStr} 수집`, format].filter(Boolean).join(' · '),
    live: ad['Status'] === '게재중',
    image: imageLink ? toEmbeddableImageUrl(imageLink, 'w600') : '',
    images: (ad['Archived Image Links'] || '').split('\n').filter(Boolean),
    searchKeyword: ad['Search Keyword'] || '',
    extractedReference: parseExtractedReference(ad['Extracted Reference JSON']),
    extractedCopy: parseExtractedCopy(ad['Extracted Copy JSON']),
    raw: ad,
  }
}
