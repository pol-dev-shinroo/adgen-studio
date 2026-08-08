import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withRetry, pineconeIsRetryable } from '../src/utils/retry.js'

test('withRetry returns the result immediately on first success, without retrying', async () => {
  let calls = 0
  const result = await withRetry(async () => { calls += 1; return 'ok' }, { isRetryable: () => true })
  assert.equal(result, 'ok')
  assert.equal(calls, 1)
})

test('withRetry retries a transient failure and returns the eventual success', async () => {
  let calls = 0
  const result = await withRetry(async () => {
    calls += 1
    if (calls < 3) throw new Error('transient')
    return 'recovered'
  }, { retries: 3, baseDelayMs: 1, isRetryable: () => true })
  assert.equal(result, 'recovered')
  assert.equal(calls, 3)
})

test('withRetry rethrows immediately when isRetryable says no, without any retry', async () => {
  let calls = 0
  await assert.rejects(
    withRetry(async () => { calls += 1; throw new Error('permanent') }, { retries: 3, baseDelayMs: 1, isRetryable: () => false }),
    /permanent/
  )
  assert.equal(calls, 1)
})

test('withRetry rethrows once retries are exhausted', async () => {
  let calls = 0
  await assert.rejects(
    withRetry(async () => { calls += 1; throw new Error('still failing') }, { retries: 2, baseDelayMs: 1, isRetryable: () => true }),
    /still failing/
  )
  assert.equal(calls, 3) // initial attempt + 2 retries
})

test('pineconeIsRetryable: true for a network-level PineconeConnectionError', () => {
  const err = new Error('connect ECONNREFUSED')
  err.name = 'PineconeConnectionError'
  assert.equal(pineconeIsRetryable(err), true)
})

test('pineconeIsRetryable: true for a 500 PineconeInternalServerError', () => {
  const err = new Error('internal server error')
  err.name = 'PineconeInternalServerError'
  assert.equal(pineconeIsRetryable(err), true)
})

test('pineconeIsRetryable: true for an unmapped 429 (rate limit)', () => {
  const err = new Error('An unexpected error occured while calling the /query endpoint. Status: 429. Body: rate limited')
  err.name = 'PineconeUnmappedHttpError'
  assert.equal(pineconeIsRetryable(err), true)
})

test('pineconeIsRetryable: true for an unmapped 503 (service unavailable)', () => {
  const err = new Error('An unexpected error occured while calling the /query endpoint. Status: 503.')
  err.name = 'PineconeUnmappedHttpError'
  assert.equal(pineconeIsRetryable(err), true)
})

test('pineconeIsRetryable: false for an unmapped status that is not 429/502/503/504', () => {
  const err = new Error('An unexpected error occured while calling the /query endpoint. Status: 422.')
  err.name = 'PineconeUnmappedHttpError'
  assert.equal(pineconeIsRetryable(err), false)
})

test('pineconeIsRetryable: false for a 400 bad request (never treated as transient)', () => {
  const err = new Error('dimension mismatch')
  err.name = 'PineconeBadRequestError'
  assert.equal(pineconeIsRetryable(err), false)
})

test('pineconeIsRetryable: false for a 401 authorization error (never treated as transient)', () => {
  const err = new Error('API key rejected')
  err.name = 'PineconeAuthorizationError'
  assert.equal(pineconeIsRetryable(err), false)
})

test('pineconeIsRetryable: false for a plain error with no recognizable name', () => {
  assert.equal(pineconeIsRetryable(new Error('some other failure')), false)
  assert.equal(pineconeIsRetryable(null), false)
})
