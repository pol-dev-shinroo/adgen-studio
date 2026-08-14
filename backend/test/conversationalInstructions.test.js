import test from 'node:test'
import assert from 'node:assert/strict'
import { buildConversationalInstructions } from '../src/services/generation/conversationalInstructions.js'

test('buildConversationalInstructions covers all three modes across background/text/model/product, mentioning the right roles', () => {
  const decisions = {
    background: { mode: 'keep', value: null },
    texts: {
      'text-1': { mode: 'replace', value: 'https://example.com/copy-style.png' },
      'text-2': { mode: 'custom', value: '이 문구는 더 짧게 써줘' },
    },
    model: { mode: 'replace', value: 'https://example.com/model.png' },
    product: { mode: 'keep', value: null },
  }

  const text = buildConversationalInstructions(decisions, { productInstances: [], replacements: [] })

  assert.match(text, /Background: preserve as in the original ad/)
  assert.match(text, /Text segment "text-1": replace with the provided reference image/)
  assert.match(text, /Text segment "text-2" \(custom instruction\): 이 문구는 더 짧게 써줘/)
  assert.match(text, /Model: replace with the provided reference image/)
  assert.match(text, /Product: preserve as in the original ad/)
})

test('a "keep" decision with a picked factual value mentions that value, not a bare preserve', () => {
  const decisions = {
    background: null, texts: {}, model: null,
    product: { mode: 'keep', value: null },
  }
  const withFactual = { ...decisions, texts: { 'text-1': { mode: 'keep', value: '최대 81% 할인' } } }

  const text = buildConversationalInstructions(withFactual, {})
  assert.match(text, /Text segment "text-1": preserve as in the original ad, but use this specific value where a fact must differ — "최대 81% 할인"/)
})

test('omits the model instruction entirely when no model decision was made', () => {
  const decisions = { background: { mode: 'keep', value: null }, texts: {}, model: null, product: { mode: 'keep', value: null } }
  const text = buildConversationalInstructions(decisions, {})
  assert.doesNotMatch(text, /Model:/)
})

test('notes more than one product instance when productInstances has multiple entries', () => {
  const decisions = { background: { mode: 'keep', value: null }, texts: {}, model: null, product: { mode: 'keep', value: null } }
  const text = buildConversationalInstructions(decisions, {
    productInstances: [{ location: 'left' }, { location: 'right' }],
  })
  assert.match(text, /Product: preserve as in the original ad\. \(2 instances in the original ad\)/)
})

test('adds a fallback note when text decisions exist but analysis found zero replacements', () => {
  const decisions = {
    background: { mode: 'keep', value: null }, texts: { 'text-1': { mode: 'keep', value: null } },
    model: null, product: { mode: 'keep', value: null },
  }
  const text = buildConversationalInstructions(decisions, { replacements: [] })
  assert.match(text, /analysis found no specific text replacements/)
})
