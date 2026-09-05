import { toEmbeddableImageUrl } from './adaptAd.js'

// Adapts a raw "생성결과" sheet row (keyed by the 9-column
// GENERATED_AD_COLUMNS layout — see
// backend/src/mappers/generatedAd.mapper.js) into the shape the Gallery UI
// (ResultCard/GalleryScreen) is built around. Mirrors adaptAd.js/
// adaptProduct.js's role for their own screens.
//
// Every row here represents an already-finished render — generation
// .service.js only ever appends a row after a successful upload, so there's
// no "in-progress" or "failed" status to adapt from the sheet itself. The
// Gallery's in-progress cards come from the active job's own progress data
// instead (see GalleryContext.jsx), not from this adapter.
// Rows created before the 'Replacements JSON' column existed have neither
// the column nor any value in it — falls back to [] rather than throwing,
// same as every other "old row missing a newer column" case in this app.
function parseReplacements(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function adaptGeneratedResult(row) {
  const imageLink = row['Image URL'] || ''

  return {
    id: row['Generation ID'],
    brand: row['Brand'] || '',
    // Part DD: the competitor brand this render's reference ad belonged
    // to (distinct from `brand`, our own brand) — blank for rows that
    // predate this column, same "older row missing a newer column"
    // fallback every other optional field here already uses.
    refBrand: row['Ref Brand'] || '',
    referenceAdId: row['Reference Ad ID'] || '',
    // Part OO: which of OUR products this result actually used — needed to
    // seed a 생성 AI conversation from this result without re-asking the
    // user to re-pick a product they already chose once in 생성 스튜디오.
    productId: row['Product ID'] || '',
    format: row['Format'] || '',
    styleIntensity: row['Style Intensity'] || '',
    instructions: row['Instructions'] || '',
    image: imageLink ? toEmbeddableImageUrl(imageLink, 'w600') : '',
    originalImage: imageLink,
    status: 'done',
    approved: row['Status'] === '승인',
    createdAt: row['Created At'] || '',
    replacements: parseReplacements(row['Replacements JSON']),
    // Part V: snapshotted at generation time by generation.service.js's
    // runJob, adapted the same plain-URL way originalImage/image already
    // are. Rows that predate this part have none of these three columns —
    // falls back to '' like every other older-row-missing-column case in
    // this app, letting ResultCard.jsx's compare view simply skip whichever
    // of these it doesn't have rather than erroring.
    originalReferenceAdImage: row['Reference Ad Image URL'] || '',
    productReferenceImage: row['Product Reference Image URL'] || '',
    styleReferenceImage: row['Style Reference Image URL'] || '',
    raw: row,
  }
}
