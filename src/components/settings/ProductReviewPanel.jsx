import { useSettings } from '../../context/SettingsContext.jsx'
import ProductReviewField from './ProductReviewField.jsx'

const STATUS_BADGE = {
  ok: { cls: 'rev-ok', label: '✔ 검토 완료' },
  changed: { cls: 'rev-chg', label: '⚠ 변경 감지 — 재검토 필요' },
  pending: { cls: 'rev-no', label: '미검토' },
}

export default function ProductReviewPanel({ product }) {
  const { openId, toggleOpen, editField, markReviewed } = useSettings()
  const open = openId === product.id
  const badge = STATUS_BADGE[product.status]

  return (
    <div className={`prod-review ${open ? 'open' : ''}`}>
      <div className="pr-head" onClick={() => toggleOpen(product.id)}>
        <span className="t">{product.name}</span>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
      </div>
      <div className="pr-body">
        {product.fields.map((field, i) => (
          <ProductReviewField
            key={field.label}
            field={field}
            onEdit={(newValue) => editField(product.id, i, newValue)}
          />
        ))}
        {product.status !== 'ok' && (
          <div style={{ paddingTop: 10 }}>
            <button className="btn pri sm" onClick={() => markReviewed(product.id)}>✔ 검토 완료 처리</button>
          </div>
        )}
      </div>
    </div>
  )
}
