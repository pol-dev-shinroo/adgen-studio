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
// serves the actual image for anyone-with-link files.
function toEmbeddableImageUrl(driveViewLink) {
  const id = driveViewLink.match(/\/file\/d\/([^/]+)/)?.[1]
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : driveViewLink
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

export function adaptAd(ad) {
  const id = ad['Ad Archive ID']
  const dateStr = formatScrapedDate(ad['Date Scraped'])
  const format = ad['Display Format'] || ad['Platforms'] || ''
  const imageLink = firstLink(ad['Archived Image Links']) || ad['Archived Thumbnail'] || ''

  return {
    id,
    brand: ad['Brand'] || '(브랜드 미상)',
    title: buildTitle(ad),
    gradient: gradientFor(id),
    media: ad['Video Link'] ? 'video' : 'image',
    desc: [dateStr && `${dateStr} 수집`, format].filter(Boolean).join(' · '),
    live: ad['Status'] === '게재중',
    image: imageLink ? toEmbeddableImageUrl(imageLink) : '',
    searchKeyword: ad['Search Keyword'] || '',
  }
}
