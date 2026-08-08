// Retries fn() with exponential backoff (baseDelayMs, 2x, 4x, ...) when
// isRetryable(err) returns true; rethrows immediately otherwise, or once
// retries are exhausted.
export async function withRetry(fn, { retries = 3, baseDelayMs = 1000, isRetryable = () => false } = {}) {
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt))
      attempt += 1
    }
  }
}

// googleapis client errors carry the HTTP status as .code (or
// .response.status on some versions) and, for 403s, a reason string buried
// in .errors[]/.response.data.error.errors[] — 'rateLimitExceeded' and
// 'userRateLimitExceeded' both mean "back off and try again", unlike other
// 403s (e.g. permission denied) which never will. Marks the error with the
// same .retryable/.code convention used by apify.service.js so job-failure
// handling can treat both sources uniformly, and returns the check result
// for direct use as an `isRetryable` callback.
export function googleIsRetryable(err) {
  const status = err.code ?? err.response?.status
  const reasons = err.errors?.map((e) => e.reason)
    ?? err.response?.data?.error?.errors?.map((e) => e.reason)
    ?? []

  if (status === 429 || reasons.includes('rateLimitExceeded') || reasons.includes('userRateLimitExceeded')) {
    err.retryable = true
    err.code = 'RATE_LIMITED'
  }
  return err.retryable === true
}

// AA-6: @pinecone-database/pinecone (v3) has no client-side maxRetries
// option (checked the installed package — only test-helpers mention that
// name) and its error classes don't preserve the HTTP status as a
// property, only bake it into .name/.message (checked
// dist/errors/http.js's mapHttpStatusError + handling.js) — so this
// parses what's actually available instead of guessing. Retryable:
// PineconeConnectionError (network-level failure before any response),
// PineconeInternalServerError (500), and PineconeUnmappedHttpError only
// when its message reports 429/502/503/504 (the SDK doesn't define named
// classes for these, so unmapped is where they land). Never retryable:
// PineconeBadRequestError (400/403 — malformed request/plan limits),
// PineconeAuthorizationError (401), PineconeNotFoundError (404),
// PineconeConflictError (409), PineconeNotImplementedError (501) — none
// of those are transient.
export function pineconeIsRetryable(err) {
  if (err?.name === 'PineconeConnectionError' || err?.name === 'PineconeInternalServerError') return true
  if (err?.name === 'PineconeUnmappedHttpError') {
    return /Status: (429|502|503|504)\b/.test(err.message || '')
  }
  return false
}
