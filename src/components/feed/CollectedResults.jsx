import { useState } from 'react'
import { useAds } from '../../context/AdsContext.jsx'
import { useNavigation } from '../../context/NavigationContext.jsx'
import Spinner from '../common/Spinner.jsx'
import AdCard from './AdCard.jsx'

// Friendly Korean labels for the AD_COLUMNS names most likely to show up in
// changedFields; anything not listed here just falls back to its raw name.
const FIELD_LABELS = {
  'Status': '게재 상태',
  'End Date': '종료일',
  'Title': '제목',
  'Post Content': '본문',
  'Bottom Content': '하단 문구',
  'CTA Text': 'CTA 문구',
  'Landing URL': '랜딩 URL',
  'Display Format': '형식',
  'Platforms': '노출 플랫폼',
  'Variant Count': '소재 개수',
}

function friendlyFields(fields) {
  return fields.map((f) => FIELD_LABELS[f] || f).join('/')
}

function StatusNote({ ad }) {
  if (ad.status === 'new') {
    return (
      <div className="dupnote" style={{ background: '#e9e9fb', color: 'var(--brand)', borderColor: '#c9c9f0' }}>
        ✦ 신규 아카이빙됨
      </div>
    )
  }
  if (ad.status === 'updated') {
    return (
      <div className="dupnote" style={{ background: '#fdf1e3', color: 'var(--amber)', borderColor: '#f3d9ad' }}>
        ♻ 정보 업데이트됨{ad.changedFields?.length > 0 && ` (${friendlyFields(ad.changedFields)} 변경)`}
      </div>
    )
  }
  return (
    <div className="dupnote">🗂 이미 아카이브된 광고 — 변경 사항 없음</div>
  )
}

export default function CollectedResults({ onOpenDetail }) {
  const { collected, collectedUnchangedCount, lastQuery, discardAds } = useAds()
  const { showToast } = useNavigation()
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [isSaving, setIsSaving] = useState(false)

  if (!collected.length && collectedUnchangedCount === 0) {
    return (
      <p className="sub" style={{ marginBottom: 14 }}>
        아직 수집 결과가 없습니다. 위에서 검색해 실시간 수집을 실행하세요.
      </p>
    )
  }

  const newCount = collected.filter((a) => a.status === 'new').length
  const updatedCount = collected.filter((a) => a.status === 'updated').length
  const unchangedCount = collectedUnchangedCount

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  // Everything starts checked ("keep") — the user unchecks the few they
  // want to discard, rather than having to check every item they want to keep.
  const enterSelectMode = () => {
    setSelectedIds(new Set(collected.map((a) => a.id)))
    setSelectMode(true)
  }

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (
      prev.size === collected.length ? new Set() : new Set(collected.map((a) => a.id))
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

  const handleKeep = async () => {
    const uncheckedAds = collected.filter((a) => !selectedIds.has(a.id))
    if (uncheckedAds.length === 0) {
      showToast('모든 항목이 보관되었습니다')
      exitSelectMode()
      return
    }
    setIsSaving(true)
    try {
      await discardAds(uncheckedAds)
      exitSelectMode()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      {newCount === 0 && updatedCount === 0 && (
        <p className="sub" style={{ marginBottom: 4, fontWeight: 700, color: 'var(--ink)' }}>
          새로 추가되거나 업데이트된 광고가 없습니다 — 모두 최신 상태입니다
        </p>
      )}
      <p className="sub" style={{ marginBottom: 14 }}>
        "{lastQuery}" 수집 완료 — 신규 {newCount}건, 업데이트 {updatedCount}건, 변경없음 {unchangedCount}건
      </p>

      {collected.length > 0 && (
        <>
          {selectMode && (
            <p className="sub" style={{ marginBottom: 8, fontSize: 12 }}>
              신규 항목은 해제 시 삭제되고, 업데이트 항목은 해제 시 이전 정보로 복원됩니다.
            </p>
          )}
          <div className="select-toolbar">
            {selectMode ? (
              <>
                <label className="select-all">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === collected.length}
                    onChange={toggleSelectAll}
                    disabled={isSaving}
                  />
                  전체 선택
                </label>
                <div className="select-actions">
                  <button className="btn ghost sm" onClick={exitSelectMode} disabled={isSaving}>취소</button>
                  <button className="btn pri sm" onClick={handleKeep} disabled={isSaving}>
                    {isSaving && <Spinner size="sm" />} {isSaving ? '저장 중...' : `${selectedIds.size}개 선택됨 · 보관하기`}
                  </button>
                </div>
              </>
            ) : (
              <div className="select-actions">
                <button className="btn ghost sm" onClick={enterSelectMode}>선택하기</button>
              </div>
            )}
          </div>

          <div className="grid" style={isSaving ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
            {collected.map((ad, i) => (
              <AdCard
                key={`${ad.id}-${i}`}
                ad={ad}
                onOpenDetail={onOpenDetail}
                note={<StatusNote ad={ad} />}
                selectable={selectMode}
                selected={selectedIds.has(ad.id)}
                onToggleSelect={toggleOne}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
