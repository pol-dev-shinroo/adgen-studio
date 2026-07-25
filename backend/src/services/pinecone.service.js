import { Pinecone } from '@pinecone-database/pinecone'
import { config } from '../config/index.js'

let client = null

function getIndex() {
  if (!client) {
    client = new Pinecone({ apiKey: config.pineconeApiKey })
  }
  return client.index(config.pineconeIndex)
}

function getNamespace(brandKey) {
  return getIndex().namespace(brandKey)
}

// Top-K nearest neighbors for the given embedding, used as few-shot examples
// in the analysis prompt. Callers decide how to handle an empty/failed
// lookup — this is a quality nice-to-have, not a hard dependency.
export async function queryFewShot(brandKey, embedding, topK = 2) {
  const result = await getNamespace(brandKey).query({
    vector: embedding,
    topK,
    includeMetadata: true,
  })
  return result.matches || []
}

export async function upsertProduct(brandKey, productId, embedding, metadata) {
  await getNamespace(brandKey).upsert([
    { id: String(productId), values: embedding, metadata },
  ])
}

// Diffs the namespace's current vector IDs against the product IDs from the
// latest sync and deletes anything no longer present — replaces the n8n
// workflow's blunt clearNamespace-and-rebuild with an actual diff, same
// non-destructive philosophy as the rest of this app's sync jobs.
export async function deleteStale(brandKey, currentProductIds) {
  const namespace = getNamespace(brandKey)
  const currentIds = new Set(currentProductIds.map(String))
  const staleIds = []

  let paginationToken
  do {
    const page = await namespace.listPaginated({
      paginationToken,
    })
    for (const vector of page.vectors || []) {
      if (!currentIds.has(vector.id)) staleIds.push(vector.id)
    }
    paginationToken = page.pagination?.next
  } while (paginationToken)

  if (staleIds.length) {
    await namespace.deleteMany(staleIds)
  }
  return staleIds
}

// Status-display only: how many vectors a brand's namespace currently
// holds. Never throws — an index that doesn't exist yet (nothing synced,
// or a typo'd PINECONE_INDEX) is a completely normal state for this to
// report on, not an error worth failing a status request over.
export async function getNamespaceStats(brandKey) {
  try {
    const stats = await getIndex().describeIndexStats()
    return { vectorCount: stats.namespaces?.[brandKey]?.recordCount ?? 0 }
  } catch {
    return { vectorCount: null }
  }
}

// DESTRUCTIVE — wipes every vector in a brand's namespace. Manual-only:
// no automatic caller anywhere in this codebase should ever invoke this;
// it exists solely for the explicit, user-confirmed "초기화" action in the
// product management screen (same high-friction precedent as
// scripts/reset-archive.js for the ad archive).
export async function resetNamespace(brandKey) {
  await getNamespace(brandKey).deleteAll()
}
