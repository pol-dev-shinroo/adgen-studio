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

// Part U-2: styleIntensity redefined as a competitor-original-vs-our-own-
// material axis, not general artistic license. These cover the three
// tiers' actual wording, both with and without a style-reference image —
// the earlier tests above already exercised MEDIUM (styleIntensity 50)
// incidentally, since its style-reference wording was deliberately kept
// matching the old always-on styleReferenceInstructionFor text.

test('renderFinalImage LOW (<=33) with a style reference tells the model to give it minimal to no influence', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    styleIntensity: 20,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: LOW/)
  assert.match(text, /minimal to no influence/)
  assert.match(text, /competitor ad's own original treatment should win/)
})

test('renderFinalImage LOW (<=33) with no style reference stays close to the original preservation wording, no third-image mention', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    styleIntensity: 0,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: LOW/)
  assert.match(text, /as close to the original reference ad as possible/)
  assert.doesNotMatch(text, /third image/i)
})

test('renderFinalImage HIGH (>66) with a style reference actively prefers it as a strong influence', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    styleIntensity: 90,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: HIGH/)
  assert.match(text, /Actively prefer our own reference material/)
  assert.match(text, /strong influence/)
})

test('renderFinalImage HIGH (>66) with no style reference falls back to the original freer-reinterpretation wording, not a third-image reference', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    styleIntensity: 100,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: HIGH/)
  assert.match(text, /reinterpret the lighting, color grading, and background styling more freely/)
  assert.doesNotMatch(text, /third image/i)
  assert.doesNotMatch(text, /Actively prefer our own reference material/)
})
