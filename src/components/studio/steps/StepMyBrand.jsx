import { useStudio } from '../../../context/StudioContext.jsx'
import { useProducts } from '../../../context/ProductsContext.jsx'
import { formatDateTime } from '../../../utils/date.js'
import Thumb from '../../common/Thumb.jsx'
import Badge from '../../common/Badge.jsx'
import Spinner from '../../common/Spinner.jsx'
import ScanningOverlay from '../../common/ScanningOverlay.jsx'
import SyncProgress from './SyncProgress.jsx'
import StepProductFields from './StepProductFields.jsx'

// Falls back to a native <select> once a brand has enough products that a
// card grid would be more scrolling than picking — the picker itself is
// still a two-click affair either way, so this only matters for very large
// catalogs.
const CARD_PICKER_MAX = 8

export default function StepMyBrand() {
  const { myBrands, toggleMyBrand, selections, toggleProductSelection } = useStudio()
  const { sync, activeJob, extractImage, extractingIds } = useProducts()
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
                  )}
                </div>

                {selectedProducts.length > 1 && (
                  <p className="sub" style={{ marginTop: -6, marginBottom: 14 }}>
                    {selectedProducts.length}개 제품 × 선택한 포맷/수량에 따라 렌더링 수가 늘어납니다
                  </p>
                )}

                {selectedProducts.map((n) => {
                  const product = b.products[n]
                  const isExtracting = extractingIds.has(product.productId)
                  const hasRefs = product.extractedReferences.length > 0
                  return (
                    <div key={n} className="prod-select-block">
                      <div className="prod-refs">
                        <div className="prod-card static">
                          <Thumb gradient="g5" image={product.imageUrl} fit="contain">
                            <ScanningOverlay active={isExtracting} />
                          </Thumb>
                          <div className="prod-card-body">
                            <div className="prod-card-name">원본 마케팅 사진</div>
                          </div>
                        </div>
                        {product.extractedReferences.map((ref, i) => (
                          <div key={i} className="prod-card static">
                            <Thumb gradient="g5" image={ref.imageUrl} fit="contain">
                              <Badge variant={ref.type === 'model' ? 'model' : 'live'}>
                                {ref.type === 'model' ? '모델' : (ref.label || '제품')}
                              </Badge>
                            </Thumb>
                            <div className="prod-card-body">
                              <div className="prod-card-name">{ref.type === 'model' ? '모델' : (ref.label || '제품')} 참조 이미지</div>
                              <span className="sub">추출일: {formatDateTime(ref.extractedAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="ref-meta">
                        {!hasRefs && <p className="sub" style={{ margin: 0 }}>아직 추출된 참조 이미지가 없습니다.</p>}
                        <button
                          className={hasRefs ? 'btn ghost sm' : 'btn pri sm'}
                          disabled={isExtracting}
                          onClick={() => extractImage(b.key, product.productId)}
                        >
                          {isExtracting ? '추출 중...' : hasRefs ? '다시 추출' : '참조 이미지 추출'}
                        </button>
                      </div>

                      <StepProductFields brandKey={b.key} product={product} />
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )
      })}
    </>
  )
}
