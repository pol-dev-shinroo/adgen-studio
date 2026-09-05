import test from 'node:test'
import assert from 'node:assert/strict'
import { renderFinalImage, renderConversationalImage } from '../src/services/generation/renderImage.service.js'

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
    freeRestyle: false,
    strongReferenceInfluence: false,
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
  assert.doesNotMatch(textEntry.text, /style reference/i)

  assert.deepEqual(req.tools, [{ type: 'image_generation', action: 'edit', size: '1024x1024', quality: 'high' }])
})

// Part MM: a live client-caught bug — the model invented a packaging form
// factor (a torn-open sachet) our product doesn't actually have, because
// nothing told it fabrication was off the table when a competitor instance's
// physical form has no equivalent in our single reference photo. Shared by
// both renderFinalImage and renderConversationalImage since both call
// productSwapInstructionFor for this paragraph.
test('renderFinalImage forbids fabricating a packaging form factor our product doesn\'t have', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    productInstances: PRODUCT_INSTANCES,
    replacements: REPLACEMENTS,
    format: FORMAT,
    freeRestyle: false,
    strongReferenceInfluence: false,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /EXACTLY the packaging shown in the second reference image/)
  assert.match(text, /NEVER invent, imagine, or fabricate a packaging form factor/)
  assert.match(text, /render that instance as our actual product exactly as it appears in the reference photo/)
})

// Part NN: Part MM's fix stopped fabrication for the PRIMARY instance, but
// live re-testing found the model still invented a second, different
// packaging shape for a second instance in a different physical form (a
// stick pack, not the original bug's torn sachet, but still fabricated) —
// the case-by-case "when an instance has no equivalent" framing left room
// to read it as "design a plausible variant," not "only ever show what's in
// the photo." These lock down the strengthened, unconditional wording.
test('renderFinalImage\'s main swap sentence itself (not just the CRITICAL paragraph) demands an exact, non-invented copy', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    productInstances: PRODUCT_INSTANCES,
    replacements: REPLACEMENTS,
    format: FORMAT,
    freeRestyle: false,
    strongReferenceInfluence: false,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /an exact copy of OUR product from the second reference image/)
  assert.match(text, /the identical container, shape, and design every single time, never a different or invented variant/)
})

// Part PP: Part NN's own "resulting in multiple identical copies... if
// necessary" framing produced a NEW bug — a hand holding our real box plus
// two toy-scale miniature copies crammed against the fingers, because the
// model mechanically copied the competitor's original instance count/scale/
// position. The design-fidelity rule (never a fabricated packaging variant)
// stays absolute; the instance-count/placement rule now explicitly permits
// photographic judgment (consolidate/resize/reposition/omit) instead of
// demanding literal duplication.
test('renderFinalImage requires design fidelity for every instance, but gives explicit photographic-judgment latitude on instance count/placement instead of demanding literal duplication', async () => {
  const { client, getLastRequest } = fakeClient()
  const twoFormInstances = [
    { location: 'left hand', description: 'a boxed product' },
    { location: 'right hand', description: 'a torn-open stick pack' },
  ]

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    productInstances: twoFormInstances,
    replacements: REPLACEMENTS,
    format: FORMAT,
    freeRestyle: false,
    strongReferenceInfluence: false,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  // The unconditional design-fidelity rule must be the FIRST sentence of the
  // CRITICAL paragraph, ahead of the older illustrative examples —
  // instruction-following on long prompts weighs earlier statements more.
  const criticalIndex = text.indexOf('CRITICAL:')
  const fidelityIndex = text.indexOf('our product must NEVER appear as a fabricated or invented packaging design')
  const examplesIndex = text.indexOf('torn-open sachet/pouch, loose powder')
  assert.ok(criticalIndex !== -1 && fidelityIndex !== -1 && examplesIndex !== -1)
  assert.ok(fidelityIndex < examplesIndex, 'the design-fidelity rule must come before the illustrative examples')
  assert.ok(fidelityIndex - criticalIndex < 15, 'the design-fidelity rule must be the very first sentence after "CRITICAL:"')

  // Design fidelity: still absolute, no exceptions.
  assert.match(text, /every visible instance must be the exact same real design shown in the second reference image, no exceptions/)
  // Instance count/placement: now explicit photographic-judgment latitude,
  // not a literal-duplication mandate.
  assert.match(text, /apply this with real photographic judgment about WHERE and HOW MANY instances to show/)
  assert.match(text, /you may consolidate, resize sensibly, reposition, or simply omit a redundant\/awkward extra instance/)
  assert.match(text, /Never solve an awkward-composition problem by inventing a different packaging design instead/)
  assert.doesNotMatch(text, /resulting in multiple identical copies of our real product if necessary/)
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
    freeRestyle: false,
    strongReferenceInfluence: false,
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
  // "supplementary, not literal" guidance (strongReferenceInfluence: false).
  assert.match(textEntry.text, /A third image is also provided/)
  assert.match(textEntry.text, /light supplementary visual guidance/)
  assert.match(textEntry.text, /without copying its layout or inserting elements/)
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
    freeRestyle: false,
    strongReferenceInfluence: false,
    instructions: '',
  }, { getClientFn: () => client })

  const content = getLastRequest().input[0].content
  assert.equal(content.filter((c) => c.type === 'input_image').length, 2)
})

// Part HH: every other image_generation-edit caller in the codebase
// (product/background isolation) already sends quality: 'high' — these two
// render functions were the only callers silently falling back to OpenAI's
// default quality tier, which was the actual root cause of "copy/product
// replacement not visibly applying" client reports. Locked down here so it
// can't silently regress again.
test('renderFinalImage requests quality: \'high\' on the image_generation tool', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    freeRestyle: false,
    strongReferenceInfluence: false,
    instructions: '',
  }, { getClientFn: () => client })

  assert.deepEqual(getLastRequest().tools, [{ type: 'image_generation', action: 'edit', size: '1024x1024', quality: 'high' }])
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
    freeRestyle: false,
    strongReferenceInfluence: false,
    instructions: 'Make the background neon green.',
  }, { getClientFn: () => client })

  const textEntry = getLastRequest().input[0].content.find((c) => c.type === 'input_text')
  const styleRefIndex = textEntry.text.indexOf('light supplementary visual guidance')
  const instructionsIndex = textEntry.text.indexOf('Make the background neon green.')

  assert.notEqual(styleRefIndex, -1)
  assert.notEqual(instructionsIndex, -1)
  assert.ok(instructionsIndex > styleRefIndex)
})

// Part LL: freeRestyle/strongReferenceInfluence are the 2 image-side axes a
// single shared styleIntensity number used to force together silently —
// each independently settable now. These cover every one of the 4
// (freeRestyle x hasStyleReference-with-strongReferenceInfluence)
// combinations' actual wording.

test('renderFinalImage freeRestyle=false with a style reference tells the model to give it only light, non-conflicting influence', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    freeRestyle: false,
    strongReferenceInfluence: false,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: LOW/)
  assert.match(text, /light supplementary visual guidance/)
  assert.match(text, /competitor ad's own original treatment should still win/)
})

test('renderFinalImage freeRestyle=false with no style reference stays close to the original preservation wording, no third-image mention', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    freeRestyle: false,
    strongReferenceInfluence: false,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: LOW/)
  assert.match(text, /as close to the original reference ad as possible/)
  assert.match(text, /minor lighting\/color refinements are still acceptable/)
  assert.doesNotMatch(text, /third image/i)
})

test('renderFinalImage strongReferenceInfluence=true with a style reference actively prefers it as a strong influence', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    styleReferenceType: 'badge',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    freeRestyle: true,
    strongReferenceInfluence: true,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: HIGH/)
  assert.match(text, /Actively prefer our own reference material/)
  assert.match(text, /strong influence/)
})

test('renderFinalImage freeRestyle=true with no style reference falls back to the original freer-reinterpretation wording, not a third-image reference', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    freeRestyle: true,
    strongReferenceInfluence: true,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: HIGH/)
  assert.match(text, /reinterpret the lighting, color grading, and background styling more freely/)
  assert.doesNotMatch(text, /third image/i)
  assert.doesNotMatch(text, /Actively prefer our own reference material/)
})

// Part LL: full face replacement now fires purely off the
// strongReferenceInfluence checkbox + a model-type reference — no slider
// position involved at all any more.

test('renderFinalImage strongReferenceInfluence=true with a model-type style reference triggers a full face-swap instruction', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    styleReferenceType: 'model',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    freeRestyle: false,
    strongReferenceInfluence: true,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: MAXIMUM/)
  assert.match(text, /Completely replace the face/)
  assert.match(text, /full face swap, not a styling influence/)
  assert.match(text, /Keep the original ad's body pose, hand position, clothing, framing, lighting, and background exactly as they are/)
  assert.doesNotMatch(text, /Style intensity: HIGH/)
  assert.doesNotMatch(text, /Style intensity: LOW/)
})

test('renderFinalImage strongReferenceInfluence=true with a NON-model style reference (e.g. a badge) does NOT trigger a face swap', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    styleReferenceType: 'badge',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    freeRestyle: true,
    strongReferenceInfluence: true,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: HIGH/)
  assert.match(text, /Actively prefer our own reference material/)
  assert.doesNotMatch(text, /Style intensity: MAXIMUM/)
  assert.doesNotMatch(text, /face swap/i)
})

test('renderFinalImage strongReferenceInfluence=false with a model-type style reference does NOT trigger a face swap', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    styleReferenceType: 'model',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    freeRestyle: true,
    strongReferenceInfluence: false,
    instructions: '',
  }, { getClientFn: () => client })

  // Note: "used for a face swap" legitimately still appears in the
  // product-swap framing sentence at any setting once styleReferenceType is
  // 'model' (it always needs to clarify the third image's role) — the
  // MAXIMUM-tier-specific instruction ("Completely replace the face...") is
  // the actual thing that must NOT appear when the checkbox is unchecked.
  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: HIGH/)
  assert.doesNotMatch(text, /Style intensity: MAXIMUM/)
  assert.doesNotMatch(text, /Completely replace the face/)
  assert.doesNotMatch(text, /full face swap, not a styling influence/)
})

test('renderFinalImage MAXIMUM + model reference: the product-swap framing sentence distinguishes the product image from the face-reference image', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    styleReferenceType: 'model',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    freeRestyle: false,
    strongReferenceInfluence: true,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /used for a face swap/)
  assert.match(text, /NOT another product image/)
  assert.match(text, /Do not confuse the second image \(product\) with the third image \(face reference\)/)
})

// Part LL: all-false / all-true sanity checks across every axis this
// function actually branches on (freeRestyle, strongReferenceInfluence),
// each combined with hasStyleReference — the client-facing "does 0%
// actually look different from 100%" concern this whole part exists to fix.

test('renderFinalImage all axes false (with a non-model style reference) produces the most conservative combination', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    styleReferenceType: 'badge',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    freeRestyle: false,
    strongReferenceInfluence: false,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: LOW/)
  assert.match(text, /light supplementary visual guidance/)
  assert.doesNotMatch(text, /Actively prefer our own reference material/)
  assert.doesNotMatch(text, /reinterpret the lighting, color grading, and background styling more freely/)
})

test('renderFinalImage all axes true (with a model style reference) produces the most aggressive combination — a full face swap', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderFinalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    styleReferenceImageBase64: 'STYLE_B64',
    styleReferenceType: 'model',
    productInstances: [],
    replacements: [],
    format: FORMAT,
    freeRestyle: true,
    strongReferenceInfluence: true,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Style intensity: MAXIMUM/)
  assert.match(text, /Completely replace the face/)
})

// Part EE §8: renderConversationalImage — 생성 AI's own render function.

test('renderConversationalImage with zero material images sends exactly two input_image entries and a plain two-image framing', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderConversationalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    materialImages: [],
    productInstances: PRODUCT_INSTANCES,
    replacements: REPLACEMENTS,
    format: FORMAT,
    instructions: '',
  }, { getClientFn: () => client })

  const req = getLastRequest()
  const imageParts = req.input[0].content.filter((c) => c.type === 'input_image')
  assert.equal(imageParts.length, 2)

  const text = req.input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Image 1 is the original reference ad\. Image 2 is our product's reference photo\./)
  assert.doesNotMatch(text, /Image 3/)
})

test('renderConversationalImage builds one dynamic framing clause per material image, in order, naming its role', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderConversationalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    materialImages: [
      { role: 'background', imageBase64: 'BG_B64' },
      { role: 'copy-style', imageBase64: 'COPY_B64' },
    ],
    productInstances: PRODUCT_INSTANCES,
    replacements: REPLACEMENTS,
    format: FORMAT,
    instructions: '',
  }, { getClientFn: () => client })

  const req = getLastRequest()
  const imageParts = req.input[0].content.filter((c) => c.type === 'input_image')
  assert.equal(imageParts.length, 4)
  assert.equal(imageParts[2].image_url, 'data:image/png;base64,BG_B64')
  assert.equal(imageParts[3].image_url, 'data:image/png;base64,COPY_B64')

  const text = req.input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Image 3 is our background reference/)
  assert.match(text, /Image 4 is our brand's copy styling reference/)
})

test('renderConversationalImage includes the full face-replacement instruction only when a model-face material is present', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderConversationalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    materialImages: [{ role: 'model-face', imageBase64: 'FACE_B64' }],
    productInstances: [],
    replacements: [],
    format: FORMAT,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Image 3 is our model's face reference/)
  assert.match(text, /Completely replace the face/)
  assert.match(text, /full face swap, not a styling influence/)
})

test('renderConversationalImage reuses replacementInstructionFor/productSwapInstructionFor mechanics unchanged', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderConversationalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    materialImages: [],
    productInstances: PRODUCT_INSTANCES,
    replacements: REPLACEMENTS,
    format: FORMAT,
    instructions: '',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /Replacements: \[{"location":"top banner","original_text":"원본","new_text":"대체"}\]/)
  assert.match(text, /Seamlessly replace EVERY instance of the competitor's product/)
  assert.doesNotMatch(text, /third image/i, 'this call must not use productSwapInstructionFor\'s own old framing sentence')
})

test('renderConversationalImage appends free-text instructions verbatim at the end', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderConversationalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    materialImages: [],
    productInstances: [],
    replacements: [],
    format: FORMAT,
    instructions: '제품을 조금 더 크게',
  }, { getClientFn: () => client })

  const text = getLastRequest().input[0].content.find((c) => c.type === 'input_text').text
  assert.match(text, /제품을 조금 더 크게$/)
})

// Part HH: same quality regression guard as renderFinalImage's own test
// above, for 생성 AI's render function.
test('renderConversationalImage requests quality: \'high\' on the image_generation tool', async () => {
  const { client, getLastRequest } = fakeClient()

  await renderConversationalImage({
    referenceImageBase64: 'REF_B64',
    productImageBase64: 'PROD_B64',
    materialImages: [],
    productInstances: [],
    replacements: [],
    format: FORMAT,
    instructions: '',
  }, { getClientFn: () => client })

  assert.deepEqual(getLastRequest().tools, [{ type: 'image_generation', action: 'edit', size: '1024x1024', quality: 'high' }])
})
