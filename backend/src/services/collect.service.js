import { randomUUID } from 'node:crypto'
import { runFacebookAdsScraper } from './apify.service.js'
import { upsertAdRows } from './sheets.service.js'
import { uploadFromUrl } from './drive.service.js'
import { mapAd } from '../mappers/ad.mapper.js'
import { mapWithConcurrency } from '../utils/pool.js'

// In-memory job store. Jobs are lost on restart, which is fine for the
// current single-user workflow — revisit if this ever runs multi-instance.
const jobs = new Map()

const MEDIA_CONCURRENCY = 3 // parallel downloads per ad

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
      unchanged: 0,
      mediaUploaded: 0,
      mediaReused: 0,
      mediaFailed: 0,
      perKeyword: [],
      sampleRows: [],
      statuses: [],
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

// Downloads one media URL into Drive; a failure logs and returns null so a
// single dead CDN link never fails the whole collection job.
async function archiveOne(url, meta, counters) {
  try {
    const { link, reused } = await uploadFromUrl(url, meta)
    counters[reused ? 'mediaReused' : 'mediaUploaded'] += 1
    return link
  } catch (err) {
    counters.mediaFailed += 1
    console.warn(`media archive failed (ad ${meta.adArchiveId}, ${meta.index}): ${err.message}`)
    return null
  }
}

async function archiveAdMedia(ad, counters) {
  const keyword = ad['Search Keyword']
  const adArchiveId = ad['Ad Archive ID']
  if (!adArchiveId) return

  const imageUrls = ad['Image Links'] ? ad['Image Links'].split('\n').filter(Boolean) : []
  const imageLinks = await mapWithConcurrency(imageUrls, MEDIA_CONCURRENCY, (url, i) =>
    archiveOne(url, { keyword, adArchiveId, index: i }, counters)
  )
  ad['Archived Image Links'] = imageLinks.filter(Boolean).join('\n')

  if (ad['Video Thumbnail']) {
    const link = await archiveOne(ad['Video Thumbnail'], { keyword, adArchiveId, index: 'thumb' }, counters)
    ad['Archived Thumbnail'] = link ?? ''
  }
}

async function runJob(job) {
  for (const keyword of job.keywords) {
    const items = await runFacebookAdsScraper(keyword)
    const scrapedAt = new Date().toISOString()
    const mapped = items.map((item) => mapAd(item, { keyword, scrapedAt }))

    for (const ad of mapped) {
      await archiveAdMedia(ad, job.summary)
    }

    const { appended, updated, unchanged, statuses } = mapped.length > 0
      ? await upsertAdRows(mapped)
      : { appended: 0, updated: 0, unchanged: 0, statuses: [] }

    job.summary.totalAds += items.length
    job.summary.appended += appended
    job.summary.updated += updated
    job.summary.unchanged += unchanged
    job.summary.statuses.push(...statuses)
    job.summary.perKeyword.push({ keyword, ads: items.length, appended, updated, unchanged })
    if (job.summary.sampleRows.length < 3) {
      job.summary.sampleRows.push(...mapped.slice(0, 3 - job.summary.sampleRows.length))
    }
  }
  job.status = 'done'
  job.finishedAt = new Date().toISOString()
}
