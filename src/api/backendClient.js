// Exported so Cafe24CallbackPage.jsx (deliberately outside this app's normal
// Context/component tree — see that file) can hit the backend directly too,
// without duplicating the env-var-with-fallback logic.
export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

async function request(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request to ${path} failed (HTTP ${res.status})`)
  }
  return res.status === 204 ? null : res.json()
}

// Every archived ad row from the sheet, keyed by the 22-column layout
// (Ad Archive ID, Brand, Status, Archived Image Links, ...).
export function getAds() {
  return request('/api/ads')
}

export function startCollect(keywords, { resultsLimit } = {}) {
  return request('/api/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords, resultsLimit }),
  })
}

export function getJobStatus(jobId) {
  return request(`/api/collect/${jobId}`)
}

export function updateAdField(adArchiveId, field, value) {
  return request(`/api/ads/${encodeURIComponent(adArchiveId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field, value }),
  })
}

// items: [{ adArchiveId, action: 'delete'|'revert', previousValues? }]
export function discardAds(keyword, items) {
  return request('/api/ads/discard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, items }),
  })
}

// Every synced product row, keyed by the 12-column layout (Product ID,
// Brand, Product Name, Price, Promotion Info, Ad Hook Copy, ...). Pass a
// brand key to filter server-side.
export function getProducts(brand) {
  const query = brand ? `?brand=${encodeURIComponent(brand)}` : ''
  return request(`/api/products${query}`)
}

export function startProductSync(brand) {
  return request('/api/products/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brand }),
  })
}

export function getProductSyncStatus(jobId) {
  return request(`/api/products/sync/${jobId}`)
}

// Per-brand Cafe24/Pinecone connection + sync status for the product
// management screen. Always 200 — { brands: [], productSyncConfigured: false }
// when nothing is set up, rather than an error to handle specially.
export function getProductStatus() {
  return request('/api/products/status')
}

// DESTRUCTIVE — wipes every vector in that brand's Pinecone namespace.
export function resetPineconeNamespace(brand) {
  return request(`/api/products/${encodeURIComponent(brand)}/pinecone`, { method: 'DELETE' })
}

// Costs a real gpt-image-2 call server-side — only ever fired from an
// explicit user click (extract/재추출 button), never automatically.
export function extractProductImage(brand, productId) {
  return request(`/api/products/${encodeURIComponent(brand)}/${encodeURIComponent(productId)}/extract-image`, {
    method: 'POST',
  })
}

// fields: only whichever *_Override columns actually changed, e.g.
// { "Price Override": "45000" }.
export function updateProductFields(brand, productId, fields) {
  return request(`/api/products/${encodeURIComponent(brand)}/${encodeURIComponent(productId)}/fields`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
}

// Starts a real ad-generation job — the most expensive request in the app
// (chains vision/research/copywriting calls plus one image-generation-tool
// render per format x quantity combination). input: { refBrand, refAdIds,
// brand:{key,productId}, formats, quantity, styleIntensity, instructions }.
export function startGeneration(input) {
  return request('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function getGenerationStatus(jobId) {
  return request(`/api/generate/${jobId}`)
}

// Every generated-ad row from the sheet, keyed by the 9-column layout
// (Generation ID, Brand, Reference Ad ID, Format, Style Intensity,
// Instructions, Image URL, Status, Created At).
export function getGeneratedResults() {
  return request('/api/generate/results')
}

export function updateGeneratedStatus(generationId, status) {
  return request(`/api/generate/results/${encodeURIComponent(generationId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}
