import test from 'node:test'
import assert from 'node:assert/strict'
import { embedText } from '../src/services/generation/embeddings.service.js'

test('embedText: sends the given text to the embeddings endpoint and returns the real vector', async () => {
  let lastRequest = null
  const client = {
    embeddings: {
      create: async (request) => {
        lastRequest = request
        return { data: [{ embedding: [0.1, 0.2, 0.3] }] }
      },
    },
  }

  const embedding = await embedText('설명 텍스트', { getClientFn: () => client })

  assert.deepEqual(embedding, [0.1, 0.2, 0.3])
  assert.equal(lastRequest.input, '설명 텍스트')
  assert.equal(lastRequest.model, 'text-embedding-3-small')
})
