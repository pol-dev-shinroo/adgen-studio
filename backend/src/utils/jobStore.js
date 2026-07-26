import { randomUUID } from 'node:crypto'

// Shared in-memory job-store skeleton behind collect.service.js and
// productSync.service.js. Jobs are lost on restart, which is fine for the
// current single-user workflow — revisit if this ever runs multi-instance.
// Each service creates its own store (a separate Map — job IDs aren't
// shared between ad-collection and product-sync jobs) and supplies its own
// initial progress/summary shape, runJob logic, and failure handling (e.g.
// collect.service.js's RATE_LIMITED-specific error message vs.
// productSync.service.js's plain err.message) — this only owns the Map
// storage, ID assignment, and the fire-and-forget catch-and-mark-failed
// mechanics, nothing domain-specific.
export function createJobStore() {
  const jobs = new Map()

  function startJob(initialFields, runJob, onError) {
    const job = { id: randomUUID(), ...initialFields }
    jobs.set(job.id, job)

    runJob(job).catch((err) => {
      onError(job, err)
    })

    return job.id
  }

  function getJob(jobId) {
    return jobs.get(jobId) ?? null
  }

  return { startJob, getJob }
}
