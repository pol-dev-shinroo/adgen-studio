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
export function adaptGeneratedResult(row) {
  const imageLink = row['Image URL'] || ''

  return {
    id: row['Generation ID'],
    brand: row['Brand'] || '',
    referenceAdId: row['Reference Ad ID'] || '',
    format: row['Format'] || '',
    styleIntensity: row['Style Intensity'] || '',
    instructions: row['Instructions'] || '',
    image: imageLink ? toEmbeddableImageUrl(imageLink, 'w600') : '',
    originalImage: imageLink,
    status: 'done',
    approved: row['Status'] === '승인',
    createdAt: row['Created At'] || '',
    raw: row,
  }
}
