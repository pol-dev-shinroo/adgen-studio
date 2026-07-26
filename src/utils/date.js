// Shared Korean-locale datetime formatter, replacing 4 near-identical copies
// that were scattered across StepMyBrand.jsx/BrandConnectionCard.jsx/
// AdDetailModal.jsx/ProductDetailModal.jsx. dateStyle/timeStyle default to
// undefined — i.e. plain toLocaleString('ko-KR') with no style object at
// all, matching the two detail-modal call sites exactly; StepMyBrand/
// BrandConnectionCard pass 'medium'/'short' explicitly for their more
// compact display. A non-empty-but-unparseable iso string is returned
// as-is rather than the fallback, matching every prior copy's behavior;
// only a missing/empty iso uses fallback.
export function formatDateTime(iso, { fallback = '—', dateStyle, timeStyle } = {}) {
  if (!iso) return fallback
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return dateStyle || timeStyle
    ? d.toLocaleString('ko-KR', { dateStyle, timeStyle })
    : d.toLocaleString('ko-KR')
}
