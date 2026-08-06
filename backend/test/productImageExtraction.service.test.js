import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDetectionResult, buildProductIsolationPrompt,
} from '../src/services/productImageExtraction.service.js'

test('parseDetectionResult normalizes a mix of visual and text entities', () => {
  const raw = JSON.stringify({
    entities: [
      { kind: 'visual', type: 'product', label: '유산균 A', description: 'White bottle, left side' },
      { kind: 'visual', type: 'human_model', label: '모델', description: 'Woman holding the bottle, smiling' },
      { kind: 'text', type: 'headline_copy', label: '헤드라인', text: '수량 소진시' },
      { kind: 'text', type: 'promo_phrase', label: '프로모션 문구', text: '품절임박' },
    ],
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities.length, 4)
  assert.deepEqual(result.entities[0], { kind: 'visual', type: 'product', label: '유산균 A', description: 'White bottle, left side' })
  assert.deepEqual(result.entities[1], { kind: 'visual', type: 'human_model', label: '모델', description: 'Woman holding the bottle, smiling' })
  assert.deepEqual(result.entities[2], { kind: 'text', type: 'headline_copy', label: '헤드라인', text: '수량 소진시' })
  assert.deepEqual(result.entities[3], { kind: 'text', type: 'promo_phrase', label: '프로모션 문구', text: '품절임박' })
})

test('parseDetectionResult falls back to one generic visual product entity when entities is empty', () => {
  const raw = JSON.stringify({ entities: [] })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities.length, 1)
  assert.equal(result.entities[0].kind, 'visual')
  assert.equal(result.entities[0].type, 'product')
  assert.equal(result.entities[0].label, '제품')
  assert.ok(result.entities[0].description)
})

test('parseDetectionResult defaults a missing/invalid kind to visual rather than dropping the entity', () => {
  const raw = JSON.stringify({
    entities: [{ type: 'logo', label: '로고', description: 'small logo top-left' }],
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities.length, 1)
  assert.equal(result.entities[0].kind, 'visual')
})

test('parseDetectionResult drops a visual entity with no description', () => {
  const raw = JSON.stringify({
    entities: [
      { kind: 'visual', type: 'product', label: 'valid', description: 'a real product' },
      { kind: 'visual', type: 'logo', label: 'bad' },
    ],
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities.length, 1)
  assert.equal(result.entities[0].label, 'valid')
})

test('parseDetectionResult drops a text entity with no text', () => {
  const raw = JSON.stringify({
    entities: [
      { kind: 'text', type: 'headline_copy', label: 'valid', text: '진짜 헤드라인' },
      { kind: 'text', type: 'promo_phrase', label: 'bad' },
    ],
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities.length, 1)
  assert.equal(result.entities[0].text, '진짜 헤드라인')
})

test('parseDetectionResult drops malformed entries (null, non-object, missing type/label) rather than throwing', () => {
  const raw = JSON.stringify({
    entities: [
      { kind: 'visual', type: 'product', label: 'valid', description: 'a real product' },
      null,
      'not an object',
      {},
    ],
  })

  const result = parseDetectionResult(raw)

  // {} has no description and defaults kind to 'visual', so it's dropped
  // for lacking a description — only the genuinely valid entry survives.
  assert.equal(result.entities.length, 1)
  assert.equal(result.entities[0].label, 'valid')
})

test('parseDetectionResult defaults label to a generic Korean placeholder when missing', () => {
  const raw = JSON.stringify({
    entities: [{ kind: 'visual', type: 'promo_badge', description: 'a red sticker top-right' }],
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities[0].label, '항목')
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

test('buildProductIsolationPrompt uses the original unscoped wording when there is only one visual entity', () => {
  const prompt = buildProductIsolationPrompt({ type: 'product', label: '제품', description: 'the main product' }, 1)

  assert.match(prompt, /^Isolate ONLY the product from this photo\./)
  assert.doesNotMatch(prompt, /described as/)
})

test('buildProductIsolationPrompt scopes the prompt to the entity description when there are multiple visual entities', () => {
  const prompt = buildProductIsolationPrompt(
    { type: 'product', label: '유산균 A', description: 'White bottle, left side' }, 2
  )

  assert.match(prompt, /^Isolate ONLY the product described as: White bottle, left side\./)
})

test('buildProductIsolationPrompt targets the human model by name for a human_model entity', () => {
  const prompt = buildProductIsolationPrompt(
    { type: 'human_model', label: '모델', description: 'Woman holding the bottle' }, 2
  )

  assert.match(prompt, /^Isolate ONLY the human model \(person\) described as: Woman holding the bottle\./)
})

test('buildProductIsolationPrompt falls back to the entity\'s own label/type for any other free-form visual type', () => {
  const prompt = buildProductIsolationPrompt(
    { type: 'promo_badge', label: '프로모션 배지', description: 'red circular sticker, top-right' }, 2
  )

  assert.match(prompt, /^Isolate ONLY the 프로모션 배지 described as: red circular sticker, top-right\./)
})

test('buildProductIsolationPrompt still carries the same white-background/preserve-appearance constraints in every case', () => {
  const scoped = buildProductIsolationPrompt({ type: 'product', description: 'x' }, 2)
  const unscoped = buildProductIsolationPrompt({ type: 'product', description: 'x' }, 1)
  const model = buildProductIsolationPrompt({ type: 'human_model', description: 'x' }, 2)

  for (const prompt of [scoped, unscoped, model]) {
    assert.match(prompt, /plain solid white background/)
    assert.match(prompt, /Do not.*crop off any part of it/)
  }
})
