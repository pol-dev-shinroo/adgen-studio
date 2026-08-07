import '../../styles/products.css'
import { useProducts } from '../../context/ProductsContext.jsx'

// Part W: replaces N8nIntegrationCard.jsx entirely. n8n isn't a live
// dependency of this app anymore — its two workflows' logic was ported
// into copywriting.service.js/renderImage.service.js early this session —
// so the old card's hardcoded webhook URL and "● 정상" status were
// fabricated strings from the original pre-build mockup, never connected
// to any real check. A settings page showing a fake "healthy" status for
// an integration that isn't real is worse than showing nothing.
//
// This surfaces real, already-known status instead: the exact same
// productSyncConfigured/brand authorized/Pinecone data
// BrandConnectionCard.jsx already displays on 상품관리, just not
// previously visible from 설정. No new backend capability — reuses
// ProductsContext's existing `status`. Deliberately says "설정됨"
// (configured — a real, checked fact) rather than "정상" (healthy) for
// OpenAI/Pinecone, since there's no cheap live health-check for those,
// only a real "the required env vars are present" check.
export default function SystemStatusCard() {
  const { status } = useProducts()

  if (!status.productSyncConfigured) {
    return (
      <div className="card set-sect">
        <div className="sect">시스템 연동 상태</div>
        <p className="sub">
          아직 아무 연동도 설정되지 않았습니다 — backend/.env에 Cafe24/OpenAI/Pinecone 설정을 추가하면
          이 화면에 실제 연결 상태가 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="card set-sect">
      <div className="sect">시스템 연동 상태 <span className="hint">— 상품관리 화면과 동일한 실제 연결 상태</span></div>

      <div className="row">
        <div>
          <div className="t">OpenAI · Pinecone</div>
          <div className="d">이미지 생성 및 벡터 검색에 사용되는 API 키</div>
        </div>
        <span className="status-pill ok">● 설정됨</span>
      </div>

      {status.brands.map((b) => (
        <div className="row" key={b.key}>
          <div>
            <div className="t">{b.name} (Cafe24)</div>
            <div className="d">제품 {b.productCount}개 · Pinecone 벡터 {b.pinecone?.vectorCount ?? '—'}개</div>
          </div>
          {!b.configured ? (
            <span className="status-pill neutral">● 설정 필요</span>
          ) : b.authorized ? (
            <span className="status-pill ok">● 연결됨</span>
          ) : (
            <span className="status-pill warn">● 인증 필요</span>
          )}
        </div>
      ))}
    </div>
  )
}
