import { useState, useEffect } from 'react'
import { useProducts } from '../../../context/ProductsContext.jsx'
import Badge from '../../common/Badge.jsx'

// Editable Price/Promotion Info/Ad Hook Copy for the currently selected
// product in a StepMyBrand.jsx brand panel. Pulled into its own component
// (rather than inlined in StepMyBrand's activeBrands.map()) so its local
// edit-buffer state follows the Rules of Hooks correctly per selected
// product, instead of living inside a .map() callback.
//
// Saves through ProductsContext's updateProductFields, which only ever
// writes the *_Override columns (see product.mapper.js's OVERRIDE_COLUMNS)
// — never the synced Price/Promotion Info/Ad Hook Copy cells themselves, so
// a Cafe24 resync can never wipe out a manual correction here.
export default function StepProductFields({ brandKey, product }) {
  const { updateProductFields } = useProducts()
  const [values, setValues] = useState({ price: '', promotionInfo: '', adHookCopy: '' })
  const [saving, setSaving] = useState(false)

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

  const isDirty = values.price !== effective.price
    || values.promotionInfo !== effective.promotionInfo
    || values.adHookCopy !== effective.adHookCopy

  const handleSave = async () => {
    const fields = {}
    if (values.price !== effective.price) fields['Price Override'] = values.price
    if (values.promotionInfo !== effective.promotionInfo) fields['Promotion Info Override'] = values.promotionInfo
    if (values.adHookCopy !== effective.adHookCopy) fields['Ad Hook Copy Override'] = values.adHookCopy
    if (Object.keys(fields).length === 0) return

    setSaving(true)
    try {
      await updateProductFields(brandKey, product.productId, fields)
    } catch {
      // Toast already shown by ProductsContext — keep the user's edits in
      // the buffer rather than reverting them on failure.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="info-grid">
      <div className="field">
        <label>
          가격 <span className="auto">● 자사몰 API</span>
          {product.priceOverrideRaw && <Badge variant="edited">수정됨</Badge>}
        </label>
        <input
          type="number"
          value={values.price}
          onChange={(e) => setValues((v) => ({ ...v, price: e.target.value }))}
        />
      </div>
      <div className="field">
        <label>
          프로모션 <span className="auto">● 자사몰 API</span>
          {product.promotionInfoOverrideRaw && <Badge variant="edited">수정됨</Badge>}
        </label>
        <input
          type="text"
          value={values.promotionInfo}
          onChange={(e) => setValues((v) => ({ ...v, promotionInfo: e.target.value }))}
        />
      </div>
      <div className="field">
        <label>
          광고 후킹 카피 <span className="auto">● 자사몰 API</span>
          {product.adHookCopyOverrideRaw && <Badge variant="edited">수정됨</Badge>}
        </label>
        <input
          type="text"
          value={values.adHookCopy}
          onChange={(e) => setValues((v) => ({ ...v, adHookCopy: e.target.value }))}
        />
      </div>
      <button
        type="button"
        className="btn pri sm"
        style={{ alignSelf: 'end' }}
        disabled={!isDirty || saving}
        onClick={handleSave}
      >
        {saving ? '저장 중...' : '저장'}
      </button>
    </div>
  )
}
