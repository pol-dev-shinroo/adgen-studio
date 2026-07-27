import '../../styles/products.css'
import '../../styles/references.css'
import { useProducts } from '../../context/ProductsContext.jsx'
import { formatDateTime } from '../../utils/date.js'
import Thumb from '../common/Thumb.jsx'
import Badge from '../common/Badge.jsx'
import PageLoader from '../common/PageLoader.jsx'
import Spinner from '../common/Spinner.jsx'

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
                  return (
                    <div key={n} className="ref-screen-item">
                      <div className="ref-screen-item-name">{n}</div>
                      <div className="prod-refs">
                        <div className="prod-card static">
                          <Thumb gradient="g5" image={p.imageUrl} fit="contain" />
                          <div className="prod-card-body">
                            <div className="prod-card-name">원본 마케팅 사진</div>
                          </div>
                        </div>
                        <div className="prod-card static">
                          <Thumb gradient="g5" image={p.extractedImage} fit="contain">
                            {p.extractedImage && <Badge variant="live">레퍼런스 준비됨</Badge>}
                          </Thumb>
                          <div className="prod-card-body">
                            <div className="prod-card-name">우리 제품 참조 이미지</div>
                            {p.extractedImage ? (
                              <div className="ref-meta">
                                <span className="sub">추출일: {formatDateTime(p.extractedAt)}</span>
                                <button
                                  className="btn ghost sm"
                                  disabled={isExtracting}
                                  onClick={() => extractImage(b.key, p.productId)}
                                >
                                  {isExtracting && <Spinner size="sm" />} {isExtracting ? '추출 중...' : '다시 추출'}
                                </button>
                              </div>
                            ) : (
                              <div className="ref-empty">
                                <p className="sub" style={{ margin: 0 }}>아직 추출된 참조 이미지가 없습니다.</p>
                                <button
                                  className="btn pri sm"
                                  disabled={isExtracting}
                                  onClick={() => extractImage(b.key, p.productId)}
                                >
                                  {isExtracting && <Spinner size="sm" />} {isExtracting ? '추출 중...' : '참조 이미지 추출'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
