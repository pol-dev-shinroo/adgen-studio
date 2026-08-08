import OpenAI from 'openai'
import { config } from '../../config/index.js'
import { createCachedClient } from '../cachedApiClient.js'

const getClient = createCachedClient(() => config.openaiApiKey, (apiKey) => new OpenAI({ apiKey }))

const EMBEDDING_MODEL = 'text-embedding-3-small'

export async function embedText(text) {
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })
  return res.data[0].embedding
}
