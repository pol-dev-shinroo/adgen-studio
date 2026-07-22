import { startCollection, getJob } from '../services/collect.service.js'

export function postCollect(req, res) {
  const { keywords } = req.body ?? {}
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

  const jobId = startCollection(cleaned)
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
    summary: job.summary,
  })
}
