import { createHash } from 'node:crypto'
import { config } from '../../config/index.js'
import { fetchAllProducts } from './cafe24.service.js'
import { analyzeProduct, ANALYSIS_KEYS } from '../generation/analyzeProduct.service.js'
import { embedText } from '../generation/embeddings.service.js'
import * as pineconeService from '../generation/pinecone.service.js'
import { upsertProductRows, updateProductField, getAllProducts } from '../sheets/productSheets.service.js'
import { mapProduct } from '../../mappers/product.mapper.js'
import { createJobStore } from '../../utils/jobStore.js'

const jobStore = createJobStore()

const RECENT_ITEMS_LIMIT = 20

function requireBrand(brandKey) {
  const brand = config.brands.find((b) => b.key === brandKey)
  if (!brand) {
    throw new Error(`Unknown or unconfigured Cafe24 brand "${brandKey}"`)
  }
  return brand
}

// deps lets a test inject fakes for every real external call (Cafe24,
// OpenAI, Pinecone, Sheets) — same DI convention as elsewhere in this
// codebase, applied here as one bundle since runJob is reached indirectly
// through jobStore's fire-and-forget callback rather than awaited directly
// (same reason generation/run.js's startGeneration wraps its own runJob
// call in a closure to pass extra data through).
export function startSync(brandKey, deps = {}) {
  const brand = requireBrand(brandKey)

  return jobStore.startJob(
    {
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
        // AA-4: a product whose analysis-relevant fields (name/price/
        // descriptions) haven't changed since its last sync skips the real
        // analyze/embed/Pinecone-upsert calls entirely.
        skipped: 0,
        failed: 0,
        staleDeleted: 0,
        failures: [],
      },
    },
    (job) => runJob(job, deps),
    (job, err) => {
      job.status = 'failed'
      job.error = err.message
      job.finishedAt = new Date().toISOString()
    }
  )
}

export function getJob(jobId) {
  return jobStore.getJob(jobId)
}

// Same text every 7-field analysis is stored under, so the vector represents
// "what this product is/does" rather than raw scraped HTML — matches the
// n8n workflow's concatenation used for both the stored embedding and later
// few-shot lookups against other products' analyses.
function buildEmbeddingText(analysis) {
  return ANALYSIS_KEYS.map((key) => `${key}: ${analysis[key]}`).join('\n')
}

// AA-4: hashes exactly the fields analyzeProduct.service.js's own prompt
// actually consumes (buildLookupText/buildUserPrompt there read
// product_name, price/retail_price, summary_description,
// simple_description, description — nothing else) — checked against that
// file's real implementation, not guessed. Anything else about a product
// changing (its images, stock, category, ...) does NOT change this hash,
// since none of that feeds the analysis this hash is gating. A NUL
// separator between fields avoids trivial concatenation collisions (e.g.
// "ab"+"c" vs "a"+"bc").
export function computeContentHash(rawProduct) {
  const fields = [
    rawProduct.product_name || '',
    String(rawProduct.price || rawProduct.retail_price || ''),
    rawProduct.summary_description || '',
    rawProduct.simple_description || '',
    rawProduct.description || '',
  ]
  return createHash('sha256').update(fields.join('\x00')).digest('hex')
}

// Reverse of mapProduct's own analysis?.[...] reads (product.mapper.ts) —
// reconstructs an analysis-shaped object from a product's CURRENTLY STORED
// sheet values, so a hash-matched (skipped) product's Promotion Info/Ad
// Hook Copy/제품특성/효과효능/페인포인트/권위신뢰 columns get carried forward
// unchanged by mapProduct rather than blanked to "없음" just because this
// run didn't recompute them. '가격정보' (analyzeProduct's 7th key) is
// intentionally omitted — mapProduct has never read it either; it's
// computed by analyzeProduct but never stored in any sheet column.
const ANALYSIS_KEY_TO_COLUMN = {
  '제품특성': '제품특성',
  '효과효능': '효과효능',
  '페인포인트': '페인포인트',
  '프로모션정보': 'Promotion Info',
  '권위/신뢰/인증': '권위신뢰',
  '광고 후킹 카피': 'Ad Hook Copy',
}

export function analysisFromExistingRow(existingRow) {
  const analysis = {}
  for (const [analysisKey, columnName] of Object.entries(ANALYSIS_KEY_TO_COLUMN)) {
    analysis[analysisKey] = existingRow[columnName] || '없음'
  }
  return analysis
}

// getClientFn is threaded through to every Sheets-touching call
// (getAllProducts/upsertProductRows/updateProductField); fetchAllProductsFn/
// analyzeProductFn/embedTextFn/pineconeServiceOverride cover the other real
// external calls (Cafe24/OpenAI/Pinecone) — all default to the real
// implementations, purely so this whole job (including AA-4's skip
// decision and AA-4's own persistence) is unit-testable without any real
// network call.
async function runJob(job, {
  getClientFn,
  fetchAllProductsFn = fetchAllProducts,
  analyzeProductFn = analyzeProduct,
  embedTextFn = embedText,
  pineconeServiceOverride = pineconeService,
} = {}) {
  const { brandKey, brandName } = job
  const progress = job.progress
  const summary = job.summary

  const rawProducts = await fetchAllProductsFn(brandKey)
  progress.totalProducts = rawProducts.length
  summary.totalProducts = rawProducts.length
  summary.skipped = 0
  progress.phase = 'analyzing'

  // AA-4: read once, up front, so each product's hash can be checked
  // against what's already stored without a real Sheets round-trip per
  // product. Keyed the same way extractProductImage matches a row (Brand
  // name + Product ID), since Product ID alone isn't guaranteed unique
  // across brands.
  const existingProducts = await getAllProducts({ getClientFn })
  const existingByProductId = new Map(
    existingProducts.filter((p) => p['Brand'] === brandName).map((p) => [p['Product ID'], p])
  )

  const rows = []
  const hashWrites = [] // { productId, hash } — only for products actually (re-)analyzed this run

  for (const rawProduct of rawProducts) {
    const productId = String(rawProduct.product_no ?? '')
    const productName = rawProduct.product_name || productId

    try {
      const newHash = computeContentHash(rawProduct)
      const existingRow = existingByProductId.get(productId)
      const hashMatches = existingRow && existingRow['Content Hash'] && existingRow['Content Hash'] === newHash

      let analysis
      if (hashMatches) {
        // AA-4: nothing analyzeProduct's prompt actually reads has changed
        // since the last sync — skip the real analyze/embed/Pinecone-upsert
        // calls entirely and reuse the already-stored analysis text, only
        // refreshing this product's plain sync-owned fields (name/price/
        // image/last-synced) below via the normal mapProduct/upsertProductRows
        // path, same as always.
        analysis = analysisFromExistingRow(existingRow)
        summary.skipped += 1
        progress.recentItems.unshift({ productId, productName, status: 'skipped' })
      } else {
        analysis = await analyzeProductFn(brandKey, rawProduct, pineconeServiceOverride)
        const embedding = await embedTextFn(buildEmbeddingText(analysis))
        // No raw Cafe24 product data in metadata: nothing reads it back (only
        // aiAnalysis is ever parsed, by queryFewShot's few-shot lookup), and a
        // real product's detail-page HTML (description/mobile_description)
        // routinely runs 10-25KB+ — comfortably over Pinecone's 40KB
        // per-vector metadata cap on its own, let alone alongside everything
        // else. Confirmed live: healthykiki's first real sync had exactly
        // this vector upsert fail with "Metadata size ... exceeds the limit
        // of 40960 bytes" before this field was dropped.
        await pineconeServiceOverride.upsertProduct(brandKey, productId, embedding, {
          productId,
          brand: brandKey,
          aiAnalysis: JSON.stringify(analysis),
        })
        hashWrites.push({ productId, hash: newHash })
        summary.synced += 1
        progress.recentItems.unshift({ productId, productName, status: 'synced' })
      }

      const mapped = mapProduct(brandName, rawProduct, analysis)
      rows.push(mapped)
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
    await upsertProductRows(rows, { getClientFn })
  }

  // AA-4: Content Hash is written via its own dedicated per-product call
  // (same out-of-band write path EXTRACTION_COLUMNS/OVERRIDE_COLUMNS
  // already use), never through upsertProductRows's own restricted
  // SYNC_COLUMNS-only write range — appended at the very end of
  // PRODUCT_COLUMNS, so this never risks reordering/corrupting any
  // existing column. Only products actually (re-)analyzed this run need
  // a write; a skipped product's stored hash is already correct.
  for (const { productId, hash } of hashWrites) {
    try {
      await updateProductField(productId, 'Content Hash', hash, { getClientFn })
    } catch (err) {
      console.warn(`Failed to write Content Hash for product ${productId} (brand ${brandKey}): ${err.message}`)
    }
  }

  progress.phase = 'cleaning up'
  // Every product still in the mall's catalog stays, even the ones that
  // failed analysis this run — only a product genuinely removed from Cafe24
  // should lose its Pinecone vector, not one that merely hit a transient
  // GPT/embedding error.
  const currentProductIds = rawProducts.map((p) => String(p.product_no ?? ''))
  const staleIds = await pineconeServiceOverride.deleteStale(brandKey, currentProductIds)
  summary.staleDeleted = staleIds.length

  progress.phase = 'done'
  job.status = 'done'
  job.finishedAt = new Date().toISOString()
}
