import { getAllAds, updateAdField } from '../services/sheets.service.js'

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
