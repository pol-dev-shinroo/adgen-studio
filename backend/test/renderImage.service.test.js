import test from 'node:test'
import assert from 'node:assert/strict'
import { renderFinalImage } from '../src/services/renderImage.service.js'

const FORMAT = '1:1 피드'

const REPLACEMENTS = [{ location: 'top banner', original_text: '원본', new_text: '대체' }]
const PRODUCT_INSTANCES = [{ location: 'center', description: 'a bottle held in a hand' }]

// Records the exact request object passed to responses.create and returns a
// response shaped like a real gpt-image-2 image_generation_call result —
// same fake-client DI convention as sheets.service.test.js's getClientFn,
// just for the OpenAI client instead of the Sheets client. No real API call
// anywhere in this suite.
function fakeClient() {
  let lastRequest = null
  const client = {
    responses: {
      create: async (request) => {
        lastRequest = request
        return { output: [{ type: 'image_generation_call', result: 'FAKE_BASE64_RESULT' }] }
      },
    },
  }
  return { client, getLastRequest: () => lastRequest }
}

test('renderFinalImage sends exactly two input_image entries and the original two-image framing when no style reference is given', async () => {
  const { client, getLastRequest } = fakeClient()

  const result = await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    productInstances: PRODUCT_INSTANCES,
    replacements: REPLACEMENTS,
    format: FORMAT,
    styleIntensity: 50,
    instructions: '',
  }, { getClientFn: () => client })

  assert.equal(result, 'FAKE_BASE64_RESULT')

  const req = getLastRequest()
  const content = req.input[0].content
  const imageEntries = content.filter((c) => c.type === 'input_image')
  const textEntry = content.find((c) => c.type === 'input_text')

  assert.equal(imageEntries.length, 2)
  assert.equal(imageEntries[0].image_url, 'data:image/jpeg;base64,REF_B64')
  assert.equal(imageEntries[1].image_url, 'data:image/png;base64,PROD_B64')

  // Byte-for-byte the pre-Part-Q framing sentence — no "third image" wording,
  // no style-reference instruction paragraph at all.
  assert.match(
    textEntry.text,
    /The first image is the original reference ad\. The second image is our own product's reference photo\. Seamlessly replace/
  )
  assert.doesNotMatch(textEntry.text, /third image/i)
  assert.doesNotMatch(textEntry.text, /reference sheet of our own brand's past ad styling/)

  assert.deepEqual(req.tools, [{ type: 'image_generation', action: 'edit', size: '1024x1024' }])
})

test('renderFinalImage adds a third input_image and the style-reference instruction when a style reference is given', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    productInstances: PRODUCT_INSTANCES,
    replacements: REPLACEMENTS,
    format: FORMAT,
    styleIntensity: 50,
    instructions: '',
  }, { getClientFn: () => client })

  const req = getLastRequest()
  const content = req.input[0].content
  const imageEntries = content.filter((c) => c.type === 'input_image')
  const textEntry = content.find((c) => c.type === 'input_text')

  assert.equal(imageEntries.length, 3)
  assert.equal(imageEntries[0].image_url, 'data:image/jpeg;base64,REF_B64')
  assert.equal(imageEntries[1].image_url, 'data:image/png;base64,PROD_B64')
  assert.equal(imageEntries[2].image_url, 'data:image/png;base64,STYLE_B64')

  // Framing sentence updated to acknowledge the third image, and the
  // dedicated style-reference instruction paragraph is present with its
  // "supplementary, not literal" guidance.
  assert.match(textEntry.text, /A third image is also provided/)
  assert.match(textEntry.text, /reference sheet of our own brand's past ad styling/)
  assert.match(textEntry.text, /Do not copy its layout or insert elements/)
})

test('renderFinalImage treats a missing styleReferenceImageBase64 (undefined) the same as omitted', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: undefined,
    productInstances: [],
    replacements: [],
    format: FORMAT,
    styleIntensity: 10,
    instructions: '',
  }, { getClientFn: () => client })

  const content = getLastRequest().input[0].content
  assert.equal(content.filter((c) => c.type === 'input_image').length, 2)
})

test('renderFinalImage still appends instructions after the style-reference paragraph when both are present', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    styleIntensity: 50,
    instructions: 'Make the background neon green.',
  }, { getClientFn: () => client })

  const textEntry = getLastRequest().input[0].content.find((c) => c.type === 'input_text')
  const styleRefIndex = textEntry.text.indexOf("reference sheet of our own brand's past ad styling")
  const instructionsIndex = textEntry.text.indexOf('Make the background neon green.')

  assert.notEqual(styleRefIndex, -1)
  assert.notEqual(instructionsIndex, -1)
  assert.ok(instructionsIndex > styleRefIndex)
})
