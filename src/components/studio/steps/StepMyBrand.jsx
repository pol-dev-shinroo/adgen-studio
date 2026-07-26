import { useStudio } from '../../../context/StudioContext.jsx'
import { useProducts } from '../../../context/ProductsContext.jsx'
import { formatDateTime } from '../../../utils/date.js'
import Thumb from '../../common/Thumb.jsx'
import Badge from '../../common/Badge.jsx'
import SyncProgress from './SyncProgress.jsx'

// Falls back to a native <select> once a brand has enough products that a
// card grid would be more scrolling than picking — the picker itself is
// still a two-click affair either way, so this only matters for very large
// catalogs.
const CARD_PICKER_MAX = 8

export default function StepMyBrand() {
  const { myBrands, toggleMyBrand, selections, setProductName } = useStudio()
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
        <span className="hint">— 가격·프로모션·광고 카피는 동기화된 데이터를 그대로 사용합니다</span>
      </div>

      {activeBrands.length === 0 && <p className="sub">브랜드를 먼저 선택하세요.</p>}

      {activeBrands.map((b) => {
        const sel = selections[b.name]
        const productNames = Object.keys(b.products)
        const product = sel ? b.products[sel.product] : null
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
                {isSyncing ? '동기화 중...' : '제품 동기화'}
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
                    제품 {productNames.length > 1 && <span className="multi">{productNames.length}개 옵션 — 1개 지정</span>}
                  </label>
                  {productNames.length > CARD_PICKER_MAX ? (
                    <select value={sel.product} onChange={(e) => setProductName(b.name, e.target.value)}>
                      {productNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    // Same card language as ProductCard.jsx in 상품관리 (own
                    // markup, not the shared component — this dict shape is
                    // keyed by name for Step 3's selection model, not the
                    // full adapted-product shape ProductCard expects), plus
                    // a .selected ring for whichever one setProductName picked.
                    <div className="prod-grid">
                      {productNames.map((n) => {
                        const p = b.products[n]
                        return (
                          <div
                            key={n}
                            className={`prod-card${sel.product === n ? ' selected' : ''}`}
                            onClick={() => setProductName(b.name, n)}
                          >
                            <Thumb gradient="g5" image={p.imageUrl} fit="contain">
                              {p.extractedImage && <Badge variant="live">레퍼런스 준비됨</Badge>}
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

                {product && (
                  <div className="prod-refs">
                    <div className="prod-card static">
                      <Thumb gradient="g5" image={product.imageUrl} fit="contain" />
                      <div className="prod-card-body">
                        <div className="prod-card-name">원본 마케팅 사진</div>
                      </div>
                    </div>
                    <div className="prod-card static">
                      <Thumb gradient="g5" image={product.extractedImage} fit="contain">
                        {product.extractedImage && <Badge variant="live">레퍼런스 준비됨</Badge>}
                      </Thumb>
                      <div className="prod-card-body">
                        <div className="prod-card-name">우리 제품 참조 이미지</div>
                        {product.extractedImage ? (
                          <div className="prod-card-price">추출일: {formatDateTime(product.extractedAt)}</div>
                        ) : (
                          <p className="sub" style={{ margin: 0 }}>상품관리에서 제품 참조 이미지를 추출하세요</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="info-grid">
                  <div className="field">
                    <label>가격 <span className="auto">● 자사몰 API</span></label>
                    {/* Already formatKRW-formatted ("49,800원") — ProductsContext's
                        groupByBrand sources this from adaptProduct's priceFormatted,
                        not the raw Cafe24 price string. */}
                    <div className="readonly-value">{product?.price || '-'}</div>
                  </div>
                  <div className="field">
                    <label>프로모션 <span className="auto">● 자사몰 API</span></label>
                    <div className="readonly-value">{product?.promotionInfo || '없음'}</div>
                  </div>
                  <div className="field">
                    <label>광고 후킹 카피 <span className="auto">● 자사몰 API</span></label>
                    <div className="readonly-value">{product?.adHookCopy || '없음'}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        )
      })}
    </>
  )
}
