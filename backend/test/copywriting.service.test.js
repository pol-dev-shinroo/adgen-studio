import test from 'node:test'
import assert from 'node:assert/strict'
import { writeReplacementCopy, styleIntensityInstructionFor } from '../src/services/generation/copywriting.service.js'

// Part U-2: this file had zero tests before this part — same gap Part Q
// found and fixed for renderImage.service.js. Same DI-fake-client
// convention: no real OpenAI call anywhere in this suite.
function fakeClient() {
  let lastRequest = null
  const client = {
    responses: {
      create: async (request) => {
        lastRequest = request
        return { output_text: JSON.stringify({ replacements: [] }) }
      },
    },
  }
  return { client, getLastRequest: () => lastRequest }
}

// Part LL: styleIntensityInstructionFor now takes an explicit verbatimCopy
// boolean instead of a 0-100 number — the copy-side counterpart to
// renderImage.service.js's freeRestyle/strongReferenceInfluence booleans.
// The old MEDIUM tier folded into the false/LOW side (see that function's
// own comment for why).

test('styleIntensityInstructionFor verbatimCopy=false, creativeCopy=false restates strict preservation, nearly-identical length, but tolerates minor adjustments to real selected phrasing', () => {
  const text = styleIntensityInstructionFor(false, false)
  assert.match(text, /Style intensity: LOW/)
  assert.match(text, /Strictly preserve the original hook, tone, and wording/)
  assert.match(text, /nearly identical to/)
  assert.match(text, /minor, reasonable wording adjustments are still fine/)
})

test('styleIntensityInstructionFor verbatimCopy=true, creativeCopy=false prioritizes our own brand voice close to verbatim, loosened length matching', () => {
  const text = styleIntensityInstructionFor(true, false)
  assert.match(text, /Style intensity: HIGH/)
  assert.match(text, /Prioritize our own brand voice/)
  assert.match(text, /close to verbatim/)
  assert.match(text, /loosened substantially/)
})

test('styleIntensityInstructionFor false and true produce genuinely distinct tiers', () => {
  assert.match(styleIntensityInstructionFor(false, false), /LOW/)
  assert.doesNotMatch(styleIntensityInstructionFor(false, false), /HIGH/)
  assert.match(styleIntensityInstructionFor(true, false), /HIGH/)
  assert.doesNotMatch(styleIntensityInstructionFor(true, false), /LOW/)
})

// Part MM: creativeCopy is a genuinely different axis (is the model allowed
// to rewrite the hook at all), not a stronger version of verbatimCopy — it
// must take priority regardless of verbatimCopy's value.

test('styleIntensityInstructionFor creativeCopy=true returns the CREATIVE REWRITE instruction, ignoring verbatimCopy', () => {
  const text = styleIntensityInstructionFor(false, true)
  assert.match(text, /Style: CREATIVE REWRITE/)
  assert.match(text, /creatively rewrite each piece of text into a compelling, benefit-driven marketing hook/)
  assert.match(text, /rather than just listing what we have/)
  assert.doesNotMatch(text, /Style intensity: LOW/)
  assert.doesNotMatch(text, /Style intensity: HIGH/)
})

test('styleIntensityInstructionFor creativeCopy=true takes priority over verbatimCopy=true too', () => {
  const text = styleIntensityInstructionFor(true, true)
  assert.match(text, /Style: CREATIVE REWRITE/)
  assert.doesNotMatch(text, /Style intensity: HIGH/)
  assert.doesNotMatch(text, /Prioritize our own brand voice/)
})

test('writeReplacementCopy appends the verbatimCopy tier instruction into the user prompt, SYSTEM_PROMPT unchanged', async () => {
  const { client, getLastRequest } = fakeClient()

  await writeReplacementCopy(
    [{ location: 'top', text: '원본 텍스트' }],
    [{ category: '가격', fact: '29,900원' }],
    true, false, null,
    { getClientFn: () => client }
  )

  const req = getLastRequest()
  const userMessage = req.input.find((m) => m.role === 'user')
  const systemMessage = req.input.find((m) => m.role === 'system')

  assert.match(userMessage.content, /Style intensity: HIGH/)
  assert.match(userMessage.content, /Prioritize our own brand voice/)
  // SYSTEM_PROMPT itself carries the n8n-original JSON contract verbatim —
  // this part must never touch it, only append to the user prompt.
  assert.match(systemMessage.content, /Lead Copywriter AI/)
  assert.doesNotMatch(systemMessage.content, /Style intensity/)
})

test('writeReplacementCopy with verbatimCopy=false, creativeCopy=false appends the LOW tier instruction', async () => {
  const { client, getLastRequest } = fakeClient()

  await writeReplacementCopy(
    [{ location: 'top', text: '원본 텍스트' }],
    [{ category: '가격', fact: '29,900원' }],
    false, false, null,
    { getClientFn: () => client }
  )

  const userMessage = getLastRequest().input.find((m) => m.role === 'user')
  assert.match(userMessage.content, /Style intensity: LOW/)
  assert.match(userMessage.content, /Strictly preserve the original hook, tone, and wording/)
})

test('writeReplacementCopy with creativeCopy=true appends the CREATIVE REWRITE instruction regardless of verbatimCopy', async () => {
  const { client, getLastRequest } = fakeClient()

  await writeReplacementCopy(
    [{ location: 'top', text: '원본 텍스트' }],
    [{ category: '가격', fact: '29,900원' }],
    true, true, null,
    { getClientFn: () => client }
  )

  const userMessage = getLastRequest().input.find((m) => m.role === 'user')
  assert.match(userMessage.content, /Style: CREATIVE REWRITE/)
})

// Part QQ: productFacts grounds copy in what the SPECIFIC selected product
// actually does, additive to (not replacing) counterFacts — especially
// important for creativeCopy mode, which previously had nothing but a thin
// competitor-shaped fact list to draw on when rewriting a hook.

test('writeReplacementCopy omits the product-facts block entirely when productFacts is null', async () => {
  const { client, getLastRequest } = fakeClient()

  await writeReplacementCopy(
    [{ location: 'top', text: '원본 텍스트' }],
    [{ category: '가격', fact: '29,900원' }],
    false, false, null,
    { getClientFn: () => client }
  )

  const userMessage = getLastRequest().input.find((m) => m.role === 'user')
  assert.doesNotMatch(userMessage.content, /what our product actually does/)
})

test('writeReplacementCopy includes productFacts as grounding context, distinct from counterFacts, when present', async () => {
  const { client, getLastRequest } = fakeClient()
  const productFacts = {
    productName: '컨투올잇', productFeatures: '100% 식물성 원료', productBenefits: '탄력 개선', productPainPoint: '피부 탄력 저하',
  }

  await writeReplacementCopy(
    [{ location: 'top', text: '원본 텍스트' }],
    [{ category: '가격', fact: '29,900원' }],
    false, true, productFacts,
    { getClientFn: () => client }
  )

  const userMessage = getLastRequest().input.find((m) => m.role === 'user')
  assert.match(userMessage.content, /what our product actually does/)
  assert.match(userMessage.content, /탄력 개선/)
  assert.match(userMessage.content, /피부 탄력 저하/)
  // Grounding context, not another fact list to mechanically recite.
  assert.match(userMessage.content, /not a list of facts to recite verbatim/)
})

test('writeReplacementCopy with two different productFacts inputs produces genuinely different prompts for the same competitor text/counterFacts', async () => {
  const { client: clientA, getLastRequest: getLastA } = fakeClient()
  const { client: clientB, getLastRequest: getLastB } = fakeClient()
  const sameExtractedTexts = [{ location: 'top', text: '원본 텍스트' }]
  const sameCounterFacts = [{ category: '가격', fact: '29,900원' }]

  await writeReplacementCopy(
    sameExtractedTexts, sameCounterFacts, false, true,
    { productName: '제품A', productFeatures: '100% 식물성 원료', productBenefits: '탄력 개선', productPainPoint: '피부 탄력 저하' },
    { getClientFn: () => clientA }
  )
  await writeReplacementCopy(
    sameExtractedTexts, sameCounterFacts, false, true,
    { productName: '제품B', productFeatures: '고농축 비타민C', productBenefits: '미백 개선', productPainPoint: '칙칙한 피부톤' },
    { getClientFn: () => clientB }
  )

  const promptA = getLastA().input.find((m) => m.role === 'user').content
  const promptB = getLastB().input.find((m) => m.role === 'user').content
  assert.notEqual(promptA, promptB)
  assert.match(promptA, /탄력 개선/)
  assert.match(promptB, /미백 개선/)
})
