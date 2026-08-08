import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAdCopyResult, extractAdReferenceImage } from '../src/services/generation/adImageExtraction.service.js'
import { AD_COLUMNS } from '../src/mappers/ad.mapper.js'

// AA-1: idempotency-guard coverage. A fake Sheets client backs
// getAllAds — real network calls (downloadImageAsBase64, OpenAI) are never
// reached on the skip path, and are proven not to be reached by leaving
// every image-link column blank: if the skip check didn't fire, the
// function would hit firstSourceImageUrl's "no archived or raw image"
// throw instead of returning cleanly.
const AD_ID = '1234567890'

function buildAdRow(overrides = {}) {
  const values = {
    'Ad Archive ID': AD_ID,
    'Brand': '테스트브랜드',
    'Search Keyword': 'test',
    ...overrides,
  }
  return AD_COLUMNS.map((c) => values[c] ?? '')
}

function makeFakeAdSheets(existingRow, captured) {
  return {
    spreadsheets: {
      values: {
        get: async ({ range }) => {
          if (range.includes('A1:X1')) return { data: { values: [[...AD_COLUMNS]] } }
          return { data: { values: [[...AD_COLUMNS], existingRow] } }
        },
        batchUpdate: async ({ requestBody }) => {
          if (captured) captured.batchUpdate = requestBody
          return { data: {} }
        },
      },
    },
  }
}

test('extractAdReferenceImage returns the stored reference+copy without touching OpenAI when they already exist and force is not set', async () => {
  const storedRef = { imageUrl: 'https://drive.google.com/file/d/existing-ref/view', extractedAt: '2026-08-01T00:00:00.000Z' }
  const storedCopy = { price: '19,900원', promotion: '1+1', adHooks: ['효과 좋아요'] }
  const row = buildAdRow({
    'Extracted Reference JSON': JSON.stringify(storedRef),
    'Extracted Copy JSON': JSON.stringify(storedCopy),
  })
  const fakeSheets = makeFakeAdSheets(row)

  const result = await extractAdReferenceImage(AD_ID, { getClientFn: () => fakeSheets })

  assert.deepEqual(result, { imageUrl: storedRef.imageUrl, extractedAt: storedRef.extractedAt, ...storedCopy })
})

test('extractAdReferenceImage ignores stored data and attempts the real pipeline when force is true', async () => {
  const storedRef = { imageUrl: 'https://drive.google.com/file/d/existing-ref/view', extractedAt: '2026-08-01T00:00:00.000Z' }
  const row = buildAdRow({ 'Extracted Reference JSON': JSON.stringify(storedRef) }) // every image-link column left blank
  const fakeSheets = makeFakeAdSheets(row)

  await assert.rejects(
    () => extractAdReferenceImage(AD_ID, { force: true, getClientFn: () => fakeSheets }),
    /has no archived or raw image/,
    'with force:true and no source image, the real pipeline must actually be attempted (and fail there), not silently short-circuited to the stale stored data'
  )
})

// AA-3: simulated partial-failure coverage — both legs are injected fakes
// (no real OpenAI/Drive call anywhere in this test). The reference-sheet
// leg fails while the copy leg succeeds, proving the copy leg's
// already-"paid" result is actually saved (via updateAdFields writing only
// the successful field) rather than being discarded just because its
// sibling call rejected.
test('extractAdReferenceImage saves whichever leg succeeded when the other fails, rather than discarding both', async () => {
  const row = buildAdRow({ 'Archived Image Links': 'https://cdn.example.com/archived-ad.jpg' })
  const captured = {}
  const fakeSheets = makeFakeAdSheets(row, captured)

  const result = await extractAdReferenceImage(AD_ID, {
    getClientFn: () => fakeSheets,
    downloadImageAsBase64Fn: async () => ({ base64: 'fake-base64', mimeType: 'image/jpeg' }),
    extractReferenceSheetFn: async () => {
      throw new Error('content_policy_violation: simulated reference-sheet failure')
    },
    extractAdCopyFn: async () => ({ price: '19,900원', promotion: '1+1', adHooks: ['가성비 최고'] }),
    uploadImageFn: async () => { throw new Error('uploadImageFn must not be called when the reference-sheet leg itself already failed') },
  })

  assert.equal(result.imageUrl, null, 'the failed leg must not produce a fabricated imageUrl')
  assert.deepEqual(
    { price: result.price, promotion: result.promotion, adHooks: result.adHooks },
    { price: '19,900원', promotion: '1+1', adHooks: ['가성비 최고'] },
    'the successful copy leg must still be returned, not discarded'
  )
  assert.equal(result.failures.length, 1)
  assert.equal(result.failures[0].leg, 'referenceSheet')
  assert.match(result.failures[0].error, /simulated reference-sheet failure/)

  // Confirms the sheet write actually happened with ONLY the successful
  // field — this is the persistence half of the claim, not just the
  // in-memory return value, and it also proves the failed field was never
  // written (e.g. as a null placeholder that would clobber a previously
  // real value).
  assert.ok(captured.batchUpdate, 'updateAdFields must have written the successful copy leg to the sheet')
  const writtenRanges = captured.batchUpdate.data.map((d) => d.range)
  assert.equal(writtenRanges.length, 1, 'only the successful field should be written, not a placeholder for the failed one')
  const writtenCopy = JSON.parse(captured.batchUpdate.data[0].values[0][0])
  assert.deepEqual(writtenCopy, { price: '19,900원', promotion: '1+1', adHooks: ['가성비 최고'] })
})

test('extractAdReferenceImage throws a combined error when both legs fail, since there is nothing to persist', async () => {
  const row = buildAdRow({ 'Archived Image Links': 'https://cdn.example.com/archived-ad.jpg' })
  const fakeSheets = makeFakeAdSheets(row)

  await assert.rejects(
    () => extractAdReferenceImage(AD_ID, {
      getClientFn: () => fakeSheets,
      downloadImageAsBase64Fn: async () => ({ base64: 'fake-base64', mimeType: 'image/jpeg' }),
      extractReferenceSheetFn: async () => { throw new Error('reference-sheet boom') },
      extractAdCopyFn: async () => { throw new Error('copy boom') },
    }),
    (err) => {
      assert.match(err.message, /reference-sheet boom/)
      assert.match(err.message, /copy boom/)
      return true
    }
  )
})

test('parseAdCopyResult normalizes a real-shaped result with price, promotion, and multiple hooks', () => {
  const raw = JSON.stringify({
    price: '29,900원',
    promotion: '오늘만 71% 특가',
    adHooks: ['운동&식단 필요없는 지방흡착템', '★아마존 1등★'],
  })

  const result = parseAdCopyResult(raw)

  assert.equal(result.price, '29,900원')
  assert.equal(result.promotion, '오늘만 71% 특가')
  assert.deepEqual(result.adHooks, ['운동&식단 필요없는 지방흡착템', '★아마존 1등★'])
})

test('parseAdCopyResult converts missing price/promotion to null rather than throwing', () => {
  const raw = JSON.stringify({ price: null, promotion: null, adHooks: [] })

  const result = parseAdCopyResult(raw)

  assert.equal(result.price, null)
  assert.equal(result.promotion, null)
  assert.deepEqual(result.adHooks, [])
})

test('parseAdCopyResult treats a blank/whitespace-only price or promotion string as null', () => {
  const raw = JSON.stringify({ price: '   ', promotion: '', adHooks: ['hook'] })

  const result = parseAdCopyResult(raw)

  assert.equal(result.price, null)
  assert.equal(result.promotion, null)
})

test('parseAdCopyResult drops malformed adHooks entries (non-strings, blanks) rather than including them', () => {
  const raw = JSON.stringify({ price: null, promotion: null, adHooks: ['real hook', '', '   ', 42, null, {}] })

  const result = parseAdCopyResult(raw)

  assert.deepEqual(result.adHooks, ['real hook'])
})

test('parseAdCopyResult defaults adHooks to [] when the field is missing or not an array', () => {
  const result = parseAdCopyResult(JSON.stringify({ price: null, promotion: null }))
  assert.deepEqual(result.adHooks, [])

  const result2 = parseAdCopyResult(JSON.stringify({ price: null, promotion: null, adHooks: 'not an array' }))
  assert.deepEqual(result2.adHooks, [])
})

test('parseAdCopyResult throws a clear error on genuinely invalid JSON', () => {
  assert.throws(
    () => parseAdCopyResult('not json at all'),
    (err) => {
      assert.match(err.message, /invalid JSON/)
      return true
    }
  )
})
