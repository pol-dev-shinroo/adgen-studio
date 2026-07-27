import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useNavigation } from './NavigationContext.jsx'
import {
  startGeneration as startGenerationApi, getGenerationStatus, getGeneratedResults, updateGeneratedStatus,
} from '../api/backendClient.js'
import { adaptGeneratedResult } from '../api/adaptGeneratedResult.js'
import { useJobPolling } from '../hooks/useJobPolling.js'

const GalleryContext = createContext(null)

export function GalleryProvider({ children }) {
  const { showToast } = useNavigation()
  const [results, setResults] = useState([])
  const { activeJob, run } = useJobPolling({ pollIntervalMs: 1500 })
  // The most recent finished job's summary — kept around after activeJob
  // clears to null so a batch's failures (and their retry buttons) stay
  // visible until the next generation starts, not just for the instant the
  // job finishes.
  const [lastSummary, setLastSummary] = useState(null)
  // Remembered so retryResult can re-issue a scoped single-image request
  // without the caller having to thread the whole original request back
  // through — see retryResult below for why this can't just resume the
  // original job.
  const [lastParams, setLastParams] = useState(null)
  // Scoped strictly to the mount-time fetch below, not later re-fetches
  // after a generation job finishes — those are already covered by
  // GenerationProgress.
  const [resultsLoading, setResultsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getGeneratedResults()
      .then(({ results: raw }) => {
        if (!cancelled) setResults(raw.map(adaptGeneratedResult))
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load generated results from backend:', err)
      })
      .finally(() => {
        if (!cancelled) setResultsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  // input: { refBrand, refAdIds, brand:{key,productIds}, formats, quantity,
  // styleIntensity, instructions }. Real money per call — every render is a
  // gpt-5.5 image_generation-tool call, chained behind vision/research/
  // copywriting calls per reference ad. productIds is an array — Step 3
  // allows selecting more than one product, each getting its own full
  // render pass, hence the extra multiplier below.
  const startGeneration = useCallback((input) => {
    setLastParams(input)
    setLastSummary(null)

    run({
      initialJob: {
        status: 'running',
        refBrand: input.refBrand,
        brandKey: input.brand.key,
        progress: {
          phase: 'analyzing',
          totalRenders: input.brand.productIds.length * input.refAdIds.length * input.formats.length * input.quantity,
          rendersDone: 0,
          recentItems: [],
        },
      },
      start: async () => (await startGenerationApi(input)).jobId,
      getStatus: getGenerationStatus,
      onFailed: (job) => {
        setLastSummary(job.summary)
        showToast(`생성 실패: ${job.error || '알 수 없는 오류'}`)
      },
      onDone: async (job) => {
        const { results: raw } = await getGeneratedResults()
        setResults(raw.map(adaptGeneratedResult))
        setLastSummary(job.summary)
        showToast(
          `생성 완료: ${job.summary.succeeded}건 성공` +
          (job.summary.failed ? ` · 실패 ${job.summary.failed}건` : '')
        )
      },
      onError: (err) => {
        console.error('Generation failed:', err)
        showToast(`생성 중 오류가 발생했습니다: ${err.message}`)
      },
    })
  }, [showToast, run])

  const approveResult = useCallback(async (id) => {
    const previous = results
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, approved: true } : r)))
    try {
      await updateGeneratedStatus(id, '승인')
    } catch (err) {
      console.error('Approve failed:', err)
      setResults(previous)
      showToast(`승인 실패: ${err.message}`)
    }
  }, [results, showToast])

  // Per-image, not whole-batch. Re-running the entire original request
  // would re-render (and re-pay for) every image that already succeeded —
  // this is the single most expensive action in the app, so that's worth
  // avoiding. What it can't avoid: generation.service.js only caches a
  // reference ad's vision/research/copywriting analysis in memory for the
  // lifetime of one job run, so a retry arriving after that job has already
  // finished can't skip straight to the render step — it re-runs those
  // three (comparatively cheap, no image-generation-tool involved) calls
  // for just the one failed ad, then renders exactly one image. It never
  // touches any other ad/format/quantity slot from the original batch.
  // Also scopes brand.productIds down to just the failed item's product —
  // lastParams.brand.productIds still holds every product from the
  // original multi-product batch, and spreading it wholesale would re-fan-
  // out the retry across all of them instead of just the one that failed.
  const retryResult = useCallback((failedItem) => {
    if (!lastParams) return
    startGeneration({
      ...lastParams,
      brand: { ...lastParams.brand, productIds: [failedItem.productId] },
      refAdIds: [failedItem.adId],
      formats: [failedItem.format],
      quantity: 1,
    })
  }, [lastParams, startGeneration])

  return (
    <GalleryContext.Provider
      value={{ results, activeJob, lastSummary, startGeneration, approveResult, retryResult, resultsLoading }}
    >
      {children}
    </GalleryContext.Provider>
  )
}

export function useGallery() {
  const ctx = useContext(GalleryContext)
  if (!ctx) throw new Error('useGallery must be used within GalleryProvider')
  return ctx
}
