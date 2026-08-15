import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useNavigation } from '../../context/NavigationContext.jsx'
import { getCredentials, setCredential } from '../../api/backendClient.js'
import { formatDateTime } from '../../utils/date.js'
import Modal from '../common/Modal.jsx'
import Spinner from '../common/Spinner.jsx'
import '../../styles/auth.css'
import '../../styles/products.css' // .status-pill
import '../../styles/feed.css' // .modal-close

// Part Y: n8n-style credentials screen — a scannable list grouped by
// integration, each row showing configured/not-configured at a glance
// (reusing SystemStatusCard.jsx's own .status-pill convention) plus who
// last set it and when. Click a row to edit it in a small modal; saving
// posts the new value to the backend, which encrypts and stores it — the
// plaintext never comes back here, only the refreshed masked value.
//
// Deliberately separate from SystemStatusCard.jsx, not a replacement for
// it: that card answers "is the real connection working" (Cafe24 OAuth
// state, live product/vector counts); this one answers "what's the raw
// credential value and who set it" and is the only place that can actually
// change one. Different questions, same screen.
const GROUPS = [
  {
    title: '헬시키키 (Cafe24)',
    keys: ['CAFE24_HEALTHYKIKI_MALL_ID', 'CAFE24_HEALTHYKIKI_CLIENT_ID', 'CAFE24_HEALTHYKIKI_CLIENT_SECRET'],
  },
  {
    title: '키키뷰티 (Cafe24)',
    keys: ['CAFE24_KIKIBEAUTY_MALL_ID', 'CAFE24_KIKIBEAUTY_CLIENT_ID', 'CAFE24_KIKIBEAUTY_CLIENT_SECRET'],
  },
  { title: 'OpenAI', keys: ['OPENAI_API_KEY'] },
  { title: 'Pinecone', keys: ['PINECONE_API_KEY'] },
  { title: 'Apify', keys: ['APIFY_TOKEN'] },
]

function EditCredentialModal({ credentialKey, onClose, onSaved }) {
  const [value, setValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!value.trim()) {
      setError('값을 입력해주세요.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await setCredential(credentialKey, value.trim())
      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message || '저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 24, minWidth: 380 }}>
        <button className="modal-close" onClick={onClose} aria-label="닫기">✕</button>
        <div className="sect" style={{ marginBottom: 4 }}>{credentialKey}</div>
        <p className="sub" style={{ marginTop: 0, marginBottom: 16 }}>
          새 값을 저장하면 즉시 적용됩니다 (재배포/재시작 불필요). 저장된 값은 암호화되어
          다시 화면에 표시되지 않습니다.
        </p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {error && <div className="auth-error" role="alert">{error}</div>}

          <label className="auth-field">
            <span className="auth-field-label">새 값</span>
            <div className="auth-password-row">
              <input
                type={showValue ? 'text' : 'password'}
                value={value}
                onChange={(e) => { setValue(e.target.value); if (error) setError('') }}
                autoComplete="off"
                autoFocus
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowValue((s) => !s)}
                aria-label={showValue ? '값 숨기기' : '값 표시'}
              >
                {showValue ? '🙈' : '👁'}
              </button>
            </div>
          </label>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={onClose}>취소</button>
            <button type="submit" className="btn pri" disabled={submitting}>
              {submitting ? (<><Spinner size="sm" style={{ marginRight: 8 }} /> 저장 중...</>) : '저장'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

export default function CredentialsCard() {
  const { user } = useAuth()
  const { showToast } = useNavigation()

  const [credentials, setCredentials] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    return getCredentials()
      .then(({ credentials: list }) => setCredentials(list))
      .catch((err) => showToast(`자격 증명 목록을 불러오지 못했습니다: ${err.message}`))
      .finally(() => setLoading(false))
  }, [showToast])

  useEffect(() => {
    if (user?.role === 'admin') load()
  }, [user?.role, load])

  if (user?.role !== 'admin') return null

  const byKey = new Map(credentials.map((c) => [c.key, c]))

  return (
    <div className="card set-sect">
      <div className="sect">
        자격 증명 <span className="hint">— 관리자만 조회/수정할 수 있습니다 (값은 암호화되어 저장되며 마스킹되어 표시됩니다)</span>
      </div>

      {loading ? (
        <Spinner size="sm" />
      ) : (
        GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sub)', padding: '10px 0 2px' }}>
              {group.title}
            </div>
            {group.keys.map((key) => {
              const cred = byKey.get(key)
              return (
                <div className="row" key={key}>
                  <div>
                    <div className="t">{key}</div>
                    <div className="d">
                      {cred?.decryptError ? (
                        '복호화 실패 — 암호화 키가 변경되었을 수 있습니다. 값을 다시 입력해 저장해주세요.'
                      ) : cred?.configured ? (
                        <>
                          {cred.masked}
                          {cred.updatedByEmail && (
                            <> · {cred.updatedByEmail}이(가) {formatDateTime(cred.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}에 수정</>
                          )}
                        </>
                      ) : (
                        '설정되지 않음'
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={`status-pill ${cred?.decryptError ? 'warn' : cred?.configured ? 'ok' : 'neutral'}`}>
                      {cred?.decryptError ? '● 재설정 필요' : cred?.configured ? '● 설정됨' : '● 설정 필요'}
                    </span>
                    <button type="button" className="btn ghost sm" onClick={() => setEditingKey(key)}>
                      편집
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}

      {editingKey && (
        <EditCredentialModal
          credentialKey={editingKey}
          onClose={() => setEditingKey(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
