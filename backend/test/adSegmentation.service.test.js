import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSegmentationResult, segmentReferenceAd } from '../src/services/generation/adSegmentation.service.js'

function fakeClient(outputText) {
  let lastRequest = null
  const client = { responses: { create: async (request) => { lastRequest = request; return { output_text: outputText } } } }
  return { client, getLastRequest: () => lastRequest }
}

test('parseSegmentationResult normalizes well-formed segments, keeping "text" only for type: text', () => {
  const raw = JSON.stringify({
    segments: [
      { type: 'background', label: '배경', box: { x: 0, y: 0, width: 1, height: 0.3 } },
      { type: 'text', label: '가격 배지', text: '최대 71% 할인', box: { x: 0.1, y: 0.1, width: 0.3, height: 0.1 } },
      { type: 'product', label: '제품', box: { x: 0.4, y: 0.4, width: 0.3, height: 0.4 } },
      { type: 'model', label: '모델', box: { x: 0.5, y: 0.2, width: 0.4, height: 0.7 } },
    ],
  })

  const { segments } = parseSegmentationResult(raw)

  assert.equal(segments.length, 4)
  assert.deepEqual(segments[0], { id: 'background-0', type: 'background', label: '배경', box: { x: 0, y: 0, width: 1, height: 0.3 } })
  assert.deepEqual(segments[1], {
    id: 'text-1', type: 'text', label: '가격 배지', text: '최대 71% 할인', box: { x: 0.1, y: 0.1, width: 0.3, height: 0.1 },
  })
  assert.equal(segments[2].text, undefined)
  assert.equal(segments[3].id, 'model-3')
})

test('parseSegmentationResult drops malformed entries (null, unknown type, missing label, missing box) rather than throwing', () => {
  const raw = JSON.stringify({
    segments: [
      { type: 'background', label: '배경', box: { x: 0, y: 0, width: 1, height: 1 } },
      null,
      { type: 'watermark', label: 'bad type', box: { x: 0, y: 0, width: 1, height: 1 } },
      { type: 'text', box: { x: 0, y: 0, width: 1, height: 1 } }, // missing label
      { type: 'product', label: 'no box' },
    ],
  })

  const { segments } = parseSegmentationResult(raw)

  assert.equal(segments.length, 1)
  assert.equal(segments[0].type, 'background')
})

test('parseSegmentationResult clamps out-of-range box values to [0, 1]', () => {
  const raw = JSON.stringify({
    segments: [
      { type: 'product', label: '제품', box: { x: -0.5, y: 1.8, width: 2, height: 'not a number' } },
    ],
  })

  const { segments } = parseSegmentationResult(raw)

  assert.deepEqual(segments[0].box, { x: 0, y: 1, width: 1, height: 0 })
})

test('parseSegmentationResult falls back to one full-image background segment when zero segments survive', () => {
  const raw = JSON.stringify({ segments: [] })
  const { segments } = parseSegmentationResult(raw)
  assert.equal(segments.length, 1)
  assert.deepEqual(segments[0], { id: 'background-0', type: 'background', label: '배경', box: { x: 0, y: 0, width: 1, height: 1 } })
})

test('parseSegmentationResult throws a clear error when the model returns invalid JSON', () => {
  assert.throws(() => parseSegmentationResult('not valid json{{{'), /Ad segmentation returned invalid JSON/)
})

test('segmentReferenceAd sends the image as a data URL and returns parsed segments', async () => {
  const { client, getLastRequest } = fakeClient(JSON.stringify({
    segments: [{ type: 'background', label: '배경', box: { x: 0, y: 0, width: 1, height: 1 } }],
  }))

  const result = await segmentReferenceAd('base64imagedata', { getClientFn: () => client })

  assert.equal(result.segments.length, 1)
  assert.equal(result.segments[0].type, 'background')

  const req = getLastRequest()
  const userMessage = req.input.find((m) => m.role === 'user')
  const imagePart = userMessage.content.find((c) => c.type === 'input_image')
  assert.equal(imagePart.image_url, 'data:image/jpeg;base64,base64imagedata')
})
