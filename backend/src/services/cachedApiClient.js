// Part Y: an SDK client (OpenAI, Pinecone, ...) is expensive to rebuild on
// every call, so each service caches one instance — but the API key behind
// it can change live via a Settings-UI credential edit (the credentials
// vault), so a naive infinite cache would silently keep using a stale,
// no-longer-real key forever. This tracks which key the cached client was
// built with and rebuilds it whenever that key changes, so a live
// credential edit takes effect on the very next call, no redeploy/restart
// needed.
//
// getConfigKey reads the current key fresh on every call (e.g.
// () => config.openaiApiKey) rather than being passed the key once, since
// config.xxx itself is a live-mutable value. factory(key) builds the
// client from that key.
export function createCachedClient(getConfigKey, factory) {
  let client = null
  let clientKey = null

  return function getClient() {
    const currentKey = getConfigKey()
    if (!client || clientKey !== currentKey) {
      client = factory(currentKey)
      clientKey = currentKey
    }
    return client
  }
}
