import { randomUUID } from 'node:crypto'
import { runFacebookAdsScraper } from './apify.service.js'
import { upsertAdRows } from './sheets.service.js'
import { mapAd } from '../mappers/ad.mapper.js'

// In-memory job store. Jobs are lost on restart, which is fine for the
// current single-user workflow — revisit if this ever runs multi-instance.
const jobs = new Map()

export function startCollection(keywords) {
  const job = {
    id: randomUUID(),
    status: 'running',
    keywords,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    summary: {
      totalAds: 0,
      appended: 0,
      updated: 0,
      perKeyword: [],
      sampleRows: [],
    },
  }
  jobs.set(job.id, job)

  runJob(job).catch((err) => {
    job.status = 'failed'
    job.error = err.message
    job.finishedAt = new Date().toISOString()
  })

  return job.id
}

export function getJob(jobId) {
  return jobs.get(jobId) ?? null
}

async function runJob(job) {
  for (const keyword of job.keywords) {
    const items = await runFacebookAdsScraper(keyword)
    const scrapedAt = new Date().toISOString()
    const mapped = items.map((item) => mapAd(item, { keyword, scrapedAt }))

    const { appended, updated } = mapped.length > 0
      ? await upsertAdRows(mapped)
      : { appended: 0, updated: 0 }

    job.summary.totalAds += items.length
    job.summary.appended += appended
    job.summary.updated += updated
    job.summary.perKeyword.push({ keyword, ads: items.length, appended, updated })
    if (job.summary.sampleRows.length < 3) {
      job.summary.sampleRows.push(...mapped.slice(0, 3 - job.summary.sampleRows.length))
    }
  }
  job.status = 'done'
  job.finishedAt = new Date().toISOString()
}
