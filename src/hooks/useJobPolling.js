import { useState, useCallback } from 'react'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Encapsulates the shared "start a job, poll until done/failed, clean up"
// skeleton that used to be copy-pasted between AdsContext.collect() and
// ProductsContext.sync(): set an initial active-job shape synchronously (so
// the UI can react before the network request even resolves), call start()
// for the jobId, poll getStatus(jobId) on an interval until status isn't
// 'running', then hand off to onDone/onFailed/onError for whatever's
// genuinely different between callers (ad status classification vs.
// product re-fetch, the RATE_LIMITED error-code branch, etc.) — this hook
// only owns the polling loop and activeJob lifecycle, nothing domain-specific.
export function useJobPolling({ pollIntervalMs = 1200 } = {}) {
  const [activeJob, setActiveJob] = useState(null)

  const run = useCallback(async ({ initialJob, start, getStatus, onDone, onFailed, onError }) => {
    setActiveJob(initialJob)

    try {
      const jobId = await start()

      let job
      do {
        await sleep(pollIntervalMs)
        job = await getStatus(jobId)
        setActiveJob(job)
      } while (job.status === 'running')

      if (job.status === 'failed') {
        await onFailed?.(job)
        return
      }

      await onDone?.(job)
    } catch (err) {
      await onError?.(err)
    } finally {
      setActiveJob(null)
    }
  }, [pollIntervalMs])

  return { activeJob, run }
}
