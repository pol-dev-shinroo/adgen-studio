// Part EE: does a transcribed ad-copy text look like a hard fact (a price,
// promo, or discount value) rather than a pure headline/tagline? Drives
// 생성 AI's text-dialog option (a) label — "문구 구조는 유지하고 실제
// 값만 교체" when true, "원본 문구 그대로 유지" when false (see the spec's
// §5b). Deliberately simple: a real % / 원 / 할인 marker, or text that's
// mostly digits, reads as factual; ordinary hook/headline copy doesn't.
export function looksLikeFactualCopy(text) {
  if (typeof text !== 'string') return false
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/[%원]/.test(trimmed) || trimmed.includes('할인')) return true

  const stripped = trimmed.replace(/\s/g, '')
  const digitCount = (stripped.match(/[0-9]/g) || []).length
  return stripped.length > 0 && digitCount / stripped.length >= 0.5
}
