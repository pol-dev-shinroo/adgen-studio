// Deliberate, small parallel implementation of src/api/adaptAd.js's
// toEmbeddableImageUrl — there's no practical way to share one module
// between the Vite frontend and this Express backend, so this is a
// second copy of the same logic, not a bug. Same file's DRIVE_FILE_ID_PATTERN
// comment in imageIO.service.js already flags the same regex living twice
// for the same reason.
//
// Drive's webViewLink (".../file/d/<id>/view") is an HTML viewer page, not
// raw image bytes — imageIO.service.js's uploadGeneratedImage returns that
// link verbatim (it's what gets stored as the sheet's "Image URL"), so
// anything that needs to actually fetch/display the image bytes (not just
// link to the Drive page) has to convert it to Drive's public thumbnail
// endpoint first, same as the frontend already does for every <img src>.
export function toEmbeddableImageUrl(driveViewLink, size = 'w1000') {
  const id = driveViewLink?.match(/\/file\/d\/([^/]+)/)?.[1]
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=${size}` : driveViewLink
}
