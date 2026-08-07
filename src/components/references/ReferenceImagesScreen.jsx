import { useState } from 'react'
import '../../styles/products.css'
import '../../styles/references.css'
import { useProducts } from '../../context/ProductsContext.jsx'
import { formatDateTime } from '../../utils/date.js'
import Thumb from '../common/Thumb.jsx'
import Badge from '../common/Badge.jsx'
import PageLoader from '../common/PageLoader.jsx'
import ScanningOverlay from '../common/ScanningOverlay.jsx'
import ImageLightbox from '../common/ImageLightbox.jsx'

// Part W: since Part V, a single product can yield 5-9 reference cards
// (product, model, promo_badge, authority_badge, logo, headline_copy,
// subheadline_copy, promo_phrase) instead of the 1-2 this screen was
// designed around — grouping by category (with a small icon per group) so
// a glance groups similar things together instead of scanning one flat
// wall of same-sized white-background cutouts. Order is deliberate: the
// actual subject first, then graphic elements, then phrases, then
// anything genuinely unrecognized.
const CATEGORY_DEFS = [
  { key: 'product', icon: '📦', label: '제품', match: (ref) => ref.type === 'product' },
  { key: 'model', icon: '🙎', label: '모델', match: (ref) => ref.type === 'model' },
  { key: 'badge', icon: '🏷️', label: '배지 / 로고', match: (ref) => ['promo_badge', 'authority_badge', 'logo'].includes(ref.type) },
  // Part V entities carry an additive `text` field only when they're
  // inherently a phrase (headline/subheadline/promo) — reused here as the
  // classifier rather than hardcoding the type-string list a second time.
  { key: 'phrase', icon: '💬', label: '문구', match: (ref) => !!ref.text },
]

function categorize(refs) {
  const buckets = CATEGORY_DEFS.map((def) => ({ ...def, items: [] }))
  const other = { key: 'other', icon: '✦', label: '기타', items: [] }
  for (const ref of refs) {
    const bucket = buckets.find((b) => b.match(ref)) || other
    bucket.items.push(ref)
  }
  return [...buckets, other].filter((b) => b.items.length > 0)
}

// One place to see every product's extraction status across every brand, so
// nobody re-triggers a gpt-5.5 extraction that's already done just because
// they couldn't see it from wherever they were (상품관리's detail modal,
// Studio Step 3). Read-mostly — reuses the exact same extractImage/
// extractingIds action Step 3 and 상품관리 already call, and the exact same
// 원본/추출 .prod-refs card pair StepMyBrand.jsx renders for its currently
// selected product, just looped over every product instead of one.
export default function ReferenceImagesScreen() {
  const { brands, extractImage, extractingIds, productsLoading } = useProducts()
  const totalProducts = brands.reduce((sum, b) => sum + Object.keys(b.products).length, 0)
  // One lightbox at a time across the whole screen — reuses the same
  // ImageLightbox/RetryImage combo AdDetailModal.jsx/ProductDetailModal.jsx
  // already use, just without useGalleryLightbox's two-stage-close wiring
  // since there's no enclosing detail Modal here to close first.
  const [lightbox, setLightbox] = useState(null) // { images: string[], index: number } | null

  return (
    <section>
      <div className="head">
        <div>
          <h1>추출 참조 이미지</h1>
          <p className="sub">브랜드별 제품의 원본 사진과 추출된 참조 이미지 현황을 한눈에 확인하세요.</p>
        </div>
      </div>

      {productsLoading && totalProducts === 0 ? <PageLoader /> : brands.map((b) => {
        const productNames = Object.keys(b.products)
        return (
          <div key={b.key} className="card set-sect">
            <div className="sect">
              <span className="dot" style={{ background: b.color }}>{b.name[0]}</span>{' '}
              {b.name} <span className="hint">— 제품 {productNames.length}개</span>
            </div>

            {productNames.length === 0 ? (
              <p className="sub">동기화된 제품이 없습니다.</p>
            ) : (
              <div className="ref-screen-grid">
                {productNames.map((n) => {
                  const p = b.products[n]
                  const isExtracting = extractingIds.has(p.productId)
                  const hasRefs = p.extractedReferences.length > 0
                  // Same array every thumb opens into, so ← → inside the
                  // lightbox can move between all of them — index depends on
                  // whichever is actually present (a product can have an
                  // original photo with no extraction yet, or — pre-Part-V —
                  // a text-only entry with no imageUrl at all).
                  const refImages = [p.imageUrl, ...p.extractedReferences.map((r) => r.imageUrl)].filter(Boolean)
                  const openLightbox = (image) => {
                    if (!image) return // nothing to show yet — skip gracefully
                    setLightbox({ images: refImages, index: refImages.indexOf(image) })
                  }
                  const categories = categorize(p.extractedReferences)
                  return (
                    <div key={n} className="ref-screen-item">
                      <div className="ref-screen-item-name">{n}</div>

                      <div className="prod-refs">
                        <div className="prod-card static compact">
                          <Thumb gradient="g5" image={p.imageUrl} fit="contain" onClick={() => openLightbox(p.imageUrl)}>
                            <ScanningOverlay active={isExtracting} />
                          </Thumb>
                          <div className="prod-card-body">
                            <div className="prod-card-name">원본 마케팅 사진</div>
                          </div>
                        </div>
                      </div>

                      {categories.map((cat) => (
                        <div key={cat.key} className="ref-cat">
                          <div className="ref-cat-label">
                            <span aria-hidden="true">{cat.icon}</span> {cat.label} <span className="count">{cat.items.length}</span>
                          </div>
                          <div className="prod-refs">
                            {cat.items.map((ref, i) => {
                              const label = ref.type === 'model' ? '모델' : (ref.label || '제품')
                              // Part U-1's convention, applied here for the
                              // first time: every real (image-bearing) entry
                              // is 'live' green regardless of specific type —
                              // only a genuinely text-only legacy entry (a
                              // pre-Part-V row that was never re-extracted)
                              // gets 'arch' gray, matching
                              // ProductReferenceGallery.jsx's own selectable-
                              // vs-informational split.
                              return ref.imageUrl ? (
                                <div key={i} className="prod-card static compact">
                                  <Thumb gradient="g5" image={ref.imageUrl} fit="contain" onClick={() => openLightbox(ref.imageUrl)}>
                                    <Badge variant="live">{cat.icon} {label}</Badge>
                                  </Thumb>
                                  <div className="prod-card-body">
                                    <div className="prod-card-name">{label} 참조 이미지</div>
                                    <span className="sub">추출일: {formatDateTime(ref.extractedAt)}</span>
                                  </div>
                                </div>
                              ) : (
                                <div key={i} className="prod-card static compact ref-text-card">
                                  <Badge variant="arch">{cat.icon} {label}</Badge>
                                  <div className="ref-text-card-body">{ref.text}</div>
                                  <span className="sub">추출일: {formatDateTime(ref.extractedAt)}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}

                      <div className="ref-meta">
                        {!hasRefs && <p className="sub" style={{ margin: 0 }}>아직 추출된 참조 이미지가 없습니다.</p>}
                        <button
                          className={hasRefs ? 'btn ghost sm' : 'btn pri sm'}
                          disabled={isExtracting}
                          onClick={() => extractImage(b.key, p.productId)}
                        >
                          {isExtracting ? '추출 중...' : hasRefs ? '다시 추출' : '참조 이미지 추출'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox((prev) => ({ ...prev, index }))}
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  )
}
