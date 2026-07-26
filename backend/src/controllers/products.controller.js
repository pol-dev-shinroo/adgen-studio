import { config } from '../config/index.js'
import { startSync, getJob } from '../services/productSync.service.js'
import { getAllProducts, updateProductFields } from '../services/productSheets.service.js'
import { isAuthorized } from '../services/cafe24.client.js'
import { getNamespaceStats, resetNamespace } from '../services/pinecone.service.js'
import { extractProductImage } from '../services/productImageExtraction.service.js'

function findBrand(brandKey) {
  return config.brands.find((b) => b.key === brandKey)
}

// The only columns a user is allowed to write directly — see product
// .mapper.js's OVERRIDE_COLUMNS for why these exist as separate columns
// rather than editing Price/Promotion Info/Ad Hook Copy in place.
const EDITABLE_OVERRIDE_FIELDS = new Set(['Price Override', 'Promotion Info Override', 'Ad Hook Copy Override'])

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

// Synchronous — a single gpt-image-2 edit call, not a job/poll flow (see
// productImageExtraction.service.js). Real money per call, so this is
// deliberately not something a resync or batch operation ever triggers on
// its own — only an explicit user action in 상품관리.
export async function postExtractProductImage(req, res, next) {
  if (!config.productSyncConfigured) {
    return res.status(503).json({ error: 'Product sync is not configured on this server.' })
  }

  const { brand, productId } = req.params
  try {
    const result = await extractProductImage(brand, productId)
    res.json(result)
  } catch (err) {
    if (err.notFound) return res.status(404).json({ error: err.message })
    next(err)
  }
}

// Saves user-entered overrides for Price/Promotion Info/Ad Hook Copy —
// never touches the synced columns themselves. Body: only the fields the
// user actually changed, e.g. {"Price Override": "45000"}.
export async function patchProductFields(req, res, next) {
  if (!config.productSyncConfigured) {
    return res.status(503).json({ error: 'Product sync is not configured on this server.' })
  }

  const { brand, productId } = req.params
  const brandDef = findBrand(brand)
  if (!brandDef) {
    return res.status(404).json({ error: `Unknown brand "${brand}"` })
  }

  const fields = req.body ?? {}
  const entries = Object.entries(fields)
  if (entries.length === 0) {
    return res.status(400).json({ error: 'Provide at least one field to update' })
  }
  for (const [key, value] of entries) {
    if (!EDITABLE_OVERRIDE_FIELDS.has(key)) {
      return res.status(400).json({
        error: `Field "${key}" is not editable — must be one of: ${[...EDITABLE_OVERRIDE_FIELDS].join(', ')}`,
      })
    }
    if (typeof value !== 'string') {
      return res.status(400).json({ error: `Field "${key}" must be a string` })
    }
  }

  try {
    const products = await getAllProducts()
    const product = products.find((p) => p['Brand'] === brandDef.name && p['Product ID'] === String(productId))
    if (!product) {
      return res.status(404).json({ error: `No product "${productId}" found for brand "${brand}"` })
    }

    await updateProductFields(productId, fields)
    res.json({ ok: true })
  } catch (err) {
    if (err.notFound) return res.status(404).json({ error: err.message })
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
