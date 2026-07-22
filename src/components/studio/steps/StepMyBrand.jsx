import { useStudio } from '../../../context/StudioContext.jsx'
import ProductField from './ProductField.jsx'

export default function StepMyBrand() {
  const { myBrands, toggleMyBrand, selections, setProductName, setProductField } = useStudio()
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
        <span className="hint">— 복수 옵션이 있는 항목은 1개만 선택해 생성에 사용됩니다</span>
      </div>

      {activeBrands.length === 0 && <p className="sub">브랜드를 먼저 선택하세요.</p>}

      {activeBrands.map((b) => {
        const sel = selections[b.name]
        if (!sel) return null
        const productNames = Object.keys(b.products)
        const product = b.products[sel.product]
        return (
          <div key={b.name} className="prodcfg">
            <div className="bt"><span className="dot" style={{ background: b.color }}>{b.name[0]}</span>{b.name}</div>
            <div className="info-grid">
              <div className="field">
                <label>
                  제품 {productNames.length > 1 && <span className="multi">{productNames.length}개 옵션 — 1개 지정</span>}
                </label>
                <select value={sel.product} onChange={(e) => setProductName(b.name, e.target.value)}>
                  {productNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <ProductField label="가격" options={product.prices} selectedIdx={sel.priceIdx} onChange={(idx) => setProductField(b.name, 'priceIdx', idx)} />
              <ProductField label="프로모션" options={product.promos} selectedIdx={sel.promoIdx} onChange={(idx) => setProductField(b.name, 'promoIdx', idx)} />
              <ProductField label="Key Message" options={product.messages} selectedIdx={sel.msgIdx} onChange={(idx) => setProductField(b.name, 'msgIdx', idx)} />
            </div>
          </div>
        )
      })}
    </>
  )
}
