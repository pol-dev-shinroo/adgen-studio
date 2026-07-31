import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDetectionResult, buildProductIsolationPrompt, MODEL_ISOLATION_PROMPT,
} from '../src/services/productImageExtraction.service.js'

test('parseDetectionResult normalizes a multi-product photo with a human model present', () => {
  const raw = JSON.stringify({
    products: [
      { label: '유산균 A', description: 'White bottle, left side' },
      { label: '유산균 B', description: 'Blue bottle, right side' },
    ],
    human_model: { present: true, description: 'Woman holding both bottles, smiling' },
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.products.length, 2)
  assert.equal(result.products[0].label, '유산균 A')
  assert.equal(result.products[0].description, 'White bottle, left side')
  assert.equal(result.human_model.present, true)
  assert.equal(result.human_model.description, 'Woman holding both bottles, smiling')
})

test('parseDetectionResult falls back to one generic product entity when products is empty', () => {
  const raw = JSON.stringify({ products: [], human_model: { present: false, description: '' } })

  const result = parseDetectionResult(raw)

  assert.equal(result.products.length, 1)
  assert.equal(result.products[0].label, '제품')
  assert.ok(result.products[0].description)
})

test('parseDetectionResult defaults human_model.present to false when the field is missing entirely', () => {
  const raw = JSON.stringify({ products: [{ label: 'A', description: 'a bottle' }] })

  const result = parseDetectionResult(raw)

  assert.equal(result.human_model.present, false)
  assert.equal(result.human_model.description, '')
})

test('parseDetectionResult drops malformed product entries (no description) rather than including them', () => {
  const raw = JSON.stringify({
    products: [{ label: 'valid', description: 'a real product' }, { label: 'bad' }, null, 'not an object'],
    human_model: { present: false },
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.products.length, 1)
  assert.equal(result.products[0].label, 'valid')
})

test('parseDetectionResult throws a clear error on genuinely invalid JSON', () => {
  assert.throws(
    () => parseDetectionResult('not json at all'),
    (err) => {
      assert.match(err.message, /invalid JSON/)
      return true
    }
  )
})

test('buildProductIsolationPrompt uses the original unscoped wording when there is only one product', () => {
  const prompt = buildProductIsolationPrompt({ label: '제품', description: 'the main product' }, 1)

  assert.match(prompt, /^Isolate ONLY the product from this photo\./)
  assert.doesNotMatch(prompt, /described as/)
})

test('buildProductIsolationPrompt scopes the prompt to the entity description when there are multiple products', () => {
  const prompt = buildProductIsolationPrompt({ label: '유산균 A', description: 'White bottle, left side' }, 2)

  assert.match(prompt, /^Isolate ONLY the product described as: White bottle, left side\./)
})

test('buildProductIsolationPrompt still carries the same white-background/preserve-appearance constraints in both cases', () => {
  const scoped = buildProductIsolationPrompt({ description: 'x' }, 2)
  const unscoped = buildProductIsolationPrompt({ description: 'x' }, 1)

  for (const prompt of [scoped, unscoped]) {
    assert.match(prompt, /plain solid white background/)
    assert.match(prompt, /Do not.*crop off any part of the product/)
  }
})

test('MODEL_ISOLATION_PROMPT targets the human model and removes the product(s)/background/props', () => {
  assert.match(MODEL_ISOLATION_PROMPT, /human model \(person\)/)
  assert.match(MODEL_ISOLATION_PROMPT, /Remove the .*product\(s\), background, and props/)
})
