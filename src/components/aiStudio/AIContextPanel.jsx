import { useAIStudio } from '../../context/AIStudioContext.jsx'
import { referencesOfType } from '../../utils/productReferences.js'
import Thumb from '../common/Thumb.jsx'
import Chip from '../common/Chip.jsx'
import { FORMATS, QUANTITIES } from '../../data/generationOptions.js'

const COPY_STYLE_TYPES = ['headline_copy', 'subheadline_copy', 'promo_phrase']

// One reference-image gallery, reused across the background/model/copy-
// style/product dialogs — clicking a thumbnail is equivalent to picking
// chat option (b) with that specific image (§6: "another input surface for
// the same decision").
function ReferenceGallery({ items, emptyText }) {
  const { chooseReplace } = useAIStudio()
  if (items.length === 0) return <p className="sub">{emptyText}</p>
  return (
    <div className="ai-ref-grid">
      {items.map((ref, i) => (
        <button
          key={`${ref.imageUrl}-${i}`}
          type="button"
          className="ai-ref-card"
          onClick={() => chooseReplace(ref.imageUrl, ref.label)}
        >
          <Thumb gradient="g5" image={ref.imageUrl} fit="contain" />
          <span>{ref.label}</span>
        </button>
      ))}
    </div>
  )
}

function BrandProductPicker() {
  const { myBrands, selectedBrandKey, selectedProductId, selectBrandProduct } = useAIStudio()

  return (
    <div className="ai-panel-section">
      <div className="sub-sect">브랜드</div>
      <div className="optrow">
        {myBrands.map((b) => (
          <Chip
            key={b.key}
            active={b.key === selectedBrandKey}
            onClick={() => {
              const firstProduct = Object.values(b.products)[0]
              if (firstProduct) selectBrandProduct(b.key, firstProduct.productId)
            }}
          >
            {b.name}
          </Chip>
        ))}
      </div>

      {selectedBrandKey && (() => {
        const brand = myBrands.find((b) => b.key === selectedBrandKey)
        const productNames = brand ? Object.keys(brand.products) : []
        if (productNames.length === 0) return <p className="sub">동기화된 제품이 없습니다.</p>
        return (
          <>
            <div className="sub-sect">제품</div>
            <div className="ai-ref-grid">
              {productNames.map((name) => {
                const p = brand.products[name]
                return (
                  <button
                    key={name}
                    type="button"
                    className={`ai-ref-card${p.productId === selectedProductId ? ' selected' : ''}`}
                    onClick={() => selectBrandProduct(brand.key, p.productId)}
                  >
                    <Thumb gradient="g5" image={p.imageUrl} fit="contain" />
                    <span>{name}</span>
                  </button>
                )
              })}
            </div>
          </>
        )
      })()}
    </div>
  )
}

function TextDialogPanel() {
  const { productRefSelection, chooseKeep } = useAIStudio()
  const { availablePrices, availablePromotions, availableAdHooks } = productRefSelection
  const copyStyleRefs = COPY_STYLE_TYPES.flatMap((t) => (
    productRefSelection.galleryItems.filter((item) => item.ref.type === t).map((item) => item.ref)
  ))

  return (
    <div className="ai-panel-section">
      <div className="sub-sect">실제 값 (가격/프로모션/후킹)</div>
      {availablePrices.length === 0 && availablePromotions.length === 0 && availableAdHooks.length === 0 ? (
        <p className="sub">선택한 제품에 등록된 가격/프로모션/후킹 카피가 없습니다.</p>
      ) : (
        <div className="optrow">
          {availablePrices.map((v) => <Chip key={`p-${v}`} active={false} onClick={() => chooseKeep(v, v)}>{v}</Chip>)}
          {availablePromotions.map((v) => <Chip key={`m-${v}`} active={false} onClick={() => chooseKeep(v, v)}>{v}</Chip>)}
          {availableAdHooks.map((v) => <Chip key={`h-${v}`} active={false} onClick={() => chooseKeep(v, v)}>{v}</Chip>)}
        </div>
      )}

      <div className="sub-sect">우리 브랜드 문구 스타일</div>
      <ReferenceGallery items={copyStyleRefs} emptyText="추출된 문구 스타일 참조 이미지가 없습니다." />
    </div>
  )
}

// §6: a running summary card of every resolved decision so far — genuinely
// useful throughout the conversation, not just at review time, so it's
// shown as a persistent collapsed strip beneath whichever phase-specific
// content is active from dialog:background onward.
function DecisionsSummary() {
  const { decisions, segments } = useAIStudio()
  const rows = []
  if (decisions.background) rows.push({ label: '배경', decision: decisions.background })
  segments.filter((s) => s.type === 'text').forEach((s) => {
    const d = decisions.texts[s.id]
    if (d) rows.push({ label: s.label, decision: d })
  })
  if (decisions.model) rows.push({ label: '모델', decision: decisions.model })
  if (decisions.product) rows.push({ label: '제품', decision: decisions.product })

  if (rows.length === 0) return null

  return (
    <div className="ai-decisions-summary">
      <div className="sub-sect">지금까지의 결정</div>
      {rows.map((row, i) => (
        <div key={i} className="ai-decisions-row">
          <span className="ai-decisions-label">{row.label}</span>
          <span className="ai-decisions-value">
            {row.decision.mode === 'keep' && (row.decision.value || '유지')}
            {row.decision.mode === 'replace' && `교체: ${row.decision.value}`}
            {row.decision.mode === 'custom' && `직접 입력: ${row.decision.value}`}
          </span>
        </div>
      ))}
    </div>
  )
}

function ReviewPanel() {
  const { formats, toggleFormat, quantity, setQuantity, startGenerate, renderError, phase, lastResult, goToGallery } = useAIStudio()

  if (phase === 'done') {
    return (
      <div className="ai-panel-section">
        <p>생성이 완료됐습니다.</p>
        {lastResult?.generationId && <p className="sub">Generation ID: {lastResult.generationId}</p>}
        <button type="button" className="btn pri" onClick={goToGallery}>결과 갤러리로 이동</button>
      </div>
    )
  }

  return (
    <div className="ai-panel-section">
      <div className="sub-sect">포맷</div>
      <div className="optrow">
        {FORMATS.map((f) => <Chip key={f} active={formats.includes(f)} onClick={() => toggleFormat(f)}>{f}</Chip>)}
      </div>
      <div className="sub-sect">생성 수량 (포맷당)</div>
      <div className="optrow">
        {QUANTITIES.map((q) => <Chip key={q} active={quantity === q} onClick={() => setQuantity(q)}>{q}</Chip>)}
      </div>
      {renderError && <p className="sub" style={{ color: 'var(--red)' }}>생성 실패: {renderError}</p>}
      <button type="button" className="btn pri" disabled={phase === 'generating'} onClick={startGenerate}>
        {phase === 'generating' ? '생성 중...' : '생성 시작'}
      </button>
    </div>
  )
}

export default function AIContextPanel() {
  const { phase, selectedBrand, selectedProductName } = useAIStudio()
  const selectedProduct = selectedBrand && selectedProductName ? selectedBrand.products[selectedProductName] : null

  let body = null
  if (phase === 'select-product') {
    body = <BrandProductPicker />
  } else if (phase === 'dialog:background') {
    body = (
      <div className="ai-panel-section">
        <div className="sub-sect">우리 배경 참조 이미지</div>
        <ReferenceGallery items={referencesOfType(selectedProduct, 'background')} emptyText="추출된 배경 참조 이미지가 없습니다." />
      </div>
    )
  } else if (phase.startsWith('dialog:text:')) {
    body = <TextDialogPanel />
  } else if (phase === 'dialog:model') {
    body = (
      <div className="ai-panel-section">
        <div className="sub-sect">우리 모델 참조 이미지</div>
        <ReferenceGallery items={referencesOfType(selectedProduct, 'model')} emptyText="추출된 모델 참조 이미지가 없습니다." />
      </div>
    )
  } else if (phase === 'dialog:product') {
    const productRefs = referencesOfType(selectedProduct, 'product')
    body = (
      <div className="ai-panel-section">
        <div className="sub-sect">제품 참조 이미지</div>
        {productRefs.length <= 1 ? (
          productRefs.length === 1
            ? <p className="sub">참조 이미지가 자동으로 사용됩니다.</p>
            : <p className="sub">추출된 제품 참조 이미지가 없습니다 — 상품관리에서 먼저 추출하세요.</p>
        ) : (
          <ReferenceGallery items={productRefs} emptyText="추출된 제품 참조 이미지가 없습니다." />
        )}
      </div>
    )
  } else if (phase === 'review' || phase === 'generating' || phase === 'done') {
    body = <ReviewPanel />
  }

  const showSummary = phase.startsWith('dialog:') || phase === 'review' || phase === 'generating' || phase === 'done'

  return (
    <div className="ai-context-panel">
      {body}
      {showSummary && <DecisionsSummary />}
    </div>
  )
}
