// A single dropdown field inside the product-config panel (price / promo / key message).
// Shows a "N개 옵션" hint when there's more than one option to pick from, or "자동" otherwise.
export default function ProductField({ label, options, selectedIdx, onChange }) {
  return (
    <div className="field">
      <label>
        {label}{' '}
        {options.length > 1 ? (
          <span className="multi">{options.length}개 옵션 — 1개 지정</span>
        ) : (
          <span className="auto">자동</span>
        )}
      </label>
      <select value={selectedIdx} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((opt, i) => (
          <option key={i} value={i}>{opt}</option>
        ))}
      </select>
    </div>
  )
}
