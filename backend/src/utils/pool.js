// Maps items with at most `limit` invocations of `fn` in flight at once.
// Results keep input order. fn errors propagate — catch inside fn if a
// failure should not abort the batch.
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}
