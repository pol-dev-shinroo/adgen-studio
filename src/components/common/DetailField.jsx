// Shared by AdDetailModal.jsx and ProductDetailModal.jsx: a single labeled
// field in a detail view, optionally a link (href) or visually emphasized.
export default function DetailField({ label, value, href, emphasized }) {
  if (!value) return null
  return (
    <div className={`dtl-field${emphasized ? ' emphasized' : ''}`}>
      <div className="dtl-label">{label}</div>
      {href ? (
        <a className="dtl-value link" href={href} target="_blank" rel="noopener noreferrer">{value}</a>
      ) : (
        <div className="dtl-value">{value}</div>
      )}
    </div>
  )
}
