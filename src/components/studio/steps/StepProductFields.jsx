import { useState, useEffect } from 'react'
import { useProducts } from '../../../context/ProductsContext.jsx'
import Badge from '../../common/Badge.jsx'
import Spinner from '../../common/Spinner.jsx'

// Maps each edit-buffer key to the sheet column updateProductFields writes
// — see product.mapper.js's OVERRIDE_COLUMNS.
const FIELD_COLUMNS = {
  price: 'Price Override',
  promotionInfo: 'Promotion Info Override',
  adHookCopy: 'Ad Hook Copy Override',
}

// Editable Price/Promotion Info/Ad Hook Copy for the currently selected
// product in a StepMyBrand.jsx brand panel. Pulled into its own component
// (rather than inlined in StepMyBrand's activeBrands.map()) so its local
// edit-buffer state follows the Rules of Hooks correctly per selected
// product, instead of living inside a .map() callback.
//
// Auto-saves on blur, per field — no manual 저장 button (removed per
// instruction: the user didn't understand what it was for). Each field
// saves independently and only if its own value actually changed, so
// tabbing/clicking through unchanged fields never fires a network call and
// editing one field never re-saves the other two.
//
// Saves through ProductsContext's updateProductFields, which only ever
// writes the *_Override columns — never the synced Price/Promotion Info/Ad
// Hook Copy cells themselves, so a Cafe24 resync can never wipe out a
// manual correction here.
export default function StepProductFields({ brandKey, product }) {
  const { updateProductFields } = useProducts()
  const [values, setValues] = useState({ price: '', promotionInfo: '', adHookCopy: '' })
  // Which field keys currently have a save in flight — a Set (not one
  // shared boolean) since blurring two fields in quick succession should
  // show each one's own spinner independently, same convention as
  // ProductsContext's extractingIds.
  const [savingFields, setSavingFields] = useState(() => new Set())

  const effective = {
    price: product.priceOverrideRaw || product.priceRaw || '',
    promotionInfo: product.promotionInfo || '',
    adHookCopy: product.adHookCopy || '',
  }

  // Resets the edit buffer whenever the underlying product (or its saved
  // values) changes — switching the selected product, or a save landing.
  useEffect(() => {
    setValues(effective)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.productId, effective.price, effective.promotionInfo, effective.adHookCopy])

  const handleBlur = async (fieldKey) => {
    if (values[fieldKey] === effective[fieldKey]) return // unchanged — no network call

    setSavingFields((prev) => new Set(prev).add(fieldKey))
    try {
      await updateProductFields(brandKey, product.productId, { [FIELD_COLUMNS[fieldKey]]: values[fieldKey] })
    } catch {
      // Toast already shown by ProductsContext — keep the user's edit in
      // the buffer rather than reverting it on failure.
    } finally {
      setSavingFields((prev) => {
        const next = new Set(prev)
        next.delete(fieldKey)
        return next
      })
    }
  }

  return (
    <div className="info-grid">
      <div className="field">
        <label>
          가격 <span className="auto">● 자사몰 API</span>
          {product.priceOverrideRaw && <Badge variant="edited">수정됨</Badge>}
          {savingFields.has('price') && <Spinner size="sm" style={{ marginLeft: 5 }} />}
        </label>
        <input
          type="number"
          value={values.price}
          onChange={(e) => setValues((v) => ({ ...v, price: e.target.value }))}
          onBlur={() => handleBlur('price')}
        />
      </div>
      <div className="field">
        <label>
          프로모션 <span className="auto">● 자사몰 API</span>
          {product.promotionInfoOverrideRaw && <Badge variant="edited">수정됨</Badge>}
          {savingFields.has('promotionInfo') && <Spinner size="sm" style={{ marginLeft: 5 }} />}
        </label>
        <input
          type="text"
          value={values.promotionInfo}
          onChange={(e) => setValues((v) => ({ ...v, promotionInfo: e.target.value }))}
          onBlur={() => handleBlur('promotionInfo')}
        />
      </div>
      <div className="field">
        <label>
          광고 후킹 카피 <span className="auto">● 자사몰 API</span>
          {product.adHookCopyOverrideRaw && <Badge variant="edited">수정됨</Badge>}
          {savingFields.has('adHookCopy') && <Spinner size="sm" style={{ marginLeft: 5 }} />}
        </label>
        <input
          type="text"
          value={values.adHookCopy}
          onChange={(e) => setValues((v) => ({ ...v, adHookCopy: e.target.value }))}
          onBlur={() => handleBlur('adHookCopy')}
        />
      </div>
    </div>
  )
}
