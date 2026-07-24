import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { initialAds } from '../data/initialAds.js'
import { useNavigation } from './NavigationContext.jsx'
import { getAds, startCollect, getJobStatus, updateAdField } from '../api/backendClient.js'
import { adaptAd } from '../api/adaptAd.js'

const AdsContext = createContext(null)

const POLL_INTERVAL_MS = 1500

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function AdsProvider({ children }) {
  const { showToast } = useNavigation()
  const [ads, setAds] = useState([])
  const [brandFilter, setBrandFilter] = useState('전체')
  const [collected, setCollected] = useState([])
  const [lastQuery, setLastQuery] = useState('')

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
    return () => { cancelled = true }
  }, [showToast])

  // Runs a real collection job against the backend: starts it, polls until
  // done/failed, then re-fetches the full archive and diffs it against what
  // the UI already knew (by Ad Archive ID) to tell fresh ads from ones that
  // were already archived — same fresh/dup UX as the old simulation.
  const collect = useCallback(async (query) => {
    const q = query.trim()
    if (!q) {
      showToast('브랜드명 또는 AD ID를 입력하세요')
      return
    }

    const knownIds = new Set(ads.map((a) => a.id))
    setLastQuery(q)
    showToast(`"${q}" 실시간 수집 중... (이미지·동영상 다운로드)`)

    try {
      const { jobId } = await startCollect([q])

      let job
      do {
        await sleep(POLL_INTERVAL_MS)
        job = await getJobStatus(jobId)
      } while (job.status === 'running')

      if (job.status === 'failed') {
        showToast(`수집 실패: ${job.error || '알 수 없는 오류'}`)
        return
      }

      const refreshed = (await getAds()).map(adaptAd)
      setAds(refreshed)

      const withDup = refreshed
        .filter((a) => a.searchKeyword === q)
        .map((a) => ({ ...a, isDup: knownIds.has(a.id) }))
      setCollected(withDup)

      const freshCount = withDup.filter((a) => !a.isDup).length
      const dupCount = withDup.length - freshCount
      showToast(`수집 완료: 신규 ${freshCount}건 · 중복 ${dupCount}건`)
    } catch (err) {
      console.error('Collection failed:', err)
      showToast(`수집 중 오류가 발생했습니다: ${err.message}`)
    }
  }, [ads, showToast])

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

  const brands = [...new Set(ads.map((a) => a.brand))]

  return (
    <AdsContext.Provider value={{ ads, brands, brandFilter, setBrandFilter, collected, lastQuery, collect, renameBrand }}>
      {children}
    </AdsContext.Provider>
  )
}

export function useAds() {
  const ctx = useContext(AdsContext)
  if (!ctx) throw new Error('useAds must be used within AdsProvider')
  return ctx
}
