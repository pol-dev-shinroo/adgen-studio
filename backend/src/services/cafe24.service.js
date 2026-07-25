import { config } from '../config/index.js'
import { getAccessToken } from './cafe24.client.js'
import { mapWithConcurrency } from '../utils/pool.js'

const PAGE_SIZE = 100
const DETAIL_CONCURRENCY = 3 // parallel per-product detail fetches

function requireBrand(brandKey) {
  const brand = config.brands.find((b) => b.key === brandKey)
  if (!brand) {
    throw new Error(`Unknown or unconfigured Cafe24 brand "${brandKey}"`)
  }
  return brand
}

async function cafe24Get(brand, path, searchParams) {
  const accessToken = await getAccessToken(brand.key)
  const url = new URL(`https://${brand.mallId}.cafe24api.com${path}`)
  Object.entries(searchParams || {}).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Cafe24 request to ${path} failed for "${brand.key}" (HTTP ${res.status}): ${detail.slice(0, 300)}`)
  }
  return res.json()
}

// Fetches every product in the mall's catalog. The list endpoint
// (GET /admin/products) is paginated with limit/offset, but — verified
// empirically, not documented anywhere obvious — it never returns
// description/simple_description/mobile_description no matter what's
// requested via `fields`; those only come back from the per-product detail
// endpoint (GET /admin/products/{product_no}), which is otherwise a
// superset of the list item's fields. So each product's full detail is
// fetched individually (small bounded concurrency, same pattern as
// collect.service.js's media downloads) and used in place of the list item.
export async function fetchAllProducts(brandKey) {
  const brand = requireBrand(brandKey)
  const summaries = []
  let offset = 0

  for (;;) {
    const body = await cafe24Get(brand, '/api/v2/admin/products', {
      limit: String(PAGE_SIZE),
      offset: String(offset),
    })
    const page = body.products || []
    summaries.push(...page)

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return mapWithConcurrency(summaries, DETAIL_CONCURRENCY, async (summary) => {
    const body = await cafe24Get(brand, `/api/v2/admin/products/${summary.product_no}`)
    return body.product || summary
  })
}
