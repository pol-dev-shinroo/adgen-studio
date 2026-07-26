import '../../styles/settings.css'
// feed.css supplies the "ad-detail"/"dtl-*"/"lightbox-*" classes reused
// as-is by ProductDetailModal.jsx (same structure as AdDetailModal.jsx,
// same ImageLightbox component) — imported explicitly here rather than
// relying on FeedScreen.jsx happening to load first.
import '../../styles/feed.css'
import '../../styles/products.css'
import { useProducts } from '../../context/ProductsContext.jsx'
import BrandConnectionCard from './BrandConnectionCard.jsx'
import ProductBrowser from './ProductBrowser.jsx'

export default function ProductsScreen() {
  const { status } = useProducts()
  const { brands, productSyncConfigured } = status

  return (
    <section>
      <div className="head">
        <div>
          <h1>상품 관리</h1>
          <p className="sub">카페24 제품 연동 · Pinecone 벡터DB 관리 · 동기화된 제품 조회</p>
        </div>
      </div>

      {!productSyncConfigured ? (
        <div className="card set-sect">
          <div className="sect">제품 연동이 아직 설정되지 않았습니다</div>
          <p className="sub">
            Cafe24 · OpenAI · Pinecone 자격 증명이 backend/.env에 모두 설정되면 이 화면에서
            브랜드별 연동 상태를 확인하고 동기화할 수 있습니다. (자세한 내용은 README.md
            "Product sync" 섹션 참고)
          </p>
        </div>
      ) : (
        brands.map((b) => <BrandConnectionCard key={b.key} brandStatus={b} />)
      )}

      <ProductBrowser />
    </section>
  )
}
