import { config } from '../config/index.js'
import { startGeneration, getJob } from '../services/generation.service.js'
import { getAllGeneratedResults, updateGeneratedStatus } from '../services/generatedSheets.service.js'

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
