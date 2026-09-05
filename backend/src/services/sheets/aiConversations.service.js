import { config } from '../../config/index.js'
import { getClient, callSheets, makeTabRange, columnLetter } from './sheetsBase.js'

// Part SS: persists 생성 AI conversations (see AIStudioContext.jsx) so they
// survive a reload/navigation and can be browsed like Claude/ChatGPT's own
// chat history — new tab, same sheet as every other tab, same
// one-spreadsheet-many-tabs convention as generatedSheets.service.js/
// productSheets.service.js.
//
// Column order chosen fresh for this brand-new tab (no existing data/order
// to preserve yet) — grouped as: identity (Conversation ID), the 4
// selection-state fields AIStudioContext.jsx needs to fully restore a
// resumed conversation's phase-advancement state (Brand=selectedBrandKey,
// Ref Brand=selectedRefBrand, Reference Ad ID=selectedRefAdId, Product
// ID=selectedProductId), Part-OO seed lineage (Source Result ID/JSON,
// populated only for a seeded conversation), then the actual conversation
// state (Phase/Image URL/the 3 JSON blobs), then timestamps. Any FUTURE
// column addition must append after Updated At, never reorder/insert —
// same append-only convention every other Sheets-backed tab in this app
// already follows.
export const CONVERSATION_COLUMNS = [
  'Conversation ID', 'Brand', 'Ref Brand', 'Reference Ad ID', 'Product ID',
  'Source Result ID', 'Phase', 'Image URL',
  'Messages JSON', 'Segments JSON', 'Decisions JSON', 'Source Result JSON',
  'Created At', 'Updated At',
]

const CONVERSATIONS_TAB_NAME = 'AI 스튜디오 대화'
const LAST_COLUMN = 'N' // 14 columns, A..N

const tabRange = makeTabRange(CONVERSATIONS_TAB_NAME)

function toRow(conversation) {
  return [
    conversation.id,
    conversation.selectedBrandKey || '',
    conversation.selectedRefBrand || '',
    conversation.selectedRefAdId || '',
    conversation.selectedProductId || '',
    conversation.sourceResult?.id || '',
    conversation.phase || '',
    conversation.imageUrl || '',
    JSON.stringify(conversation.messages || []),
    JSON.stringify(conversation.segments || []),
    JSON.stringify(conversation.decisions || {}),
    conversation.sourceResult ? JSON.stringify(conversation.sourceResult) : '',
    conversation.createdAt,
    conversation.updatedAt,
  ]
}

// Lazy-create + header-migration-safe, same pattern as generatedSheets
// .service.js's ensureGeneratedTab / productSheets.service.js's
// ensureProductTab. CC-4: getClientFn is injected (defaulting to the real
// getClient) purely so every exported function below is unit-testable
// against a fake Sheets client.
let ensureTabPromise = null
function ensureConversationsTab({ getClientFn = getClient } = {}) {
  if (!ensureTabPromise) {
    ensureTabPromise = (async () => {
      const sheets = getClientFn()
      const meta = await callSheets(() => sheets.spreadsheets.get({ spreadsheetId: config.sheetId }))
      const exists = meta.data.sheets.some((s) => s.properties.title === CONVERSATIONS_TAB_NAME)

      if (!exists) {
        await callSheets(() => sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.sheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: CONVERSATIONS_TAB_NAME } } }] },
        }))
        await callSheets(() => sheets.spreadsheets.values.update({
          spreadsheetId: config.sheetId,
          range: tabRange(`A1:${LAST_COLUMN}1`),
          valueInputOption: 'RAW',
          requestBody: { values: [[...CONVERSATION_COLUMNS]] },
        }))
        return
      }

      const headerRes = await callSheets(() => sheets.spreadsheets.values.get({
        spreadsheetId: config.sheetId,
        range: tabRange(`A1:${LAST_COLUMN}1`),
      }))
      const existingHeader = headerRes.data.values?.[0] || []
      if (existingHeader.length < CONVERSATION_COLUMNS.length) {
        const missingHeaders = CONVERSATION_COLUMNS.slice(existingHeader.length)
        const startColumn = columnLetter(existingHeader.length)
        await callSheets(() => sheets.spreadsheets.values.update({
          spreadsheetId: config.sheetId,
          range: tabRange(`${startColumn}1:${LAST_COLUMN}1`),
          valueInputOption: 'RAW',
          requestBody: { values: [missingHeaders] },
        }))
      }
    })()
  }
  return ensureTabPromise
}

async function getAllRows(sheets) {
  const res = await callSheets(() => sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: tabRange(`A:${LAST_COLUMN}`),
  }))
  const rows = res.data.values || []
  return rows.slice(1).map((cells) => (
    Object.fromEntries(CONVERSATION_COLUMNS.map((column, i) => [column, cells[i] ?? '']))
  ))
}

// conversation.id is the key — looks up the existing row the same way
// updateGeneratedStatus finds a row by ID (read column A, find its index);
// if found, overwrites that WHOLE row's range (not just one cell, unlike
// updateGeneratedStatus's single-cell Status update) since almost every
// field can change turn to turn, not just one; if not found, appends a new
// row. Sets Updated At to now on every call; Created At only on the append
// (first-save) branch, preserved unchanged on every later overwrite.
//
// NOTE (known, not-solved-yet limit — flagged rather than silently
// ignored, same posture this codebase uses for other known constraints):
// a single Sheets cell has roughly a 50,000-character limit. An extremely
// long conversation's Messages JSON could theoretically approach that.
// Truncation/pagination is out of scope for this pass.
export async function upsertConversation(conversation, { getClientFn = getClient } = {}) {
  await ensureConversationsTab({ getClientFn })
  const sheets = getClientFn()

  const rows = await getAllRows(sheets)
  const existingIndex = rows.findIndex((row) => String(row['Conversation ID']).trim() === String(conversation.id).trim())

  const now = new Date().toISOString()
  if (existingIndex === -1) {
    const row = toRow({ ...conversation, createdAt: now, updatedAt: now })
    await callSheets(() => sheets.spreadsheets.values.append({
      spreadsheetId: config.sheetId,
      range: tabRange(`A:${LAST_COLUMN}`),
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    }))
    return
  }

  const createdAt = rows[existingIndex]['Created At'] || now
  const rowNumber = existingIndex + 2 // +1 for the header row, +1 for 1-based indexing
  const row = toRow({ ...conversation, createdAt, updatedAt: now })
  await callSheets(() => sheets.spreadsheets.values.update({
    spreadsheetId: config.sheetId,
    range: tabRange(`A${rowNumber}:${LAST_COLUMN}${rowNumber}`),
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  }))
}

// Every row, raw (Korean-keyed) — same shape getAllGeneratedResults
// returns. The frontend adapter is responsible for turning this into
// whatever lightweight-list vs. full-detail shape it needs; this file
// doesn't build two different read paths for the same data.
export async function getAllConversations({ getClientFn = getClient } = {}) {
  await ensureConversationsTab({ getClientFn })
  const sheets = getClientFn()
  return getAllRows(sheets)
}

// Single row by ID, or null if not found — the controller decides the HTTP
// status (404), same layering as every other service in this codebase.
export async function getConversation(id, { getClientFn = getClient } = {}) {
  await ensureConversationsTab({ getClientFn })
  const sheets = getClientFn()
  const rows = await getAllRows(sheets)
  return rows.find((row) => String(row['Conversation ID']).trim() === String(id).trim()) || null
}
