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
                  // original photo with no extraction yet).
                  const refImages = [p.imageUrl, ...p.extractedReferences.map((r) => r.imageUrl)].filter(Boolean)
                  const openLightbox = (image) => {
                    if (!image) return // nothing to show yet — skip gracefully
                    setLightbox({ images: refImages, index: refImages.indexOf(image) })
                  }
                  return (
                    <div key={n} className="ref-screen-item">
                      <div className="ref-screen-item-name">{n}</div>
                      <div className="prod-refs">
                        <div className="prod-card static">
                          <Thumb gradient="g5" image={p.imageUrl} fit="contain" onClick={() => openLightbox(p.imageUrl)}>
                            <ScanningOverlay active={isExtracting} />
                          </Thumb>
                          <div className="prod-card-body">
                            <div className="prod-card-name">원본 마케팅 사진</div>
                          </div>
                        </div>
                        {p.extractedReferences.map((ref, i) => (
                          <div key={i} className="prod-card static">
                            <Thumb gradient="g5" image={ref.imageUrl} fit="contain" onClick={() => openLightbox(ref.imageUrl)}>
                              <Badge variant={ref.type === 'model' ? 'model' : 'live'}>
                                {ref.type === 'model' ? '모델' : (ref.label || '제품')}
                              </Badge>
                            </Thumb>
                            <div className="prod-card-body">
                              <div className="prod-card-name">{ref.type === 'model' ? '모델' : (ref.label || '제품')} 참조 이미지</div>
                              <span className="sub">추출일: {formatDateTime(ref.extractedAt)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
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
