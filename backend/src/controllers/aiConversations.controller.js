import { getAllConversations, getConversation, upsertConversation } from '../services/sheets/aiConversations.service.js'

// Part SS: separate from aiGenerate.controller.js purely for file size —
// same DI-injection convention (an optional trailing deps param) either way.

// A short, sidebar-friendly label for a conversation that hasn't been
// given one explicitly — brand + last few digits of the reference ad id
// once one's been picked, falling back to the first real user message
// (e.g. a brand name typed before an ad was ever selected) or a generic
// placeholder for a session saved before either exists.
function labelFor(row) {
  const refAdId = row['Reference Ad ID']
  if (refAdId) {
    return `${row['Ref Brand'] || row['Brand'] || '대화'} · AD ${String(refAdId).slice(-4)}`
  }
  try {
    const messages = JSON.parse(row['Messages JSON'] || '[]')
    const firstUserMessage = Array.isArray(messages)
      ? messages.find((m) => m?.role === 'user' && typeof m.text === 'string' && m.text.trim())
      : null
    if (firstUserMessage) return firstUserMessage.text.slice(0, 30)
  } catch {
    // Malformed JSON on an old/corrupt row — fall through to the generic label.
  }
  return '새 대화'
}

// getAllConversationsFn is injected (defaulting to the real service call)
// purely so this is unit-testable without a real Sheets read.
export async function getConversations(req, res, next, { getAllConversationsFn = getAllConversations } = {}) {
  try {
    const rows = await getAllConversationsFn()
    const list = rows
      .map((row) => ({
        id: row['Conversation ID'],
        brand: row['Brand'] || '',
        refBrand: row['Ref Brand'] || '',
        referenceAdId: row['Reference Ad ID'] || '',
        phase: row['Phase'] || '',
        updatedAt: row['Updated At'] || '',
        label: labelFor(row),
      }))
      // Most-recently-updated first — a sidebar reads top-to-bottom as
      // most-recent-first, same convention Claude/ChatGPT's own history use.
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    res.json({ conversations: list })
  } catch (err) {
    next(err)
  }
}

function parseJsonField(raw, fallback) {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

// Inverse of aiConversations.service.js's own toRow — full detail, the
// exact shape AIStudioContext.jsx's loadConversation needs to hydrate
// every relevant piece of state. Malformed/missing JSON on an old or
// corrupt row falls back to the same empty defaults a brand-new
// conversation would start with, rather than throwing.
function toFullConversation(row) {
  return {
    id: row['Conversation ID'],
    selectedBrandKey: row['Brand'] || null,
    selectedRefBrand: row['Ref Brand'] || null,
    selectedRefAdId: row['Reference Ad ID'] || null,
    selectedProductId: row['Product ID'] || null,
    phase: row['Phase'] || 'select-brand',
    imageUrl: row['Image URL'] || null,
    messages: parseJsonField(row['Messages JSON'], []),
    segments: parseJsonField(row['Segments JSON'], []),
    decisions: parseJsonField(row['Decisions JSON'], { background: null, texts: {}, model: null, product: null }),
    sourceResult: parseJsonField(row['Source Result JSON'], null),
    createdAt: row['Created At'] || null,
    updatedAt: row['Updated At'] || null,
  }
}

export async function getConversationById(req, res, next, { getConversationFn = getConversation } = {}) {
  try {
    const row = await getConversationFn(req.params.id)
    if (!row) return res.status(404).json({ error: `No conversation found for id "${req.params.id}"` })
    res.json(toFullConversation(row))
  } catch (err) {
    next(err)
  }
}

// Validates the bare minimum a save actually needs, then persists whatever
// shape the frontend sent as-is — upsertConversation/toRow already default
// every other field defensively (see that file's own toRow), so this
// doesn't need to re-validate each one, same "don't trust the frontend as
// the only gate, but don't duplicate its whole shape either" balance the
// rest of this codebase's simpler PUT/PATCH endpoints already strike.
export async function putConversation(req, res, next, { upsertConversationFn = upsertConversation } = {}) {
  const body = req.body ?? {}
  const { id, phase, messages } = body
  if (!id || typeof id !== 'string') return res.status(400).json({ error: '"id" is required' })
  if (!phase || typeof phase !== 'string') return res.status(400).json({ error: '"phase" is required' })
  if (!Array.isArray(messages)) return res.status(400).json({ error: '"messages" must be an array' })
  if (String(req.params.id) !== String(id)) {
    return res.status(400).json({ error: 'URL id and body "id" must match' })
  }

  try {
    await upsertConversationFn(body)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}
