import { config } from '../config/index.js'
import { getAccessToken } from './cafe24.client.js'

const PAGE_SIZE = 100

function requireBrand(brandKey) {
  const brand = config.brands.find((b) => b.key === brandKey)
  if (!brand) {
    throw new Error(`Unknown or unconfigured Cafe24 brand "${brandKey}"`)
  }
  return brand
}

// Fetches every product in the mall's catalog, paging with limit/offset
// until a page comes back shorter than PAGE_SIZE (i.e. the last page).
export async function fetchAllProducts(brandKey) {
  const brand = requireBrand(brandKey)
  const products = []
  let offset = 0

  for (;;) {
    const accessToken = await getAccessToken(brandKey)
    const url = new URL(`https://${brand.mallId}.cafe24api.com/api/v2/admin/products`)
    url.searchParams.set('limit', String(PAGE_SIZE))
    url.searchParams.set('offset', String(offset))

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Cafe24 product fetch failed for "${brandKey}" (HTTP ${res.status}): ${detail.slice(0, 300)}`)
    }

    const body = await res.json()
    const page = body.products || []
    products.push(...page)

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return products
}
