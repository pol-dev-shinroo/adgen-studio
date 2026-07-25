import { config } from '../config/index.js'
import { startSync, getJob } from '../services/productSync.service.js'
import { getAllProducts } from '../services/productSheets.service.js'
import { isAuthorized } from '../services/cafe24.client.js'
import { getNamespaceStats, resetNamespace } from '../services/pinecone.service.js'

function findBrand(brandKey) {
  return config.brands.find((b) => b.key === brandKey)
}

export function postProductSync(req, res) {
  if (!config.productSyncConfigured) {
    return res.status(503).json({ error: 'Product sync is not configured on this server.' })
  }

  const { brand } = req.body ?? {}
  if (typeof brand !== 'string' || !findBrand(brand)) {
    return res.status(400).json({
      error: `"brand" must be one of: ${config.brands.map((b) => b.key).join(', ')}`,
    })
  }

  const jobId = startSync(brand)
  res.status(202).json({ jobId })
}

export function getProductSyncStatus(req, res) {
  const job = getJob(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Unknown jobId' })

  res.json({
    jobId: job.id,
    status: job.status,
    brandKey: job.brandKey,
    brandName: job.brandName,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    progress: job.progress,
    summary: job.summary,
  })
}

export async function getProducts(req, res, next) {
  try {
    const { brand } = req.query
    let products = await getAllProducts()

    if (brand !== undefined) {
      const brandDef = findBrand(String(brand))
      if (!brandDef) {
        return res.status(400).json({
          error: `"brand" must be one of: ${config.brands.map((b) => b.key).join(', ')}`,
        })
      }
      products = products.filter((p) => p['Brand'] === brandDef.name)
    }

    res.json({ products })
  } catch (err) {
    next(err)
  }
}

// Reports configuration/connection state per brand — 200 even when nothing
// is configured, since the whole point of this endpoint is describing that
// state, not gatekeeping behind it (unlike postProductSync, which needs the
// real integration to actually do anything).
export async function getProductStatus(req, res, next) {
  try {
    if (!config.productSyncConfigured) {
      return res.json({ brands: [], productSyncConfigured: false })
    }

    const products = await getAllProducts()

    const brands = await Promise.all(config.brands.map(async (b) => {
      const brandProducts = products.filter((p) => p['Brand'] === b.name)
      const lastSyncedAt = brandProducts.reduce((max, p) => {
        const v = p['Last Synced']
        return v && (!max || v > max) ? v : max
      }, null)
      const [authorized, pinecone] = await Promise.all([
        isAuthorized(b.key),
        getNamespaceStats(b.key),
      ])

      return {
        key: b.key,
        name: b.name,
        configured: true,
        authorized,
        productCount: brandProducts.length,
        lastSyncedAt,
        pinecone,
      }
    }))

    res.json({ brands, productSyncConfigured: true })
  } catch (err) {
    next(err)
  }
}

// DESTRUCTIVE — wipes a brand's entire Pinecone namespace. Gated the same
// way postProductSync is (503 if unconfigured, 404 for an unknown brand);
// the actual confirmation friction lives in the frontend's type-the-brand-
// name prompt, not here.
export async function deleteNamespace(req, res, next) {
  if (!config.productSyncConfigured) {
    return res.status(503).json({ error: 'Product sync is not configured on this server.' })
  }

  const brand = findBrand(req.params.brand)
  if (!brand) {
    return res.status(404).json({ error: `Unknown brand "${req.params.brand}"` })
  }

  try {
    await resetNamespace(brand.key)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}
