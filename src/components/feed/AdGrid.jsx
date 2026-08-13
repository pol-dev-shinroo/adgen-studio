import { useState } from 'react'
import { useAds } from '../../context/AdsContext.jsx'
import { useStudio } from '../../context/StudioContext.jsx'
import { useNavigation } from '../../context/NavigationContext.jsx'
import PageLoader from '../common/PageLoader.jsx'
import AdCard from './AdCard.jsx'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export default function AdGrid({ onOpenDetail }) {
  const { ads, brandFilter, mediaFilter, recentOnly, adsLoading } = useAds()
  const { prefillFromAds } = useStudio()
  const { showToast } = useNavigation()
  // BB-6: bulk "이 광고들로 생성하기" — reuses CollectedResults.jsx's own
  // select-mode/전체 선택/select-toolbar pattern (same CSS classes, same
  // AdCard selectable/selected/onToggleSelect props) rather than a new one.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const cutoff = Date.now() - SEVEN_DAYS_MS
  const list = ads.filter((ad) => {
    if (brandFilter !== '전체' && ad.brand !== brandFilter) return false
    if (mediaFilter !== 'all' && ad.media !== mediaFilter) return false
    if (recentOnly) {
      const scrapedAt = new Date(ad.raw?.['Date Scraped'] ?? '').getTime()
      if (!(scrapedAt >= cutoff)) return false
    }
    return true
  })

  if (adsLoading && list.length === 0) return <PageLoader />

  // Part W: every other list screen in this app (ProductBrowser, Gallery,
  // StepReferenceAds) handles "no results" explicitly with a distinct
  // message per cause — this one only handled the loading case, silently
  // rendering a blank grid for a genuinely empty archive or a filter
  // combination matching nothing.
  if (ads.length === 0) {
    return <p className="sub">아직 수집된 광고가 없습니다 — 위에서 브랜드명 또는 AD ID를 검색해 실시간 수집을 시작하세요.</p>
  }
  if (list.length === 0) {
    return <p className="sub">현재 필터 조건에 맞는 광고가 없습니다.</p>
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (
      prev.size === list.length ? new Set() : new Set(list.map((a) => a.id))
    ))
  }

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Step 1/2 of the wizard are inherently single-reference-brand (Step 1
  // is a radio pick, Step 2's ad list is scoped to that one brand) — a
  // selection spanning brands has no honest way to become a single
  // prefillFromAds call, so it's rejected with a clear message rather than
  // silently keeping only the first brand's ads.
  const handleBulkGenerate = () => {
    const selectedAds = list.filter((a) => selectedIds.has(a.id))
    if (selectedAds.length === 0) return
    const brandsInSelection = new Set(selectedAds.map((a) => a.brand))
    if (brandsInSelection.size > 1) {
      showToast('선택한 광고가 여러 브랜드에 걸쳐 있습니다 — 한 브랜드의 광고만 선택하세요')
      return
    }
    prefillFromAds(selectedAds[0].brand, selectedAds.map((a) => a.id))
    exitSelectMode()
  }

  return (
    <div>
      <div className="select-toolbar">
        {selectMode ? (
          <>
            <label className="select-all">
              <input
                type="checkbox"
                checked={selectedIds.size === list.length}
                onChange={toggleSelectAll}
              />
              전체 선택
            </label>
            <div className="select-actions">
              <button className="btn ghost sm" onClick={exitSelectMode}>취소</button>
              <button className="btn pri sm" onClick={handleBulkGenerate} disabled={selectedIds.size === 0}>
                ✨ {selectedIds.size}개 광고로 생성하기
              </button>
            </div>
          </>
        ) : (
          <div className="select-actions">
            <button className="btn ghost sm" onClick={() => setSelectMode(true)}>선택하기</button>
          </div>
        )}
      </div>

      <div className="grid">
        {list.map((ad) => (
          <AdCard
            key={ad.id}
            ad={ad}
            onOpenDetail={onOpenDetail}
            selectable={selectMode}
            selected={selectedIds.has(ad.id)}
            onToggleSelect={toggleOne}
          />
        ))}
      </div>
    </div>
  )
}
