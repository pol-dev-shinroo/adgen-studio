import { randomUUID } from 'node:crypto'
import { config } from '../config/index.js'
import { fetchAllProducts } from './cafe24.service.js'
import { analyzeProduct, ANALYSIS_KEYS } from './analyzeProduct.service.js'
import { embedText } from './embeddings.service.js'
import * as pineconeService from './pinecone.service.js'
import { upsertProductRows } from './productSheets.service.js'
import { mapProduct } from '../mappers/product.mapper.js'

// In-memory job store, same lost-on-restart tradeoff as collect.service.js.
const jobs = new Map()

const RECENT_ITEMS_LIMIT = 20

function requireBrand(brandKey) {
  const brand = config.brands.find((b) => b.key === brandKey)
  if (!brand) {
    throw new Error(`Unknown or unconfigured Cafe24 brand "${brandKey}"`)
  }
  return brand
}

export function startSync(brandKey) {
  const brand = requireBrand(brandKey)

  const job = {
    id: randomUUID(),
    status: 'running',
    brandKey,
    brandName: brand.name,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    progress: {
      phase: 'fetching',
      totalProducts: 0,
      productsProcessed: 0,
      recentItems: [],
    },
    summary: {
      totalProducts: 0,
      synced: 0,
      failed: 0,
      staleDeleted: 0,
      failures: [],
    },
  }
  jobs.set(job.id, job)

  runJob(job).catch((err) => {
    job.status = 'failed'
    job.error = err.message
    job.finishedAt = new Date().toISOString()
  })

  return job.id
}

export function getJob(jobId) {
  return jobs.get(jobId) ?? null
}

// Same text every 7-field analysis is stored under, so the vector represents
// "what this product is/does" rather than raw scraped HTML — matches the
// n8n workflow's concatenation used for both the stored embedding and later
// few-shot lookups against other products' analyses.
function buildEmbeddingText(analysis) {
  return ANALYSIS_KEYS.map((key) => `${key}: ${analysis[key]}`).join('\n')
}

async function runJob(job) {
  const { brandKey, brandName } = job
  const progress = job.progress
  const summary = job.summary

  const rawProducts = await fetchAllProducts(brandKey)
  progress.totalProducts = rawProducts.length
  summary.totalProducts = rawProducts.length
  progress.phase = 'analyzing'

  const rows = []

  for (const rawProduct of rawProducts) {
    const productId = String(rawProduct.product_no ?? '')
    const productName = rawProduct.product_name || productId

    try {
      const analysis = await analyzeProduct(brandKey, rawProduct, pineconeService)
      const embedding = await embedText(buildEmbeddingText(analysis))
      // No raw Cafe24 product data in metadata: nothing reads it back (only
      // aiAnalysis is ever parsed, by queryFewShot's few-shot lookup), and a
      // real product's detail-page HTML (description/mobile_description)
      // routinely runs 10-25KB+ — comfortably over Pinecone's 40KB
      // per-vector metadata cap on its own, let alone alongside everything
      // else. Confirmed live: healthykiki's first real sync had exactly
      // this vector upsert fail with "Metadata size ... exceeds the limit
      // of 40960 bytes" before this field was dropped.
      await pineconeService.upsertProduct(brandKey, productId, embedding, {
        productId,
        brand: brandKey,
        aiAnalysis: JSON.stringify(analysis),
      })

      const mapped = mapProduct(brandName, rawProduct, analysis)
      rows.push(mapped)
      summary.synced += 1

      progress.recentItems.unshift({ productId, productName, status: 'synced' })
    } catch (err) {
      summary.failed += 1
      summary.failures.push({ productId, productName, error: err.message })
      progress.recentItems.unshift({ productId, productName, status: 'failed' })
      console.warn(`product sync failed (brand ${brandKey}, product ${productId}): ${err.message}`)
    }

    progress.productsProcessed += 1
    progress.recentItems = progress.recentItems.slice(0, RECENT_ITEMS_LIMIT)
  }

  progress.phase = 'saving'
  if (rows.length > 0) {
    await upsertProductRows(rows)
  }

  progress.phase = 'cleaning up'
  // Every product still in the mall's catalog stays, even the ones that
  // failed analysis this run — only a product genuinely removed from Cafe24
  // should lose its Pinecone vector, not one that merely hit a transient
  // GPT/embedding error.
  const currentProductIds = rawProducts.map((p) => String(p.product_no ?? ''))
  const staleIds = await pineconeService.deleteStale(brandKey, currentProductIds)
  summary.staleDeleted = staleIds.length

  progress.phase = 'done'
  job.status = 'done'
  job.finishedAt = new Date().toISOString()
}
