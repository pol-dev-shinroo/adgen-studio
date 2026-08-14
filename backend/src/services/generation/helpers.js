import { config } from '../../config/index.js'

export function firstLink(newlineJoined) {
  return (newlineJoined || '').split('\n').find(Boolean) || ''
}

export function findBrandDef(brandKey) {
  return config.brands.find((b) => b.key === brandKey)
}

// Part M: 'Extracted Image URL' (single value) is replaced by 'Extracted
// References JSON' (an array of { type: 'product'|'model', imageUrl, ... }
// entries, since a photo can now yield more than one distinct product plus
// a human model). Malformed/missing JSON (older rows, or rows that were
// never extracted) safely yields [], same "not extracted yet" outcome
// prepareInputs already handled for the old single-field case.
//
// Part EE: generalized to take the type as a parameter, since 생성 AI's
// right-panel galleries need to filter by 'background'/'model'/'product' (or
// any other extracted type) just as much as the render pipeline has always
// needed to filter by 'product'.
export function referencesOfType(product, type) {
  let references
  try {
    references = JSON.parse(product['Extracted References JSON'] || '[]')
  } catch {
    return []
  }
  return Array.isArray(references) ? references.filter((r) => r?.type === type) : []
}

export function productTypeReferences(product) {
  return referencesOfType(product, 'product')
}

// Sane default when nothing more specific is picked: the first product-type
// entry.
export function firstProductReferenceImageUrl(product) {
  return productTypeReferences(product)[0]?.imageUrl || null
}

// Part S: extracts a Drive file ID from either URL form this app produces
// for the same file — a sheet-stored webViewLink ("/file/d/<id>/view") or
// the thumbnail-endpoint form the frontend actually sends ("?id=<id>...",
// from adaptProduct.js's toEmbeddableImageUrl) — so the two are comparable
// despite never matching as plain strings.
export function driveFileIdFrom(url) {
  if (typeof url !== 'string') return null
  const viewMatch = url.match(/\/file\/d\/([^/]+)/)
  if (viewMatch) return viewMatch[1]
  const idParamMatch = url.match(/[?&]id=([^&]+)/)
  return idParamMatch ? idParamMatch[1] : null
}

// Part S: resolves which of a product's own type:'product' entries to
// render with, honoring a client-supplied `productImageOverrides[productId]`
// URL only when it's independently verifiable against that product's own
// real 'Extracted References JSON' — matched by Drive file ID (see
// driveFileIdFrom above), never trusted as a raw string. No match (absent,
// malformed, or pointing at a file that isn't actually one of this
// product's own real product-type entries) falls back to the exact same
// firstProductReferenceImageUrl default as before this part — identical
// behavior for every existing call site that never sends an override.
export function resolveProductReferenceImageUrl(product, overrideImageUrl) {
  const overrideId = driveFileIdFrom(overrideImageUrl)
  if (overrideId) {
    const match = productTypeReferences(product).find((r) => driveFileIdFrom(r.imageUrl) === overrideId)
    if (match) return match.imageUrl
  }
  return firstProductReferenceImageUrl(product)
}

// Part DD: formats/quantity used to be one global setting shared across
// every selected reference ad (products.length * refAds.length *
// formats.length * quantity); now each reference ad carries its own
// formats/quantity (refAdConfigs: [{ adId, formats, quantity }]), so the
// total is products.length times the SUM of each ad's own formats.length *
// quantity, not a single shared multiplier. Pure — no reason this needs the
// real job/products/ads plumbing to verify, so it's split out and exported
// on its own.
export function computeTotalRenders(products, refAdConfigs) {
  return products.length * refAdConfigs.reduce((sum, cfg) => sum + cfg.formats.length * cfg.quantity, 0)
}

// Part P: converts Step 3's ad-selection panel's { price, promotion,
// adHooks } into the exact counter_facts shape findCounterFacts already
// produces ([{category, fact}]), so writeReplacementCopy needs zero
// changes — it already just JSON.stringifies whatever counter_facts array
// it's handed. Real, user-picked copy from the brand's own past ads is
// more reliable than a Pinecone semantic guess, so when present this
// replaces (not supplements) the Pinecone lookup for the run.
//
// Returns null — not []  — for "no usable override", covering both "no
// override object at all" and "an override object with every field empty"
// (a malformed/stale payload the frontend shouldn't send per its own
// contract, but this backend never trusts the frontend as the only gate —
// see prepareInputs's own comment on the same principle). null is the
// signal callers use to fall through to the existing Pinecone path
// unchanged; an override that resolves to zero facts is treated exactly
// the same as no override, not as "replace with nothing."
export function counterFactsFromAdCopyOverride(override) {
  if (!override || typeof override !== 'object') return null

  const facts = []
  if (typeof override.price === 'string' && override.price.trim()) {
    facts.push({ category: '가격', fact: override.price.trim() })
  }
  if (typeof override.promotion === 'string' && override.promotion.trim()) {
    facts.push({ category: '프로모션', fact: override.promotion.trim() })
  }
  for (const hook of Array.isArray(override.adHooks) ? override.adHooks : []) {
    if (typeof hook === 'string' && hook.trim()) {
      facts.push({ category: '광고 후킹 카피', fact: hook.trim() })
    }
  }

  return facts.length > 0 ? facts : null
}
