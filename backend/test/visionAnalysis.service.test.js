import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeReferenceAd } from '../src/services/generation/visionAnalysis.service.js'

function fakeClient(outputText) {
  let lastRequest = null
  const client = { responses: { create: async (request) => { lastRequest = request; return { output_text: outputText } } } }
  return { client, getLastRequest: () => lastRequest }
}

test('analyzeReferenceAd: parses a real identified_texts + product_instances response and sends the image as a data URL', async () => {
  const { client, getLastRequest } = fakeClient(JSON.stringify({
    identified_texts: [{ location: 'top', text: '71% 할인' }],
    product_instances: [{ location: 'center', description: 'held bottle' }],
  }))

  const result = await analyzeReferenceAd('base64imagedata', { getClientFn: () => client })

  assert.deepEqual(result, {
    identified_texts: [{ location: 'top', text: '71% 할인' }],
    product_instances: [{ location: 'center', description: 'held bottle' }],
  })

  const req = getLastRequest()
  const userMessage = req.input.find((m) => m.role === 'user')
  const imagePart = userMessage.content.find((c) => c.type === 'input_image')
  assert.equal(imagePart.image_url, 'data:image/jpeg;base64,base64imagedata')
})

test('analyzeReferenceAd: defaults both arrays to [] when the model omits one or both keys', async () => {
  const { client } = fakeClient(JSON.stringify({ identified_texts: [{ location: 'x', text: 'y' }] }))
  const result = await analyzeReferenceAd('img', { getClientFn: () => client })
  assert.deepEqual(result.identified_texts, [{ location: 'x', text: 'y' }])
  assert.deepEqual(result.product_instances, [])
})

test('analyzeReferenceAd: throws a clear error when the model returns invalid JSON', async () => {
  const { client } = fakeClient('not valid json{{{')
  await assert.rejects(
    () => analyzeReferenceAd('img', { getClientFn: () => client }),
    /Vision analysis returned invalid JSON/
  )
})
