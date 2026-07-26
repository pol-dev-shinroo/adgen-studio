// Shared by ad.mapper.js and product.mapper.js: both actor/API responses
// have shipped multiple field-name variants over time (camelCase vs.
// snake_case, or just renamed fields), so every lookup tries known aliases
// in order.
export function pick(obj, keys) {
  if (obj == null) return undefined
  for (const key of keys) {
    const value = obj[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}
