import { getAllAds, updateAdField, deleteAdRows } from '../services/sheets.service.js'
import { deleteAdMedia } from '../services/drive.service.js'

// Fields the frontend is allowed to edit directly. Everything else in the
// sheet is scraper-owned and should only change via a new collection run.
const EDITABLE_FIELDS = new Set(['Search Keyword'])

export async function getAds(req, res, next) {
  try {
    const ads = await getAllAds()
    res.json(ads)
  } catch (err) {
    next(err)
  }
}

export async function patchAdField(req, res, next) {
  const { adArchiveId } = req.params
  const { field, value } = req.body ?? {}

  if (!EDITABLE_FIELDS.has(field)) {
    return res.status(400).json({ error: `Field "${field}" is not editable` })
  }
  if (typeof value !== 'string' || !value.trim()) {
    return res.status(400).json({ error: '"value" must be a non-empty string' })
  }

  try {
    await updateAdField(adArchiveId, field, value.trim())
    res.json({ ok: true })
  } catch (err) {
    if (err.notFound) return res.status(404).json({ error: err.message })
    next(err)
  }
}

// Discards ads the user unchecked after a collection run: trashes their
// Drive media and removes their sheet rows. A failure in one ad's Drive
// cleanup or sheet deletion never blocks the others — everything is
// attempted and every failure is collected and reported back.
export async function discardAds(req, res) {
  const { keyword, adArchiveIds } = req.body ?? {}
  if (typeof keyword !== 'string' || !keyword.trim()) {
    return res.status(400).json({ error: '"keyword" must be a non-empty string' })
  }
  if (!Array.isArray(adArchiveIds) || adArchiveIds.length === 0) {
    return res.status(400).json({ error: '"adArchiveIds" must be a non-empty array' })
  }

  const failures = []
  let driveFilesTrashed = 0

  for (const adArchiveId of adArchiveIds) {
    try {
      driveFilesTrashed += await deleteAdMedia(keyword.trim(), String(adArchiveId))
    } catch (err) {
      failures.push({ adArchiveId, stage: 'drive', error: err.message })
    }
  }

  let deleted = 0
  try {
    const result = await deleteAdRows(adArchiveIds)
    deleted = result.deleted
    for (const adArchiveId of result.notFoundIds) {
      failures.push({ adArchiveId, stage: 'sheet', error: 'Row not found' })
    }
  } catch (err) {
    failures.push({ stage: 'sheet', error: err.message })
  }

  res.json({ deleted, driveFilesTrashed, failures })
}
