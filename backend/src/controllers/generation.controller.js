import { config } from '../config/index.js'
import { startGeneration, getJob } from '../services/generation.service.js'
import { getAllGeneratedResults, updateGeneratedStatus } from '../services/generatedSheets.service.js'
import { sizeForFormat } from '../utils/formatSize.js'
import { toEmbeddableImageUrl } from '../utils/driveUrl.js'

const VALID_STATUSES = new Set(['미승인', '승인'])

export async function postGenerate(req, res, next) {
  if (!config.productSyncConfigured) {
    return res.status(503).json({ error: 'Product sync is not configured on this server.' })
  }

  const { refBrand, refAdIds, brand, formats, quantity, styleIntensity, instructions } = req.body ?? {}

  if (!Array.isArray(refAdIds) || refAdIds.length === 0) {
    return res.status(400).json({ error: '"refAdIds" must be a non-empty array' })
  }
  if (!brand || typeof brand.key !== 'string' || !Array.isArray(brand.productIds) || brand.productIds.length === 0) {
    return res.status(400).json({ error: '"brand" must include "key" and a non-empty "productIds" array' })
  }
  if (!Array.isArray(formats) || formats.length === 0) {
    return res.status(400).json({ error: '"formats" must be a non-empty array' })
  }
  const qty = Number(quantity)
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    return res.status(400).json({ error: '"quantity" must be an integer between 1 and 10' })
  }
  const intensity = Number(styleIntensity)
  if (!Number.isInteger(intensity) || intensity < 0 || intensity > 100) {
    return res.status(400).json({ error: '"styleIntensity" must be an integer between 0 and 100' })
  }

  try {
    const jobId = await startGeneration({
      refBrand: refBrand ?? '',
      refAdIds,
      brand,
      formats,
      quantity: qty,
      styleIntensity: intensity,
      instructions: typeof instructions === 'string' ? instructions : '',
    })
    res.status(202).json({ jobId })
  } catch (err) {
    if (err.badRequest) return res.status(400).json({ error: err.message })
    next(err)
  }
}

export function getGenerationStatus(req, res) {
  const job = getJob(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Unknown jobId' })

  res.json({
    jobId: job.id,
    status: job.status,
    refBrand: job.refBrand,
    brandKey: job.brandKey,
    brandName: job.brandName,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    progress: job.progress,
    summary: job.summary,
  })
}

export async function getGeneratedResults(req, res, next) {
  try {
    const results = await getAllGeneratedResults()
    res.json({ results })
  } catch (err) {
    next(err)
  }
}

// Read-only export for the Figma plugin (Part J) — looks up one row by
// Generation ID, same find-by-ID approach updateGeneratedStatus uses, but
// returns the row's data instead of writing to it. `size` is derived from
// `format` via the same FORMAT_SIZE mapping renderImage.service.js actually
// rendered with (shared via formatSize.js, not duplicated) so the plugin
// can size its Figma frame to match exactly. `replacements` defaults to []
// for rows written before the 'Replacements JSON' column existed — an
// older result is still a valid (if copy-panel-less) export, not an error.
// `imageUrl` is converted through toEmbeddableImageUrl before being sent —
// the raw sheet value is Drive's webViewLink (an HTML viewer page), which
// the plugin can't actually fetch bytes from (confirmed by a real failed
// import, Part K); 'w1600' matches ImageLightbox.jsx's own full-resolution
// size, appropriate here since the Figma frame displays the image at its
// real generated resolution, not a card-sized thumbnail.
export async function getGeneratedResultFigmaExport(req, res, next) {
  const { id } = req.params

  try {
    const results = await getAllGeneratedResults()
    const result = results.find((r) => String(r['Generation ID'] ?? '').trim() === String(id).trim())
    if (!result) {
      return res.status(404).json({ error: `No result found for Generation ID "${id}"` })
    }

    let replacements = []
    try {
      const parsed = JSON.parse(result['Replacements JSON'] || '[]')
      if (Array.isArray(parsed)) replacements = parsed
    } catch {
      // malformed/missing on older rows — [] is the correct fallback, not an error
    }

    res.json({
      generationId: result['Generation ID'],
      brand: result['Brand'],
      format: result['Format'],
      size: sizeForFormat(result['Format']),
      imageUrl: toEmbeddableImageUrl(result['Image URL'], 'w1600'),
      replacements,
    })
  } catch (err) {
    next(err)
  }
}

export async function patchGeneratedStatus(req, res, next) {
  const { id } = req.params
  const { status } = req.body ?? {}

  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: `"status" must be one of: ${[...VALID_STATUSES].join(', ')}` })
  }

  try {
    await updateGeneratedStatus(id, status)
    res.json({ ok: true })
  } catch (err) {
    if (err.notFound) return res.status(404).json({ error: err.message })
    next(err)
  }
}
