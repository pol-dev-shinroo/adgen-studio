import OpenAI from 'openai'
import { config } from '../config/index.js'

let client = null

function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey })
  }
  return client
}

const EMBEDDING_MODEL = 'text-embedding-3-small'

export async function embedText(text) {
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })
  return res.data[0].embedding
}
