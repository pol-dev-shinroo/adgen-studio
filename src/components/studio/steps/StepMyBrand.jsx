import { useStudio } from '../../../context/StudioContext.jsx'
import { useProducts } from '../../../context/ProductsContext.jsx'
import { formatDateTime } from '../../../utils/date.js'
import Thumb from '../../common/Thumb.jsx'
import Badge from '../../common/Badge.jsx'
import Spinner from '../../common/Spinner.jsx'
import SyncProgress from './SyncProgress.jsx'
import ProductReferencePanel from './ProductReferencePanel.jsx'

// Falls back to a native <select> once a brand has enough products that a
// card grid would be more scrolling than picking — the picker itself is
// still a two-click affair either way, so this only matters for very large
// catalogs.
const CARD_PICKER_MAX = 8

export default function StepMyBrand() {
  const { myBrands, toggleMyBrand, selections, toggleProductSelection } = useStudio()
  const { sync, activeJob } = useProducts()
  const activeBrands = myBrands.filter((b) => b.active)

  return (
    <>
      <div className="sect">내 브랜드 선택 <span className="hint">— 다중선택 가능</span></div>
      <div>
        {myBrands.map((b, i) => (
          <div key={b.name} className={`brand-item ${b.active ? 'on' : ''}`} onClick={() => toggleMyBrand(i)}>
            <div className="dot" style={{ background: b.color }}>{b.name[0]}</div>
            <div>
              <div className="nm">{b.name}</div>
              <div className="ds">{b.desc}</div>
            </div>
            <div className="ck">✓</div>
          </div>
        ))}
      </div>

      <div className="sect" style={{ marginTop: 20 }}>
        제품 정보 지정 <span className="auto">● 자사몰 API</span>{' '}
        <span className="hint">— 가격·프로모션·광고 카피는 동기화된 데이터가 기본값이며, 필요 시 직접 수정할 수 있습니다</span>
      </div>

      {activeBrands.length === 0 && <p className="sub">브랜드를 먼저 선택하세요.</p>}

      {activeBrands.map((b) => {
        const sel = selections[b.name]
        const productNames = Object.keys(b.products)
        const selectedProducts = (sel?.products || []).filter((n) => b.products[n])
        const isSyncing = activeJob?.brandKey === b.key
        const syncedAtLabel = formatDateTime(b.lastSynced, { fallback: null, dateStyle: 'medium', timeStyle: 'short' })

        return (
          <div key={b.name} className="prodcfg">
            <div className="bt">
              <span className="dot" style={{ background: b.color }}>{b.name[0]}</span>
              {b.name}
              <button
                type="button"
                className="sync-btn"
                onClick={() => sync(b.key)}
                disabled={!!activeJob}
              >
                {isSyncing && <Spinner size="sm" />} {isSyncing ? '동기화 중...' : '제품 동기화'}
              </button>
              {!isSyncing && syncedAtLabel && <span className="sync-meta">마지막 동기화: {syncedAtLabel}</span>}
            </div>

            {isSyncing && <SyncProgress job={activeJob} />}

            {productNames.length === 0 ? (
              <p className="sub">동기화된 제품이 없습니다 — 위 버튼으로 동기화하세요.</p>
            ) : (
              <>
                <div className="field" style={{ marginBottom: 14 }}>
                  <label>
                    제품 {productNames.length > 1 && <span className="multi">{productNames.length}개 옵션 — 여러 개 선택 가능</span>}
                  </label>
                  {productNames.length > CARD_PICKER_MAX ? (
                    <select
                      multiple
                      value={selectedProducts}
                      onChange={(e) => {
                        const newSelected = Array.from(e.target.selectedOptions).map((o) => o.value)
                        const changed = [
                          ...newSelected.filter((n) => !selectedProducts.includes(n)),
                          ...selectedProducts.filter((n) => !newSelected.includes(n)),
                        ]
                        changed.forEach((n) => toggleProductSelection(b.name, n))
                      }}
                    >
                      {productNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    // Same card language as ProductCard.jsx in 상품관리 (own
                    // markup, not the shared component — this dict shape is
                    // keyed by name for Step 3's selection model, not the
                    // full adapted-product shape ProductCard expects).
                    // .selected is now checkbox-like (toggleProductSelection),
                    // not radio-like — multiple cards can be highlighted.
                    <>
                      {/* Part S: small parity addition for the card-grid
                          variant only — the native <select multiple>
                          fallback above doesn't need one. No new
                          StudioContext action: reuses toggleProductSelection
                          per changed name, same technique the <select>
                          fallback's onChange already uses. Never lets the
                          selection go empty — deselect-all leaves the first
                          product selected, same invariant
                          toggleProductSelection itself already enforces. */}
                      {productNames.length > 1 && (
                        <label className="ad-sel-allrow">
                          <input
                            type="checkbox"
                            checked={selectedProducts.length === productNames.length}
                            onChange={() => {
                              const allSelected = selectedProducts.length === productNames.length
                              const changed = allSelected
                                ? productNames.slice(1).filter((n) => selectedProducts.includes(n))
                                : productNames.filter((n) => !selectedProducts.includes(n))
                              changed.forEach((n) => toggleProductSelection(b.name, n))
                            }}
                          />
                          전체 선택 <span className="count">{selectedProducts.length}/{productNames.length}개 선택됨</span>
                        </label>
                      )}
                      <div className="prod-grid">
                        {productNames.map((n) => {
                          const p = b.products[n]
                          const isSelected = selectedProducts.includes(n)
                          return (
                            <div
                              key={n}
                              className={`prod-card${isSelected ? ' selected' : ''}`}
                              onClick={() => toggleProductSelection(b.name, n)}
                            >
                              <Thumb gradient="g5" image={p.imageUrl} fit="contain">
                                {p.extractedReferences.some((r) => r.type === 'product') && (
                                  <Badge variant="live">레퍼런스 준비됨</Badge>
                                )}
                              </Thumb>
                              <div className="prod-card-body">
                                <div className="prod-card-name">
                                  <span className="dot" style={{ background: b.color }}>{b.name[0]}</span>
                                  {n}
                                </div>
                                <div className="prod-card-price">{p.price}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                {selectedProducts.length > 1 && (
                  <p className="sub" style={{ marginTop: -6, marginBottom: 14 }}>
                    {selectedProducts.length}개 제품 × 선택한 포맷/수량에 따라 렌더링 수가 늘어납니다
                  </p>
                )}

              </>
            )}

            {/* Part S: brand-scoped, not per-product — see
                ProductReferencePanel's own header comment for why this
                replaced Part O's ad-driven AdSelectionPanel entirely.
                Renders once per active brand here (sibling to the product
                picker above, same brand card), driven by whichever products
                are currently selected. Only renders once the brand actually
                has synced products — nothing to show otherwise. */}
            {productNames.length > 0 && <ProductReferencePanel brand={b} />}
          </div>
        )
      })}
    </>
  )
}
