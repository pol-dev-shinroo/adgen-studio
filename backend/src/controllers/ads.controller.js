import { getAllAds, updateAdField, deleteAdRows, revertAdRow } from '../services/sheets.service.js'
import { deleteAdMedia } from '../services/drive.service.js'
import { extractAdReferenceImage } from '../services/adImageExtraction.service.js'

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

// Synchronous — a single gpt-image-2 edit call (Part N), not a job/poll
// flow, same shape as products.controller.js's postExtractProductImage.
// Real money per call — only ever triggered by an explicit user action,
// never by a resync/batch operation.
export async function postExtractAdReferenceImage(req, res, next) {
  const { adArchiveId } = req.params
  try {
    const result = await extractAdReferenceImage(adArchiveId)
    res.json(result)
  } catch (err) {
    if (err.notFound) return res.status(404).json({ error: err.message })
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

// Discards ads the user unchecked after a collection run. Two kinds of
// items: 'delete' (a 'new' ad — trash its Drive media and remove its sheet
// row entirely) and 'revert' (an 'updated' ad — restore the sheet row to
// its previousValues, leave Drive alone). A failure on any one item never
// blocks the others — everything is attempted and every failure collected.
//
// Simplification, noted rather than solved: reverting doesn't roll back
// Drive media. If this scrape uploaded new files for an 'updated' ad
// (replacing what was previously archived), those newly-uploaded files
// stay in Drive as harmless orphans even after the sheet row reverts to
// pointing at the old (still-valid) Archived Image Links. Full media
// rollback would mean diffing old vs new file lists — out of scope here.
export async function discardAds(req, res) {
  const { keyword, items } = req.body ?? {}
  if (typeof keyword !== 'string' || !keyword.trim()) {
    return res.status(400).json({ error: '"keyword" must be a non-empty string' })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '"items" must be a non-empty array' })
  }
  for (const item of items) {
    if (!item || !['delete', 'revert'].includes(item.action) || !item.adArchiveId) {
      return res.status(400).json({ error: 'Each item needs an adArchiveId and action of "delete" or "revert"' })
    }
    if (item.action === 'revert' && !Array.isArray(item.previousValues)) {
      return res.status(400).json({ error: '"revert" items need a previousValues array' })
    }
  }

  const deleteItems = items.filter((i) => i.action === 'delete')
  const revertItems = items.filter((i) => i.action === 'revert')

  const failures = []
  let driveFilesTrashed = 0

  for (const item of deleteItems) {
    try {
      driveFilesTrashed += await deleteAdMedia(keyword.trim(), String(item.adArchiveId))
    } catch (err) {
      failures.push({ adArchiveId: item.adArchiveId, stage: 'drive', error: err.message })
    }
  }

  let deleted = 0
  if (deleteItems.length > 0) {
    try {
      const result = await deleteAdRows(deleteItems.map((i) => i.adArchiveId))
      deleted = result.deleted
      for (const adArchiveId of result.notFoundIds) {
        failures.push({ adArchiveId, stage: 'sheet', error: 'Row not found' })
      }
    } catch (err) {
      failures.push({ stage: 'sheet', error: err.message })
    }
  }

  let reverted = 0
  for (const item of revertItems) {
    try {
      await revertAdRow(item.adArchiveId, item.previousValues)
      reverted += 1
    } catch (err) {
      failures.push({ adArchiveId: item.adArchiveId, stage: 'revert', error: err.message })
    }
  }

  res.json({ deleted, reverted, driveFilesTrashed, failures })
}
