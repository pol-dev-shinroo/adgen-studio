import { useProducts } from '../../../context/ProductsContext.jsx'
import { useStudio } from '../../../context/StudioContext.jsx'
import Thumb from '../../common/Thumb.jsx'
import Chip from '../../common/Chip.jsx'
import ScanningOverlay from '../../common/ScanningOverlay.jsx'
import ProductReferenceGallery from './ProductReferenceGallery.jsx'

const EMPTY_SELECTION = {
  galleryItems: [], selectedImageKeys: [],
  availablePrices: [], availablePromotions: [], availableAdHooks: [],
  selectedPrice: null, selectedPromotion: null, selectedAdHooks: [],
}

// Part U-1: small provenance/context tag next to a field label, same
// convention the original mockup's own sel() helper used throughout —
// .auto ("자동", green) when there's only one real option so nothing to
// decide, .multi ("N개 옵션", amber) when there's a real choice to make.
// multiSelect skips the "자동" case for 광고 후킹 카피's chip picker: it's
// multi-select by design, so a single option isn't "auto-applied" the way
// a single-option dropdown's is — there's just nothing worth flagging.
function ProvenanceTag({ count, multiSelect = false }) {
  if (count > 1) return <span className="multi">{count}개 옵션</span>
  if (count === 1 && !multiSelect) return <span className="auto">자동</span>
  return null
}

// Part S: replaces Part O's ad-driven AdSelectionPanel entirely — real user
// testing found that panel confusingly treated our OWN brand as if it were
// a competitor (it filtered the scraped 경쟁사 광고 피드 ads collection by
// brand name, and showed an empty state telling the user to go "collect"
// their own brand's ads there). Reference-image selection and the
// 가격/프로모션/후킹 selects are driven by our own PRODUCTS instead — already
// synced via Cafe24, already extracted via Part M — so this renders once
// per active brand (same slot AdSelectionPanel used), reading the brand's
// currently `selections`-selected products directly rather than any
// separate ad data source.
export default function ProductReferencePanel({ brand }) {
  const { extractImage, extractingIds } = useProducts()
  const {
    selections, productRefSelections, toggleImageKeySelected, toggleAllImageKeysSelected,
    selectProductRefPrice, selectProductRefPromotion, toggleProductRefHookSelection,
  } = useStudio()

  const sel = productRefSelections[brand.name] || EMPTY_SELECTION
  const selectedProductNames = (selections[brand.name]?.products || []).filter((n) => brand.products[n])
  const unextracted = selectedProductNames
    .map((name) => ({ name, product: brand.products[name] }))
    .filter(({ product }) => product.extractedReferences.length === 0)

  return (
    <div className="ad-sel-panel">
      <div className="sect">
        {brand.name} — 제품 참조 이미지 및 카피 <span className="hint">— 선택한 제품의 참조 이미지를 고르고, 가격·프로모션·후킹 카피를 지정합니다</span>
      </div>

      {unextracted.length > 0 && (
        <>
          {/* Part U-1: paired with the gallery's own .sub-sect below it, so
              both halves of this panel read as siblings under the one
              .sect header above, instead of one having a header and the
              other not. */}
          <div className="sub-sect">
            참조 이미지 미추출 <span className="hint">— 추출 후 아래 갤러리에서 선택할 수 있습니다</span>
          </div>
          {/* Part U-1: .prod-grid/.prod-card.static (already established by
              ReferenceImagesScreen.jsx for this exact "photo + CTA, the
              card itself isn't clickable" case) instead of .refrow/.refpick
              — that pair is styled for a whole-card click-to-select
              interaction (hover ring, .on state) this block never actually
              has; only the button inside is interactive. */}
          <div className="prod-grid" style={{ marginBottom: sel.galleryItems.length > 0 ? 16 : 0 }}>
            {unextracted.map(({ name, product }) => {
              const isExtracting = extractingIds.has(product.productId)
              return (
                <div key={name} className="prod-card static">
                  <Thumb gradient="g5" image={product.imageUrl} fit="contain">
                    <ScanningOverlay active={isExtracting} />
                  </Thumb>
                  <div className="prod-card-body">
                    <div className="prod-card-name">
                      <span className="dot" style={{ background: brand.color }}>{brand.name[0]}</span>
                      {name}
                    </div>
                    <button
                      type="button"
                      className="btn pri sm"
                      style={{ width: '100%', marginTop: 4 }}
                      disabled={isExtracting}
                      onClick={() => extractImage(brand.key, product.productId)}
                    >
                      {isExtracting ? '추출 중...' : '참조 이미지 추출'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {sel.galleryItems.length > 0 && (
        <ProductReferenceGallery
          items={sel.galleryItems}
          selectedKeys={sel.selectedImageKeys}
          onToggle={(key) => toggleImageKeySelected(brand.name, key)}
          // Part T: scoped to visual (imageUrl-bearing) entries only — a
          // text entry has no checkbox in the gallery at all, so 전체 선택
          // must never mark one "selected" behind the scenes either. Left
          // unscoped, a checked text entry could later be matched by
          // StudioContext.jsx's goNext() style-reference lookup (which
          // only checks `type !== 'product'`, not kind) ahead of a real
          // visual entry, silently swallowing the intended selection.
          onToggleAll={() => toggleAllImageKeysSelected(
            brand.name,
            sel.galleryItems.filter((item) => item.ref.imageUrl).map((item) => item.key)
          )}
        />
      )}

      {selectedProductNames.length > 0 && (
        <div className="ad-sel-copy">
          <div className="field">
            <label>가격 <ProvenanceTag count={sel.availablePrices.length} /></label>
            {sel.availablePrices.length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>선택한 제품 중 가격 정보가 있는 제품이 없습니다.</p>
            ) : (
              <select
                value={sel.selectedPrice || ''}
                onChange={(e) => selectProductRefPrice(brand.name, e.target.value || null)}
              >
                <option value="">선택 안 함</option>
                {sel.availablePrices.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>

          <div className="field">
            <label>프로모션 <ProvenanceTag count={sel.availablePromotions.length} /></label>
            {sel.availablePromotions.length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>선택한 제품 중 프로모션 정보가 있는 제품이 없습니다.</p>
            ) : (
              <select
                value={sel.selectedPromotion || ''}
                onChange={(e) => selectProductRefPromotion(brand.name, e.target.value || null)}
              >
                <option value="">선택 안 함</option>
                {sel.availablePromotions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>

          <div className="field">
            <label>
              광고 후킹 카피 <ProvenanceTag count={sel.availableAdHooks.length} multiSelect />{' '}
              <span className="hint">— 여러 개 선택 가능</span>
            </label>
            {sel.availableAdHooks.length === 0 ? (
              <p className="sub" style={{ margin: 0 }}>선택한 제품 중 후킹 카피가 있는 제품이 없습니다.</p>
            ) : (
              <div className="optrow" style={{ marginBottom: 0 }}>
                {sel.availableAdHooks.map((hook) => (
                  <Chip
                    key={hook}
                    active={sel.selectedAdHooks.includes(hook)}
                    onClick={() => toggleProductRefHookSelection(brand.name, hook)}
                  >
                    {hook}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
