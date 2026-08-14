import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDetectionResult, buildProductIsolationPrompt, extractProductImage,
} from '../src/services/generation/productImageExtraction.service.js'
import { PRODUCT_COLUMNS } from '../src/mappers/product.mapper.js'

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

test('buildProductIsolationPrompt uses a dedicated background-preserving prompt for a background entity, not the generic white-card wording', () => {
  const prompt = buildProductIsolationPrompt(
    { type: 'background', label: '배경', description: 'Warm wooden studio backdrop with soft daylight' }, 3
  )

  assert.match(prompt, /^Isolate ONLY the background\/backdrop described as: Warm wooden studio backdrop with soft daylight\./)
  // The generic branch's own "Remove the background... plain solid white
  // background" wording would be self-contradictory here — a background
  // entity's whole point is to preserve the real backdrop, not swap it for
  // a white card.
  assert.doesNotMatch(prompt, /plain solid white background/)
  assert.doesNotMatch(prompt, /Remove the background/)
  assert.match(prompt, /Remove the product\(s\), any human model, hands, staging props/)
  assert.match(prompt, /filling the full frame/)
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

// AA-1: idempotency-guard coverage. A fake Sheets client backs
// getAllProducts — real network calls (downloadImageAsBase64, OpenAI) are
// never reached on the skip path, and are proven not to be reached by
// leaving 'Image URL' blank: if the skip check didn't fire, the function
// would hit the "has no raw image" throw instead of returning cleanly.
// config.brands is read from env at module load — healthykiki/헬시키키 is
// the one real brand configured throughout this project's test
// fixtures/manual testing (same assumption generation.service.test.js
// already makes).
const BRAND_KEY = 'healthykiki'
const BRAND_NAME = '헬시키키'
const PRODUCT_ID = '999888777'

function buildProductRow(overrides = {}) {
  const values = {
    'Product ID': PRODUCT_ID,
    'Brand': BRAND_NAME,
    ...overrides,
  }
  return PRODUCT_COLUMNS.map((c) => values[c] ?? '')
}

function makeFakeProductSheets(existingRow) {
  return {
    spreadsheets: {
      get: async () => ({ data: { sheets: [{ properties: { title: '제품' } }] } }),
      values: {
        get: async ({ range }) => {
          if (range.includes('A1:R1')) return { data: { values: [[...PRODUCT_COLUMNS]] } }
          return { data: { values: [[...PRODUCT_COLUMNS], existingRow] } }
        },
      },
    },
  }
}

// Adds a values.update handler (capturing the write) on top of
// makeFakeProductSheets, for tests that exercise updateProductField's real
// write path (i.e. anything that gets past the idempotency skip).
function makeFakeProductSheetsForWrite(existingRow, captured) {
  const base = makeFakeProductSheets(existingRow)
  base.spreadsheets.values.update = async ({ range, requestBody }) => {
    captured.update = { range, requestBody }
    return { data: {} }
  }
  return base
}

test('extractProductImage returns the stored references without touching OpenAI when they already exist and force is not set', async () => {
  const storedReferences = [
    { type: 'product', label: '제품', imageUrl: 'https://drive.google.com/file/d/existing/view', extractedAt: '2026-08-01T00:00:00.000Z' },
  ]
  const row = buildProductRow({ 'Extracted References JSON': JSON.stringify(storedReferences) }) // 'Image URL' left blank
  const fakeSheets = makeFakeProductSheets(row)

  const result = await extractProductImage(BRAND_KEY, PRODUCT_ID, { getClientFn: () => fakeSheets })

  assert.deepEqual(result, { references: storedReferences })
})

test('extractProductImage ignores stored references and attempts the real pipeline when force is true', async () => {
  const storedReferences = [
    { type: 'product', label: '제품', imageUrl: 'https://drive.google.com/file/d/existing/view', extractedAt: '2026-08-01T00:00:00.000Z' },
  ]
  const row = buildProductRow({ 'Extracted References JSON': JSON.stringify(storedReferences) }) // 'Image URL' left blank
  const fakeSheets = makeFakeProductSheets(row)

  await assert.rejects(
    () => extractProductImage(BRAND_KEY, PRODUCT_ID, { force: true, getClientFn: () => fakeSheets }),
    /has no raw image/,
    'with force:true and no raw image, the real pipeline must actually be attempted (and fail there), not silently short-circuited to the stale stored data'
  )
})

test('extractProductImage attempts the real pipeline normally when no references are stored yet', async () => {
  const row = buildProductRow() // no Extracted References JSON, 'Image URL' also left blank
  const fakeSheets = makeFakeProductSheets(row)

  await assert.rejects(
    () => extractProductImage(BRAND_KEY, PRODUCT_ID, { getClientFn: () => fakeSheets }),
    /has no raw image/,
    'a genuinely unextracted product must still attempt the real pipeline, not be mistakenly skipped'
  )
})

// AA-2: simulated partial-failure coverage — detection/isolation/upload/
// download are all injected fakes (no real OpenAI/Drive call anywhere in
// this test), with the middle entity's isolateEntityFn deliberately
// throwing, so this proves the OTHER two entities' already-"paid" results
// are still saved rather than the whole run being discarded.
test('extractProductImage saves whatever entities succeeded when one entity fails partway through, rather than discarding everything', async () => {
  const row = buildProductRow({ 'Image URL': 'https://cdn.example.com/raw-product-photo.jpg' })
  const captured = {}
  const fakeSheets = makeFakeProductSheetsForWrite(row, captured)

  const fakeEntities = [
    { type: 'product', label: '제품', description: 'the main product' },
    { type: 'human_model', label: '모델', description: 'a person holding it' },
    { type: 'promo_badge', label: '프로모션 배지', description: 'a red sticker' },
  ]

  const result = await extractProductImage(BRAND_KEY, PRODUCT_ID, {
    getClientFn: () => fakeSheets,
    downloadImageAsBase64Fn: async () => ({ base64: 'fake-base64', mimeType: 'image/png' }),
    detectEntitiesFn: async () => ({ entities: fakeEntities }),
    isolateEntityFn: async (base64, mimeType, prompt) => {
      // The middle entity (index 1, human_model) fails; the other two
      // "succeed" and would each be a real, separately-paid
      // image_generation charge in production.
      if (prompt.includes('human model')) {
        throw new Error('content_policy_violation: simulated transient isolation failure')
      }
      return 'fake-result-base64'
    },
    uploadImageFn: async (resultBase64, { fileName }) => `https://drive.google.com/file/d/${fileName}/view`,
  })

  assert.equal(result.references.length, 2, 'both successful entities must be persisted, not just discarded because the third failed')
  assert.equal(result.failures.length, 1)
  assert.equal(result.failures[0].type, 'human_model')
  assert.match(result.failures[0].error, /simulated transient isolation failure/)

  // The two successful entities are real product/promo_badge results, not
  // placeholders — and the failed human_model entity is genuinely absent,
  // not present-with-an-error-marker.
  assert.deepEqual(result.references.map((r) => r.type).sort(), ['product', 'promo_badge'].sort())

  // Confirms the sheet write actually happened with exactly the 2
  // successful references — this is the persistence half of the claim,
  // not just the in-memory return value.
  assert.ok(captured.update, 'updateProductField must have written the partial results to the sheet')
  const writtenReferences = JSON.parse(captured.update.requestBody.values[0][0])
  assert.equal(writtenReferences.length, 2)
})
