import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { initialAds } from '../data/initialAds.js'
import { useNavigation } from './NavigationContext.jsx'
import { getAds, startCollect, getJobStatus, updateAdField, discardAds as discardAdsApi } from '../api/backendClient.js'
import { adaptAd } from '../api/adaptAd.js'
import { useJobPolling } from '../hooks/useJobPolling.js'

const AdsContext = createContext(null)

export function AdsProvider({ children }) {
  const { showToast } = useNavigation()
  const [ads, setAds] = useState([])
  const [brandFilter, setBrandFilter] = useState('전체')
  const [mediaFilter, setMediaFilterState] = useState('all') // 'all' | 'image' | 'video'
  const [recentOnly, setRecentOnly] = useState(false)
  const [collected, setCollected] = useState([]) // new/updated only — unchanged ads aren't shown as review cards
  const [collectedUnchangedCount, setCollectedUnchangedCount] = useState(0)
  const [lastQuery, setLastQuery] = useState('')
  // Scoped strictly to the mount-time fetch below, not later re-fetches
  // after a collection job finishes — those are already covered by
  // CollectionProgress.
  const [adsLoading, setAdsLoading] = useState(true)
  // Dropped from 1500ms so the live progress UI feels responsive.
  const { activeJob, run } = useJobPolling({ pollIntervalMs: 900 })

  // Load the real archive from the backend on mount. If the backend is
  // unreachable, fall back to the mock fixture so the screen still renders.
  useEffect(() => {
    let cancelled = false
    getAds()
      .then((raw) => {
        if (cancelled) return
        setAds(raw.map(adaptAd))
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load ads from backend, falling back to mock data:', err)
        setAds(initialAds)
        showToast('백엔드 연결 실패 — 임시로 샘플 데이터를 표시합니다')
      })
      .finally(() => {
        if (!cancelled) setAdsLoading(false)
      })
    return () => { cancelled = true }
  }, [showToast])

  // Runs a real collection job against the backend: starts it, polls until
  // done/failed, then re-fetches the full archive. The job itself already
  // classified each touched ad as new/updated/unchanged (real diffing
  // against what was already in the sheet — see sheets.service.js), so the
  // frontend just looks that up rather than re-guessing from what it
  // happened to have cached locally beforehand.
  const collect = useCallback((query, resultsLimit) => {
    const q = query.trim()
    if (!q) {
      showToast('브랜드명 또는 AD ID를 입력하세요')
      return
    }

    setLastQuery(q)
    showToast(`"${q}" 실시간 수집 중... (이미지·동영상 다운로드)`)

    // Not awaited — fire-and-forget, same as before this was extracted into
    // useJobPolling. The initial job shape is set synchronously inside
    // run(), before startCollect's network response even comes back, so the
    // tab switch to "실시간 수집 결과" happens in the same render as the click.
    run({
      initialJob: {
        status: 'running',
        progress: {
          phase: 'scraping',
          currentKeywordIndex: 0,
          totalKeywords: 1,
          currentKeyword: q,
          totalAdsFound: 0,
          adsProcessed: 0,
          recentItems: [],
        },
      },
      start: async () => (await startCollect([q], { resultsLimit })).jobId,
      getStatus: getJobStatus,
      onFailed: (job) => {
        if (job.errorCode === 'RATE_LIMITED') {
          showToast('API 요청 한도를 초과했습니다 — 잠시 후 다시 시도해주세요')
        } else {
          showToast(`수집 실패: ${job.error || '알 수 없는 오류'}`)
        }
      },
      onDone: async (job) => {
        const refreshed = (await getAds()).map(adaptAd)
        setAds(refreshed)

        const statusById = new Map((job.summary.statuses ?? []).map((s) => [String(s.adArchiveId), s]))
        const withStatus = refreshed
          .filter((a) => a.searchKeyword === q)
          .map((a) => {
            const s = statusById.get(String(a.id))
            return {
              ...a,
              status: s?.status ?? 'unchanged',
              changedFields: s?.changedFields ?? [],
              previousValues: s?.previousValues ?? null,
            }
          })

        const newCount = withStatus.filter((a) => a.status === 'new').length
        const updatedCount = withStatus.filter((a) => a.status === 'updated').length
        const unchangedCount = withStatus.filter((a) => a.status === 'unchanged').length

        // Only new/updated ads are worth reviewing as cards; unchanged ones
        // would just be noise. The count still needs to be shown somewhere,
        // though, so it's kept separately rather than derived from `collected`.
        setCollected(withStatus.filter((a) => a.status !== 'unchanged'))
        setCollectedUnchangedCount(unchangedCount)

        showToast(`수집 완료: 신규 ${newCount}건 · 업데이트 ${updatedCount}건 · 변경없음 ${unchangedCount}건`)
      },
      onError: (err) => {
        console.error('Collection failed:', err)
        showToast(`수집 중 오류가 발생했습니다: ${err.message}`)
      },
    })
  }, [showToast, run])

  // Renaming the card's brand label actually edits the "Search Keyword"
  // sheet column (that's what the label is sourced from — see adaptAd.js).
  // Updates optimistically, then rolls back and shows an error toast if the
  // backend write fails.
  const renameBrand = useCallback(async (id, newName) => {
    const previousAds = ads
    setAds((prev) => prev.map((a) => (a.id === id ? { ...a, brand: newName } : a)))

    try {
      await updateAdField(id, 'Search Keyword', newName)
      showToast(`브랜드명이 '${newName}'(으)로 수정됐습니다 — 이후 브랜드별 조회에 반영`)
    } catch (err) {
      console.error('Rename failed:', err)
      setAds(previousAds)
      showToast(`수정 실패: ${err.message}`)
    }
  }, [ads, showToast])

  // Discards the ads the user unchecked in select mode: auto-save stays on
  // scrape (this is an after-the-fact undo, not a stage-then-commit
  // pipeline). A 'new' ad is actually deleted (sheet row + Drive media); an
  // 'updated' ad is reverted to its pre-scrape values instead (its Drive
  // media is left alone — see the backend controller for why). Takes full
  // ad objects (not just IDs) since it needs each one's status and, for
  // reverts, its previousValues.
  const discardAds = useCallback(async (adsToDiscard) => {
    const items = adsToDiscard.map((ad) => (
      ad.status === 'updated'
        ? { adArchiveId: ad.id, action: 'revert', previousValues: ad.previousValues }
        : { adArchiveId: ad.id, action: 'delete' }
    ))

    try {
      const result = await discardAdsApi(lastQuery, items)
      const idsToRemove = new Set(adsToDiscard.map((a) => String(a.id)))
      const keptCount = collected.filter((a) => !idsToRemove.has(String(a.id))).length

      // Re-fetch rather than simulate the revert locally — a reverted ad's
      // fields need to reflect whatever the sheet actually has now, and
      // re-fetching guarantees that instead of hand-rolling the same logic
      // twice.
      const refreshed = (await getAds()).map(adaptAd)
      setAds(refreshed)
      setCollected((prev) => prev.filter((a) => !idsToRemove.has(String(a.id))))

      showToast(`보관 ${keptCount}건 · 삭제 ${result.deleted}건 · 복원 ${result.reverted}건`)
      return result
    } catch (err) {
      console.error('Discard failed:', err)
      showToast(`처리 실패: ${err.message}`)
      throw err
    }
  }, [lastQuery, collected, showToast])

  // Clicking the already-active chip resets to 'all' — same toggle pattern
  // used by the other chip filters in this app.
  const toggleMediaFilter = useCallback((value) => {
    setMediaFilterState((prev) => (prev === value ? 'all' : value))
  }, [])

  const toggleRecentOnly = useCallback(() => {
    setRecentOnly((prev) => !prev)
  }, [])

  const brands = [...new Set(ads.map((a) => a.brand))]

  return (
    <AdsContext.Provider value={{
      ads, brands, brandFilter, setBrandFilter,
      mediaFilter, toggleMediaFilter,
      recentOnly, toggleRecentOnly,
      collected, collectedUnchangedCount, lastQuery, collect, renameBrand, activeJob, discardAds,
      adsLoading,
    }}>
      {children}
    </AdsContext.Provider>
  )
}

export function useAds() {
  const ctx = useContext(AdsContext)
  if (!ctx) throw new Error('useAds must be used within AdsProvider')
  return ctx
}
