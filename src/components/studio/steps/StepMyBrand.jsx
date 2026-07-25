import { useStudio } from '../../../context/StudioContext.jsx'
import { useProducts } from '../../../context/ProductsContext.jsx'
import SyncProgress from './SyncProgress.jsx'

function formatSyncedAt(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

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
        const syncedAtLabel = formatSyncedAt(b.lastSynced)

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
              <div className="info-grid">
                <div className="field">
                  <label>
                    제품 {productNames.length > 1 && <span className="multi">{productNames.length}개 옵션 — 1개 지정</span>}
                  </label>
                  <select value={sel.product} onChange={(e) => setProductName(b.name, e.target.value)}>
                    {productNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>가격 <span className="auto">● 자사몰 API</span></label>
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
            )}
          </div>
        )
      })}
    </>
  )
}
