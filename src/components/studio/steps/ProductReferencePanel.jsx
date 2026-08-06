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
        <div className="refrow" style={{ marginBottom: sel.galleryItems.length > 0 ? 16 : 0 }}>
          {unextracted.map(({ name, product }) => {
            const isExtracting = extractingIds.has(product.productId)
            return (
              <div key={name} className="refpick" style={{ cursor: 'default' }}>
                <Thumb gradient="g5" image={product.imageUrl} fit="contain">
                  <ScanningOverlay active={isExtracting} />
                </Thumb>
                <div className="refpick-body">
                  <div className="refpick-copy">{name}</div>
                  <button
                    type="button"
                    className="btn pri sm"
                    style={{ width: '100%' }}
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
            <label>가격</label>
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
            <label>프로모션</label>
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
            <label>광고 후킹 카피 <span className="hint">— 여러 개 선택 가능</span></label>
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
