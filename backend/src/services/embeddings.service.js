import OpenAI from 'openai'
import { config } from '../config/index.js'

let client = null
let clientKey = null

// Part Y: config.openaiApiKey can change live (a Settings-UI credential
// edit), so the cached client is rebuilt whenever the key it was built
// with no longer matches — otherwise a live edit would silently keep using
// the stale key here even though config.openaiApiKey itself updated.
function getClient() {
  if (!client || clientKey !== config.openaiApiKey) {
    client = new OpenAI({ apiKey: config.openaiApiKey })
    clientKey = config.openaiApiKey
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
