import { useState } from 'react'
import { useProducts } from '../../context/ProductsContext.jsx'
import { formatDateTime } from '../../utils/date.js'
import SyncProgress from '../studio/steps/SyncProgress.jsx'

// Same two brands/colors as ProductsContext.jsx's BRAND_DEFS and
// initialBrands.js — kept local rather than threaded through the backend
// status payload, since color is purely a frontend display concern.
const BRAND_COLORS = { healthykiki: '#5b5bd6', kikibeauty: '#d6a15b' }

export default function BrandConnectionCard({ brandStatus }) {
  const { sync, activeJob, resetNamespace } = useProducts()
  const [confirmText, setConfirmText] = useState('')
  const { key, name, configured, authorized, productCount, lastSyncedAt, pinecone } = brandStatus

  const isSyncing = activeJob?.brandKey === key
  const canReset = confirmText.trim() === name

  const handleReset = () => {
    if (!canReset) return
    resetNamespace(key)
    setConfirmText('')
  }

  return (
    <div className="card set-sect">
      <div className="row" style={{ borderBottom: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="dot" style={{ background: BRAND_COLORS[key] || '#888' }}>{name[0]}</div>
          <div>
            <div className="t">{name}</div>
            <div className="d">
              {!configured ? (
                <span className="status-pill neutral">● 설정 필요</span>
              ) : authorized ? (
                <span className="status-pill ok">● 연결됨</span>
              ) : (
                <>
                  <span className="status-pill warn">● 인증 필요</span>{' '}
                  — <code>node scripts/cafe24-auth.js {key}</code> 실행 필요
                </>
              )}
            </div>
          </div>
        </div>
        <button type="button" className="btn pri sm" onClick={() => sync(key)} disabled={!!activeJob}>
          {isSyncing ? '동기화 중...' : '지금 동기화'}
        </button>
      </div>

      <div className="row">
        <div className="d">제품 {productCount}개 · 마지막 동기화 {formatDateTime(lastSyncedAt, { fallback: '없음', dateStyle: 'medium', timeStyle: 'short' })}</div>
        <div className="d">Pinecone 벡터 {pinecone.vectorCount ?? '—'}개</div>
      </div>

      {isSyncing && <SyncProgress job={activeJob} />}

      <details className="advanced">
        <summary>고급</summary>
        <div className="danger-zone">
          <div className="d">
            Pinecone 네임스페이스를 초기화하면 "{name}"의 모든 벡터가 영구 삭제됩니다 —
            되돌릴 수 없습니다. 계속하려면 아래에 브랜드명을 정확히 입력하세요.
          </div>
          <div className="danger-row">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={name}
            />
            <button type="button" className="btn danger sm" onClick={handleReset} disabled={!canReset}>
              Pinecone 네임스페이스 초기화
            </button>
          </div>
        </div>
      </details>
    </div>
  )
}
