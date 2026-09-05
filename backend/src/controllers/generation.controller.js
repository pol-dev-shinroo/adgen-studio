import { config } from '../config/index.js'
import { startGeneration, getJob } from '../services/generation.service.js'
import { getAllGeneratedResults, updateGeneratedStatus } from '../services/sheets/generatedSheets.service.js'
import { downloadImageAsBase64 } from '../services/generation/imageIO.service.js'
import { sizeForFormat } from '../utils/formatSize.js'

const VALID_STATUSES = new Set(['미승인', '승인'])

// CC-2: deps lets a test inject fakes for every real service call — same
// convention as run.js's runJob, an optional trailing parameter Express
// never supplies itself.
// Part DD: refAdConfigs replaces the old flat refAdIds/formats/quantity —
// each entry carries its OWN formats/quantity, since the client's real need
// is per-reference-ad format/quantity (e.g. ad A -> 1 image, ad B -> 2
// images), not one shared setting applied uniformly across every selected
// ad. Validated per-entry (not just "is it an array") so a malformed single
// entry gets a specific, actionable error naming that ad, same "don't trust
// the frontend as the only gate" convention every other validation here
// already follows.
export async function postGenerate(req, res, next, { startGenerationFn = startGeneration } = {}) {
  if (!config.productSyncConfigured) {
    return res.status(503).json({ error: 'Product sync is not configured on this server.' })
  }

  const {
    refBrand, refAdConfigs, brand, styleIntensity, freeRestyle, strongReferenceInfluence, verbatimCopy,
    instructions, adCopyOverride, referenceSheetImageUrl, styleReferenceType,
  } = req.body ?? {}

  if (!Array.isArray(refAdConfigs) || refAdConfigs.length === 0) {
    return res.status(400).json({ error: '"refAdConfigs" must be a non-empty array' })
  }
  for (const cfg of refAdConfigs) {
    if (!cfg || (typeof cfg.adId !== 'string' && typeof cfg.adId !== 'number')) {
      return res.status(400).json({ error: 'each refAdConfigs entry must include "adId"' })
    }
    if (!Array.isArray(cfg.formats) || cfg.formats.length === 0) {
      return res.status(400).json({ error: `refAdConfigs entry for ad "${cfg.adId}" must include a non-empty "formats" array` })
    }
    const q = Number(cfg.quantity)
    if (!Number.isInteger(q) || q < 1 || q > 10) {
      return res.status(400).json({ error: `refAdConfigs entry for ad "${cfg.adId}" must include "quantity" as an integer between 1 and 10` })
    }
  }
  if (!brand || typeof brand.key !== 'string' || !Array.isArray(brand.productIds) || brand.productIds.length === 0) {
    return res.status(400).json({ error: '"brand" must include "key" and a non-empty "productIds" array' })
  }
  const intensity = Number(styleIntensity)
  if (!Number.isInteger(intensity) || intensity < 0 || intensity > 100) {
    return res.status(400).json({ error: '"styleIntensity" must be an integer between 0 and 100' })
  }

  try {
    const jobId = await startGenerationFn({
      refBrand: refBrand ?? '',
      refAdConfigs,
      brand,
      styleIntensity: intensity,
      // Part LL: the 3 checkbox-driven booleans that now actually select
      // renderImage.service.js's/copywriting.service.js's tier wording —
      // defaulted to false (never a hard 400) rather than required, so an
      // older/cached client payload that doesn't send them yet still starts
      // a job instead of hard-failing.
      freeRestyle: Boolean(freeRestyle),
      strongReferenceInfluence: Boolean(strongReferenceInfluence),
      verbatimCopy: Boolean(verbatimCopy),
      instructions: typeof instructions === 'string' ? instructions : '',
      // Part P: { price, promotion, adHooks } from Step 3's ad-selection
      // panel — real, curated copy the user hand-picked, used instead of
      // the Pinecone semantic lookup for this run when present. Loosely
      // validated here (just "is it an object") — generation.service.js's
      // own conversion is already defensive about malformed/empty
      // sub-fields, same "don't trust the frontend as the only gate"
      // convention as prepareInputs's own validation.
      adCopyOverride: adCopyOverride && typeof adCopyOverride === 'object' ? adCopyOverride : null,
      // Part Q: URL of one of our own brand's composed reference sheets
      // (Part N/O), used as a third, supplementary style-reference image in
      // the render call. Loosely validated the same way as adCopyOverride
      // above — generation.service.js treats a bad/unreachable URL as "no
      // style reference this run" rather than failing the job.
      referenceSheetImageUrl: typeof referenceSheetImageUrl === 'string' && referenceSheetImageUrl.trim()
        ? referenceSheetImageUrl.trim()
        : null,
      // Part DD: which extracted-reference `type` referenceSheetImageUrl
      // came from ('model', 'badge', ...) — loosely validated the same way,
      // renderImage.service.js treats anything other than exactly 'model'
      // as "not a face-swap reference" rather than failing the job.
      styleReferenceType: typeof styleReferenceType === 'string' ? styleReferenceType : null,
    })
    res.status(202).json({ jobId })
  } catch (err) {
    if (err.badRequest) return res.status(400).json({ error: err.message })
    next(err)
  }
}

export function getGenerationStatus(req, res, { getJobFn = getJob } = {}) {
  const job = getJobFn(req.params.jobId)
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

export async function getGeneratedResults(req, res, next, { getAllGeneratedResultsFn = getAllGeneratedResults } = {}) {
  try {
    const results = await getAllGeneratedResultsFn()
    res.json({ results })
  } catch (err) {
    next(err)
  }
}

// Shared by both figma-export endpoints below — same find-by-ID approach
// updateGeneratedStatus uses. Throws a plain Error carrying `.notFoundId`
// rather than writing the 404 response itself, so both callers can each
// decide their own response shape (JSON error vs. an image request that
// still wants a JSON 404 body).
async function findGeneratedResultById(id, { getAllGeneratedResultsFn = getAllGeneratedResults } = {}) {
  const results = await getAllGeneratedResultsFn()
  const result = results.find((r) => String(r['Generation ID'] ?? '').trim() === String(id).trim())
  if (!result) {
    const err = new Error(`No result found for Generation ID "${id}"`)
    err.notFound = true
    throw err
  }
  return result
}

// Read-only export for the Figma plugin (Part J) — returns metadata plus an
// `imageUrl` pointing at this server's own image-proxy route below (Part L),
// not a Drive URL directly. Drive's public thumbnail endpoint doesn't send
// an Access-Control-Allow-Origin header a null-origin Figma-plugin fetch
// satisfies — confirmed by a real failed import (Part L) — so the plugin
// now fetches image bytes from us instead, and we fetch Drive server-side
// (imageIO.service.js's downloadImageAsBase64, an authenticated Drive API
// call, never subject to browser CORS at all). `size` is derived from
// `format` via the same FORMAT_SIZE mapping renderImage.service.js actually
// rendered with (shared via formatSize.js, not duplicated) so the plugin
// can size its Figma frame to match exactly. `replacements` defaults to []
// for rows written before the 'Replacements JSON' column existed — an
// older result is still a valid (if copy-panel-less) export, not an error.
export async function getGeneratedResultFigmaExport(
  req, res, next, { getAllGeneratedResultsFn = getAllGeneratedResults } = {}
) {
  try {
    const result = await findGeneratedResultById(req.params.id, { getAllGeneratedResultsFn })

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
      imageUrl: `${config.backendPublicUrl}/api/generate/results/${result['Generation ID']}/figma-export/image`,
      replacements,
    })
  } catch (err) {
    if (err.notFound) return res.status(404).json({ error: err.message })
    next(err)
  }
}

// The actual image bytes for the export above — a real server-to-Google
// call (imageIO.service.js's downloadImageAsBase64, the same authenticated
// Drive download every other part of this app already uses), so it's never
// subject to the CORS problem a plugin-side fetch of Drive's own public URL
// hit. Downloads the original full-resolution file (not a resized render)
// since that's what downloadFromDrive fetches — fine for this one-off
// per-import path, no need to add resizing here.
export async function getGeneratedResultFigmaExportImage(
  req, res, next,
  { getAllGeneratedResultsFn = getAllGeneratedResults, downloadImageAsBase64Fn = downloadImageAsBase64 } = {}
) {
  try {
    const result = await findGeneratedResultById(req.params.id, { getAllGeneratedResultsFn })
    const { base64, mimeType } = await downloadImageAsBase64Fn(result['Image URL'])
    res.set('Content-Type', mimeType)
    res.send(Buffer.from(base64, 'base64'))
  } catch (err) {
    if (err.notFound) return res.status(404).json({ error: err.message })
    next(err)
  }
}

export async function patchGeneratedStatus(req, res, next, { updateGeneratedStatusFn = updateGeneratedStatus } = {}) {
  const { id } = req.params
  const { status } = req.body ?? {}

  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: `"status" must be one of: ${[...VALID_STATUSES].join(', ')}` })
  }

  try {
    await updateGeneratedStatusFn(id, status)
    res.json({ ok: true })
  } catch (err) {
    if (err.notFound) return res.status(404).json({ error: err.message })
    next(err)
  }
}
