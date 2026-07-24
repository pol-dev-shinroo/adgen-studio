import { startCollection, getJob } from '../services/collect.service.js'

const DEFAULT_RESULTS_LIMIT = 200
const MIN_RESULTS_LIMIT = 10
const MAX_RESULTS_LIMIT = 200 // hard ceiling — the actor call is synchronous over HTTP and risks timing out above this

export function postCollect(req, res) {
  const { keywords, resultsLimit } = req.body ?? {}
  if (!Array.isArray(keywords)) {
    return res.status(400).json({ error: '"keywords" must be an array of strings' })
  }

  const cleaned = [...new Set(keywords.map((k) => String(k ?? '').trim()).filter(Boolean))]
  if (cleaned.length === 0) {
    return res.status(400).json({ error: 'Provide at least one non-empty keyword' })
  }
  if (cleaned.length > 10) {
    return res.status(400).json({ error: 'At most 10 keywords per collection run' })
  }

  let limit = DEFAULT_RESULTS_LIMIT
  if (resultsLimit !== undefined) {
    const n = Number(resultsLimit)
    if (!Number.isInteger(n) || n < MIN_RESULTS_LIMIT || n > MAX_RESULTS_LIMIT) {
      return res.status(400).json({
        error: `resultsLimit must be an integer between ${MIN_RESULTS_LIMIT} and ${MAX_RESULTS_LIMIT}`,
      })
    }
    limit = n
  }

  const jobId = startCollection(cleaned, limit)
  res.status(202).json({ jobId })
}

export function getJobStatus(req, res) {
  const job = getJob(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Unknown jobId' })

  res.json({
    jobId: job.id,
    status: job.status,
    keywords: job.keywords,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    errorCode: job.errorCode ?? null,
    progress: job.progress,
    summary: job.summary,
  })
}
