import { google } from 'googleapis'
import { getAuthClient } from './google.client.js'
import { withRetry, googleIsRetryable } from '../utils/retry.js'

// Shared Sheets API client + retry wrapper + tab-scoped range builder,
// extracted from sheets.service.js and productSheets.service.js — both
// files' actual upsert/diff business logic (and each one's own gid/ensure
// helpers) stays exactly where it was; this only removes the duplicated
// client/retry/range-building scaffolding underneath it.

let sheetsClient = null
export function getClient() {
  if (!sheetsClient) {
    sheetsClient = google.sheets({ version: 'v4', auth: getAuthClient() })
  }
  return sheetsClient
}

// Every Sheets API call goes through this so rate-limit/quota errors (429,
// or 403 with a rateLimitExceeded reason) get retried with backoff instead
// of failing the whole job outright.
export function callSheets(fn) {
  return withRetry(fn, { isRetryable: googleIsRetryable })
}

// Returns a tabRange(cells) function bound to one tab name, e.g.
// makeTabRange('시트1')('A1:V1') -> "'시트1'!A1:V1".
export function makeTabRange(tabName) {
  return (cells) => `'${tabName}'!${cells}`
}

// 0 -> A, 1 -> B, ... 25 -> Z. Every column list in this app is well within
// single-letter range.
export function columnLetter(index) {
  return String.fromCharCode(65 + index)
}
