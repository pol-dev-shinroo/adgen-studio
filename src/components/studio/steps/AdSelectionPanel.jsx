import { useState, useRef, useEffect } from 'react'
import { useNavigation } from '../../../context/NavigationContext.jsx'
import { useAds } from '../../../context/AdsContext.jsx'
import { useStudio } from '../../../context/StudioContext.jsx'
import Thumb from '../../common/Thumb.jsx'
import Badge from '../../common/Badge.jsx'
import Chip from '../../common/Chip.jsx'
import ScanningOverlay from '../../common/ScanningOverlay.jsx'
import AdDetailModal from '../../feed/AdDetailModal.jsx'
import ReferenceSheetGallery from './ReferenceSheetGallery.jsx'

const EMPTY_SELECTION = {
  checkedAdIds: [], availablePrices: [], availablePromotions: [], availableAdHooks: [], availableSheetAdIds: [],
  selectedPrice: null, selectedPromotion: null, selectedAdHooks: [], selectedSheetAdIds: [],
}

// Part O: brand-scoped replacement for the old per-selected-product 원본/
// 참조/StepProductFields block. Our own ads are brand-scoped, not product-
// scoped (no ad<->product link exists — see Part N), so this renders once
// per active brand, alongside the product picker, not nested inside it.
export default function AdSelectionPanel({ brand }) {
  const { go } = useNavigation()
  const { ads, extractAdReference, extractingIds } = useAds()
  const {
    adSelections, toggleAdChecked, toggleAllAdsChecked,
    selectAdPrice, selectAdPromotion, toggleAdHookSelection,
    toggleSheetSelected, toggleAllSheetsSelected,
  } = useStudio()
  const [detailAd, setDetailAd] = useState(null)

  const brandAds = ads.filter((a) => a.brand === brand.name)
  const sel = adSelections[brand.name] || EMPTY_SELECTION

  const allAdIds = brandAds.map((a) => a.id)
  const allChecked = allAdIds.length > 0 && allAdIds.every((id) => sel.checkedAdIds.includes(id))
  const someChecked = sel.checkedAdIds.length > 0 && !allChecked
  const selectAllRef = useRef(null)
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked
  }, [someChecked])

  const sheetAds = brandAds.filter((a) => sel.availableSheetAdIds.includes(a.id))

  return (
    <div className="ad-sel-panel">
      <div className="sect">
        {brand.name} — 우리 광고에서 참조 추출 <span className="hint">— 체크한 광고에서 참조 이미지·카피를 추출해 생성에 활용합니다</span>
      </div>

      {brandAds.length === 0 ? (
        <div className="ad-sel-empty">
          <p className="sub">
            "{brand.name}"으로 수집된 광고가 아직 없습니다. 경쟁사 광고 피드에서 "{brand.name}"을 검색해 먼저 수집해주세요 — 우리 브랜드명으로 검색해도 제한 없이 수집할 수 있습니다.
          </p>
          <button type="button" className="btn ghost sm" onClick={() => go('feed')}>경쟁사 광고 피드로 이동</button>
        </div>
      ) : (
        <>
          <label className="ad-sel-allrow">
            <input
              type="checkbox"
              ref={selectAllRef}
              checked={allChecked}
              onChange={() => toggleAllAdsChecked(brand.name, allAdIds)}
            />
            전체 선택 <span className="count">{sel.checkedAdIds.length}/{brandAds.length}개 선택됨</span>
          </label>

          <div className="refrow">
            {brandAds.map((ad) => {
              const isChecked = sel.checkedAdIds.includes(ad.id)
              const isExtracting = extractingIds.has(ad.id)
              const hasReference = !!ad.extractedReference
              const copyText = (ad.raw?.['Post Content'] || ad.title || '').replace(/\n/g, ' ')

              return (
                <div key={ad.id} className={`refpick ${isChecked ? 'on' : ''}`} onClick={() => toggleAdChecked(brand.name, ad.id)}>
                  <Thumb gradient={ad.gradient} image={ad.image}>
                    <ScanningOverlay active={isExtracting} />
                    <input
                      type="checkbox"
                      className="ad-check"
                      checked={isChecked}
                      onChange={() => toggleAdChecked(brand.name, ad.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Badge variant={ad.live ? 'live' : 'arch'} className="state">
                      {ad.live ? '게재중' : '아카이브'}
                    </Badge>
                    <Badge variant="media">
                      {ad.media === 'video' ? '🎬 동영상' : '🖼 이미지'}
                    </Badge>
                  </Thumb>
                  <div className="refpick-body">
                    {copyText && <div className="refpick-copy">{copyText}</div>}
                    <div className="refpick-foot">
                      <span>AD {String(ad.id).slice(-4)}</span>
                      <button
                        className="refpick-detail"
                        onClick={(e) => { e.stopPropagation(); setDetailAd(ad) }}
                      >
                        상세보기
                      </button>
                    </div>
                    <button
                      type="button"
                      className={hasReference ? 'btn ghost sm' : 'btn pri sm'}
                      style={{ width: '100%', marginTop: 8 }}
                      disabled={isExtracting}
                      onClick={(e) => { e.stopPropagation(); extractAdReference(ad.id) }}
                    >
                      {isExtracting ? '추출 중...' : hasReference ? '다시 추출' : '참조 이미지 추출'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {sel.checkedAdIds.length > 0 && (
        <div className="ad-sel-copy">
          <div className="field">
            <label>가격</label>
            {sel.availablePrices.length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>체크한 광고 중 가격 정보가 추출된 광고가 없습니다.</p>
            ) : (
              <select
                value={sel.selectedPrice || ''}
                onChange={(e) => selectAdPrice(brand.name, e.target.value || null)}
              >
                <option value="">선택 안 함</option>
                {sel.availablePrices.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>

          <div className="field">
            <label>프로모션</label>
            {sel.availablePromotions.length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>체크한 광고 중 프로모션 정보가 추출된 광고가 없습니다.</p>
            ) : (
              <select
                value={sel.selectedPromotion || ''}
                onChange={(e) => selectAdPromotion(brand.name, e.target.value || null)}
              >
                <option value="">선택 안 함</option>
                {sel.availablePromotions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>

          <div className="field">
            <label>광고 후킹 카피 <span className="hint">— 여러 개 선택 가능</span></label>
            {sel.availableAdHooks.length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>체크한 광고 중 후킹 카피가 추출된 광고가 없습니다.</p>
            ) : (
              <div className="optrow" style={{ marginBottom: 0 }}>
                {sel.availableAdHooks.map((hook) => (
                  <Chip key={hook} active={sel.selectedAdHooks.includes(hook)} onClick={() => toggleAdHookSelection(brand.name, hook)}>
                    {hook}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {sheetAds.length > 0 && (
        <ReferenceSheetGallery
          sheetAds={sheetAds}
          selectedSheetAdIds={sel.selectedSheetAdIds}
          onToggle={(adId) => toggleSheetSelected(brand.name, adId)}
          onToggleAll={() => toggleAllSheetsSelected(brand.name, sel.availableSheetAdIds)}
        />
      )}

      {detailAd && <AdDetailModal ad={detailAd} onClose={() => setDetailAd(null)} />}
    </div>
  )
}
