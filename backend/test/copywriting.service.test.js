import test from 'node:test'
import assert from 'node:assert/strict'
import { writeReplacementCopy, styleIntensityInstructionFor } from '../src/services/copywriting.service.js'

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

test('styleIntensityInstructionFor LOW (<=33) restates strict preservation and nearly-identical length', () => {
  const text = styleIntensityInstructionFor(20)
  assert.match(text, /Style intensity: LOW/)
  assert.match(text, /Strictly preserve the original hook, tone, and wording/)
  assert.match(text, /nearly identical to/)
})

test('styleIntensityInstructionFor MEDIUM (<=66) allows override-sourced phrasing closer to its own wording, reasonably close length', () => {
  const text = styleIntensityInstructionFor(50)
  assert.match(text, /Style intensity: MEDIUM/)
  assert.match(text, /closer to its own wording/)
  assert.match(text, /reasonably close/)
  // Explicitly relaxes LOW's "must be nearly identical" requirement — the
  // text does mention "not nearly identical" as part of that relaxation,
  // so the check is for the LOW tier's own imperative phrasing, not a ban
  // on the substring "nearly identical" showing up at all.
  assert.doesNotMatch(text, /length must be nearly identical/)
})

test('styleIntensityInstructionFor HIGH (>66) prioritizes our own brand voice close to verbatim, loosened length matching', () => {
  const text = styleIntensityInstructionFor(90)
  assert.match(text, /Style intensity: HIGH/)
  assert.match(text, /Prioritize our own brand voice/)
  assert.match(text, /close to verbatim/)
  assert.match(text, /loosened substantially/)
})

test('styleIntensityInstructionFor tier boundaries match renderImage.service.js\'s own <=33/<=66 buckets', () => {
  assert.match(styleIntensityInstructionFor(33), /LOW/)
  assert.match(styleIntensityInstructionFor(34), /MEDIUM/)
  assert.match(styleIntensityInstructionFor(66), /MEDIUM/)
  assert.match(styleIntensityInstructionFor(67), /HIGH/)
})

test('writeReplacementCopy appends the styleIntensity tier instruction into the user prompt, SYSTEM_PROMPT unchanged', async () => {
  const { client, getLastRequest } = fakeClient()

  await writeReplacementCopy(
    [{ location: 'top', text: '원본 텍스트' }],
    [{ category: '가격', fact: '29,900원' }],
    90,
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
