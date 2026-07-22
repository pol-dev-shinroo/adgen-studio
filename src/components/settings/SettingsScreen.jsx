import '../../styles/settings.css'
import BrandSyncRow from './BrandSyncRow.jsx'
import ProductReviewPanel from './ProductReviewPanel.jsx'
import N8nIntegrationCard from './N8nIntegrationCard.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'

export default function SettingsScreen() {
  const { products } = useSettings()
  return (
    <section>
      <div className="head">
        <div>
          <h1>설정</h1>
          <p className="sub">브랜드 연동 · 제품 정보 검토 · n8n 연동</p>
        </div>
      </div>

      <div className="card set-sect">
        <div className="sect">
          브랜드 · 자사몰 연동{' '}
          <span className="hint" style={{ fontWeight: 500 }}>
            — API로 받아온 제품 정보를 여기서 검토·수정합니다. 수정값은 API 재동기화에도 유지됩니다.
          </span>
        </div>
        <BrandSyncRow name="헬시키키" desc="자사몰 API · 제품 24개 · 마지막 동기화 오늘 08:00" />
        {products.map((p) => <ProductReviewPanel key={p.id} product={p} />)}
      </div>

      <N8nIntegrationCard />
    </section>
  )
}
