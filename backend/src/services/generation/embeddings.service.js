import OpenAI from 'openai'
import { config } from '../../config/index.js'
import { createCachedClient } from '../cachedApiClient.js'

// AA-6: maxRetries retries connection errors + 408/409/429/5xx with the
// SDK's own built-in exponential backoff (never other 4xx, e.g.
// content-policy rejections) — simpler than wrapping every real call site
// by hand, and applies to every call this client makes automatically.
const getClient = createCachedClient(() => config.openaiApiKey, (apiKey) => new OpenAI({ apiKey, maxRetries: 2 }))

const EMBEDDING_MODEL = 'text-embedding-3-small'

// CC-4: getClientFn is injected (defaulting to the real getClient) purely so
// this is unit-testable without a real OpenAI call — same DI convention used
// elsewhere in this codebase.
export async function embedText(text, { getClientFn = getClient } = {}) {
  const res = await getClientFn().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })
  return res.data[0].embedding
}
