// Part EE: frontend equivalent of the backend's helpers.js
// referencesOfType(product, type) — 생성 AI's right-panel galleries
// (background/model/copy-style) all need to filter a product's
// extractedReferences by an arbitrary type, the same way the backend's
// render pipeline already does.
export function referencesOfType(product, type) {
  return (product?.extractedReferences || []).filter((r) => r.type === type)
}
