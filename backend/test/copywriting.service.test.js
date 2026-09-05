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

test('styleIntensityInstructionFor verbatimCopy=false restates strict preservation, nearly-identical length, but tolerates minor adjustments to real selected phrasing', () => {
  const text = styleIntensityInstructionFor(false)
  assert.match(text, /Style intensity: LOW/)
  assert.match(text, /Strictly preserve the original hook, tone, and wording/)
  assert.match(text, /nearly identical to/)
  assert.match(text, /minor, reasonable wording adjustments are still fine/)
})

test('styleIntensityInstructionFor verbatimCopy=true prioritizes our own brand voice close to verbatim, loosened length matching', () => {
  const text = styleIntensityInstructionFor(true)
  assert.match(text, /Style intensity: HIGH/)
  assert.match(text, /Prioritize our own brand voice/)
  assert.match(text, /close to verbatim/)
  assert.match(text, /loosened substantially/)
})

test('styleIntensityInstructionFor false and true produce genuinely distinct tiers', () => {
  assert.match(styleIntensityInstructionFor(false), /LOW/)
  assert.doesNotMatch(styleIntensityInstructionFor(false), /HIGH/)
  assert.match(styleIntensityInstructionFor(true), /HIGH/)
  assert.doesNotMatch(styleIntensityInstructionFor(true), /LOW/)
})

test('writeReplacementCopy appends the verbatimCopy tier instruction into the user prompt, SYSTEM_PROMPT unchanged', async () => {
  const { client, getLastRequest } = fakeClient()

  await writeReplacementCopy(
    [{ location: 'top', text: '원본 텍스트' }],
    [{ category: '가격', fact: '29,900원' }],
    true,
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

test('writeReplacementCopy with verbatimCopy=false appends the LOW tier instruction', async () => {
  const { client, getLastRequest } = fakeClient()

  await writeReplacementCopy(
    [{ location: 'top', text: '원본 텍스트' }],
    [{ category: '가격', fact: '29,900원' }],
    false,
    { getClientFn: () => client }
  )

  const userMessage = getLastRequest().input.find((m) => m.role === 'user')
  assert.match(userMessage.content, /Style intensity: LOW/)
  assert.match(userMessage.content, /Strictly preserve the original hook, tone, and wording/)
})
