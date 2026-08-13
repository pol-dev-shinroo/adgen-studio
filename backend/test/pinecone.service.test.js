import test from 'node:test'
import assert from 'node:assert/strict'
import {
  queryFewShot, upsertProduct, deleteStale, getNamespaceStats, resetNamespace,
} from '../src/services/generation/pinecone.service.js'

// A genuinely stateful in-memory fake — upsert/deleteMany/deleteAll mutate
// `vectors` in place so a write-then-read sequence within one call reflects
// the write, same convention as this suite's Sheets fakes. Namespaced per
// brandKey the same way the real Pinecone index is.
function makeFakePineconeClient(initialByNamespace = {}) {
  const store = new Map(Object.entries(initialByNamespace).map(([ns, vecs]) => [ns, [...vecs]]))

  function namespaceFor(ns) {
    if (!store.has(ns)) store.set(ns, [])
    const vectors = store.get(ns)
    return {
      query: async ({ topK }) => ({ matches: vectors.slice(0, topK).map((v) => ({ id: v.id, score: 0.9, metadata: v.metadata })) }),
      upsert: async (records) => {
        for (const rec of records) {
          const idx = vectors.findIndex((v) => v.id === rec.id)
          if (idx === -1) vectors.push(rec)
          else vectors[idx] = rec
        }
      },
      listPaginated: async () => ({ vectors: vectors.map((v) => ({ id: v.id })), pagination: undefined }),
      deleteMany: async (ids) => {
        for (const id of ids) {
          const idx = vectors.findIndex((v) => v.id === id)
          if (idx !== -1) vectors.splice(idx, 1)
        }
      },
      deleteAll: async () => { vectors.length = 0 },
    }
  }

  return {
    index: () => ({
      namespace: (ns) => namespaceFor(ns),
      describeIndexStats: async () => ({
        namespaces: Object.fromEntries([...store.entries()].map(([ns, vecs]) => [ns, { recordCount: vecs.length }])),
      }),
    }),
  }
}

test('upsertProduct then queryFewShot: a real write is immediately visible to a real read in the same namespace', async () => {
  const fake = makeFakePineconeClient()
  const deps = { getClientFn: () => fake }

  await upsertProduct('healthykiki', '1', [0.1, 0.2], { aiAnalysis: 'x' }, deps)
  await upsertProduct('healthykiki', '2', [0.3, 0.4], { aiAnalysis: 'y' }, deps)

  const matches = await queryFewShot('healthykiki', [0.1, 0.2], 2, deps)
  assert.equal(matches.length, 2)
  assert.deepEqual(matches.map((m) => m.id).sort(), ['1', '2'])
})

test('queryFewShot: a namespace no product has ever synced into returns no matches, not an error', async () => {
  const fake = makeFakePineconeClient()
  const matches = await queryFewShot('brandnobodyhassyncedyet', [0.1], 2, { getClientFn: () => fake })
  assert.deepEqual(matches, [])
})

test('upsertProduct: upserting the same product ID twice overwrites in place rather than duplicating', async () => {
  const fake = makeFakePineconeClient()
  const deps = { getClientFn: () => fake }
  await upsertProduct('healthykiki', '1', [0.1], { aiAnalysis: 'first' }, deps)
  await upsertProduct('healthykiki', '1', [0.2], { aiAnalysis: 'second' }, deps)

  const matches = await queryFewShot('healthykiki', [0.2], 5, deps)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].metadata.aiAnalysis, 'second')
})

test('deleteStale: deletes real vectors whose product ID is no longer in the current sync, keeps the rest', async () => {
  const fake = makeFakePineconeClient({
    healthykiki: [{ id: '1', values: [0.1] }, { id: '2', values: [0.2] }, { id: '3', values: [0.3] }],
  })
  const deps = { getClientFn: () => fake }

  const staleIds = await deleteStale('healthykiki', ['1', '3'], deps)

  assert.deepEqual(staleIds.sort(), ['2'])
  const remaining = await queryFewShot('healthykiki', [0], 10, deps)
  assert.deepEqual(remaining.map((m) => m.id).sort(), ['1', '3'])
})

test('deleteStale: nothing to delete when every current product ID is still present', async () => {
  const fake = makeFakePineconeClient({ healthykiki: [{ id: '1', values: [0.1] }] })
  const staleIds = await deleteStale('healthykiki', ['1'], { getClientFn: () => fake })
  assert.deepEqual(staleIds, [])
})

test('getNamespaceStats: returns the real vector count for a namespace that has synced products', async () => {
  const fake = makeFakePineconeClient({ healthykiki: [{ id: '1', values: [0.1] }, { id: '2', values: [0.2] }] })
  const stats = await getNamespaceStats('healthykiki', { getClientFn: () => fake })
  assert.deepEqual(stats, { vectorCount: 2 })
})

test('getNamespaceStats: a brand that has never synced anything reports 0, not null/undefined', async () => {
  const fake = makeFakePineconeClient()
  const stats = await getNamespaceStats('neversynced', { getClientFn: () => fake })
  assert.deepEqual(stats, { vectorCount: 0 })
})

test('getNamespaceStats: never throws — a describeIndexStats failure (e.g. index does not exist yet) reports vectorCount: null', async () => {
  const throwingClient = { index: () => ({ describeIndexStats: async () => { throw new Error('index not found') } }) }
  const stats = await getNamespaceStats('healthykiki', { getClientFn: () => throwingClient })
  assert.deepEqual(stats, { vectorCount: null })
})

test('resetNamespace: wipes every vector in the namespace, leaving other namespaces untouched', async () => {
  const fake = makeFakePineconeClient({
    healthykiki: [{ id: '1', values: [0.1] }],
    otherbrand: [{ id: '9', values: [0.9] }],
  })
  const deps = { getClientFn: () => fake }

  await resetNamespace('healthykiki', deps)

  const wiped = await queryFewShot('healthykiki', [0], 10, deps)
  assert.deepEqual(wiped, [])
  const untouched = await queryFewShot('otherbrand', [0], 10, deps)
  assert.equal(untouched.length, 1)
})
