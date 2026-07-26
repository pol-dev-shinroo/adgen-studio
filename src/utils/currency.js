// Formats a raw Cafe24 price value (e.g. "49800.00", a plain string with no
// thousand separators or currency mark) into a Korean-won display string
// ("49,800원"). Cafe24 always returns whole-won prices with a trailing
// ".00", so rounding safely drops that without losing precision.
export function formatKRW(value) {
  if (value === null || value === undefined || value === '') return '-'
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  return `${Math.round(n).toLocaleString('ko-KR')}원`
}
