import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDetectionResult, buildProductIsolationPrompt,
} from '../src/services/productImageExtraction.service.js'

// Part V: every entity is now isolated as its own image (no more visual/text
// kind split) — these tests reflect the all-visual shape. A phrase entity
// still carries an additive "text" field for its verbatim transcription.

test('parseDetectionResult normalizes entities, carrying the additive text field only for phrase entities', () => {
  const raw = JSON.stringify({
    entities: [
      { type: 'product', label: '유산균 A', description: 'White bottle, left side' },
      { type: 'human_model', label: '모델', description: 'Woman holding the bottle, smiling' },
      { type: 'headline_copy', label: '헤드라인', description: 'Bold red text top of frame', text: '수량 소진시' },
      { type: 'promo_phrase', label: '프로모션 문구', description: 'Yellow highlight banner', text: '품절임박' },
      { type: 'authority_badge', label: '전문가 인증', description: 'Doctor photo+title stamp, bottom-right' },
    ],
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities.length, 5)
  assert.deepEqual(result.entities[0], { type: 'product', label: '유산균 A', description: 'White bottle, left side' })
  assert.deepEqual(result.entities[1], { type: 'human_model', label: '모델', description: 'Woman holding the bottle, smiling' })
  assert.deepEqual(result.entities[2], {
    type: 'headline_copy', label: '헤드라인', description: 'Bold red text top of frame', text: '수량 소진시',
  })
  assert.deepEqual(result.entities[3], {
    type: 'promo_phrase', label: '프로모션 문구', description: 'Yellow highlight banner', text: '품절임박',
  })
  assert.deepEqual(result.entities[4], {
    type: 'authority_badge', label: '전문가 인증', description: 'Doctor photo+title stamp, bottom-right',
  })
})

test('parseDetectionResult falls back to one generic product entity when entities is empty', () => {
  const raw = JSON.stringify({ entities: [] })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities.length, 1)
  assert.equal(result.entities[0].type, 'product')
  assert.equal(result.entities[0].label, '제품')
  assert.ok(result.entities[0].description)
  assert.equal(result.entities[0].text, undefined)
})

test('parseDetectionResult drops an entity with no description, since every entity must be isolatable now', () => {
  const raw = JSON.stringify({
    entities: [
      { type: 'product', label: 'valid', description: 'a real product' },
      { type: 'logo', label: 'bad' },
    ],
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities.length, 1)
  assert.equal(result.entities[0].label, 'valid')
})

test('parseDetectionResult ignores a blank/whitespace-only text field rather than attaching it', () => {
  const raw = JSON.stringify({
    entities: [{ type: 'headline_copy', label: '헤드라인', description: 'red bold text', text: '   ' }],
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities.length, 1)
  assert.equal(result.entities[0].text, undefined)
})

test('parseDetectionResult drops malformed entries (null, non-object, missing description) rather than throwing', () => {
  const raw = JSON.stringify({
    entities: [
      { type: 'product', label: 'valid', description: 'a real product' },
      null,
      'not an object',
      {},
    ],
  })

  const result = parseDetectionResult(raw)

  // {} has no description, so it's dropped — only the genuinely valid entry
  // survives.
  assert.equal(result.entities.length, 1)
  assert.equal(result.entities[0].label, 'valid')
})

test('parseDetectionResult defaults label to a generic Korean placeholder when missing', () => {
  const raw = JSON.stringify({
    entities: [{ type: 'promo_badge', description: 'a red sticker top-right' }],
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities[0].label, '항목')
})

test('parseDetectionResult defaults type to product when missing', () => {
  const raw = JSON.stringify({
    entities: [{ label: '무언가', description: 'an unlabeled thing' }],
  })

  const result = parseDetectionResult(raw)

  assert.equal(result.entities[0].type, 'product')
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

test('buildProductIsolationPrompt uses the original unscoped wording when there is only one entity', () => {
  const prompt = buildProductIsolationPrompt({ type: 'product', label: '제품', description: 'the main product' }, 1)

  assert.match(prompt, /^Isolate ONLY the product from this photo\./)
  assert.doesNotMatch(prompt, /described as/)
})

test('buildProductIsolationPrompt scopes the prompt to the entity description when there are multiple entities', () => {
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

test('buildProductIsolationPrompt falls back to the entity\'s own label/type for any other free-form type', () => {
  const prompt = buildProductIsolationPrompt(
    { type: 'promo_badge', label: '프로모션 배지', description: 'red circular sticker, top-right' }, 2
  )

  assert.match(prompt, /^Isolate ONLY the 프로모션 배지 described as: red circular sticker, top-right\./)
})

test('buildProductIsolationPrompt works the same for a phrase entity as any other visual (Part V)', () => {
  const prompt = buildProductIsolationPrompt(
    { type: 'headline_copy', label: '헤드라인', description: 'Bold red serif text, top banner' }, 3
  )

  assert.match(prompt, /^Isolate ONLY the 헤드라인 described as: Bold red serif text, top banner\./)
  assert.match(prompt, /plain solid white background/)
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
