const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

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

export function startCollect(keywords) {
  return request('/api/collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords }),
  })
}

export function getJobStatus(jobId) {
  return request(`/api/collect/${jobId}`)
}
