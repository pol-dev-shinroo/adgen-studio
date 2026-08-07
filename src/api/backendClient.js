// Exported so Cafe24CallbackPage.jsx (deliberately outside this app's normal
// Context/component tree — see that file) can hit the backend directly too,
// without duplicating the env-var-with-fallback logic.
export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

// Part X: logout clears the session cookie, but the JWT itself is
// stateless — there's no server-side revocation, so a second, already-open
// tab (same browser, same cookie jar) keeps whatever React state it last
// rendered until it makes another request of its own. AuthContext registers
// itself here on mount so that ANY 401 from ANY call site (not just the
// initial GET /me hydration check) immediately clears `user`, bouncing that
// tab to the login screen the moment it next touches the backend, rather
// than silently erroring while still showing the logged-in app shell.
let unauthorizedHandler = null
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn
}

async function request(path, options) {
  // Part X: every route (except POST /api/auth/login and GET /api/health)
  // now requires the httpOnly session cookie set on login. 'include' makes
  // every existing call site get this for free — frontend (Vercel) and
  // backend (Railway) are different origins in production, so without this
  // the browser would never attach the cookie cross-site at all.
  const res = await fetch(`${BASE_URL}${path}`, { ...options, credentials: 'include' })
  if (!res.ok) {
    if (res.status === 401) unauthorizedHandler?.()
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || `Request to ${path} failed (HTTP ${res.status})`)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

// Resolves to { user } on success, or 401s — AuthContext calls this once on
// app mount to know if a valid session already exists.
export function getMe() {
  return request('/api/auth/me')
}

export function login(email, password) {
  return request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

export function logout() {
  return request('/api/auth/logout', { method: 'POST' })
}

// Admin-only backend route (requireAdmin) — 회원가입's actual implementation,
// reachable only from inside 설정's 사용자 관리 section.
export function createUserAccount(email, password, passwordConfirm) {
  return request('/api/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, passwordConfirm }),
  })
}

export function getUsers() {
  return request('/api/auth/users')
}

// Admin-only backend routes (requireAdmin) — 설정 → 자격 증명's data source.
// GET returns masked status only; the real plaintext never round-trips back
// to the frontend, on this call or the PUT below.
export function getCredentials() {
  return request('/api/credentials')
}

export function setCredential(key, value) {
  return request(`/api/credentials/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
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

// Costs at most 3 real API calls server-side (Part N's image_generation
// reference-sheet call, Part O's cheap text-only copy-extraction call, plus
// an optional cheap detection call some future revision might add) — only
// ever fired from an explicit user click, never automatically. Resolves to
// { imageUrl, extractedAt, price, promotion, adHooks }.
export function extractAdReferenceImage(adArchiveId) {
  return request(`/api/ads/${encodeURIComponent(adArchiveId)}/extract-reference`, { method: 'POST' })
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
