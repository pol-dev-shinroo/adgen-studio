import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useNavigation } from '../../context/NavigationContext.jsx'
import { createUserAccount, getUsers } from '../../api/backendClient.js'
import { formatDateTime } from '../../utils/date.js'
import Spinner from '../common/Spinner.jsx'
import '../../styles/auth.css'

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

// Part X: 실질적인 회원가입 flow, just gated — visible only to a logged-in
// admin. Everyone created this part qualifies today (every account is
// 'admin'), but this checks user.role for real rather than assuming; the
// backend's own requireAdmin enforces this regardless of what the
// frontend chooses to show. Reuses auth.css's .auth-form/.auth-field
// treatment LoginScreen.jsx established, rather than a second, plainer
// form language.
export default function UserManagementCard() {
  const { user } = useAuth()
  const { showToast } = useNavigation()

  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState({ email: false, password: false, passwordConfirm: false })
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')

  const loadUsers = useCallback(() => {
    setUsersLoading(true)
    return getUsers()
      .then(({ users: list }) => setUsers(list))
      .catch((err) => showToast(`사용자 목록을 불러오지 못했습니다: ${err.message}`))
      .finally(() => setUsersLoading(false))
  }, [showToast])

  useEffect(() => {
    if (user?.role === 'admin') loadUsers()
  }, [user?.role, loadUsers])

  if (user?.role !== 'admin') return null

  const emailError = touched.email && !isValidEmail(email) ? '올바른 이메일 주소를 입력해주세요.' : ''
  const passwordError = touched.password && password.length < 8 ? '비밀번호는 8자 이상이어야 합니다.' : ''
  const confirmError = touched.passwordConfirm && password !== passwordConfirm ? '비밀번호가 일치하지 않습니다.' : ''
  const canSubmit = isValidEmail(email) && password.length >= 8 && password === passwordConfirm && !submitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    setTouched({ email: true, password: true, passwordConfirm: true })
    setServerError('')
    if (!isValidEmail(email) || password.length < 8 || password !== passwordConfirm) return

    setSubmitting(true)
    try {
      await createUserAccount(email.trim(), password, passwordConfirm)
      showToast(`계정이 생성되었습니다: ${email.trim()}`)
      setEmail('')
      setPassword('')
      setPasswordConfirm('')
      setTouched({ email: false, password: false, passwordConfirm: false })
      await loadUsers()
    } catch (err) {
      setServerError(err.message || '계정 생성에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card set-sect">
      <div className="sect">사용자 관리 <span className="hint">— 관리자만 새 계정을 생성할 수 있습니다 (공개 회원가입 없음)</span></div>

      <form className="auth-form" onSubmit={handleSubmit} noValidate style={{ maxWidth: 420 }}>
        {serverError && <div className="auth-error" role="alert">{serverError}</div>}

        <label className="auth-field">
          <span className="auth-field-label">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (serverError) setServerError('') }}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            className={emailError ? 'invalid' : ''}
            autoComplete="off"
            placeholder="teammate@company.com"
          />
          {emailError && <span className="auth-field-error">{emailError}</span>}
        </label>

        <label className="auth-field">
          <span className="auth-field-label">비밀번호</span>
          <div className="auth-password-row">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (serverError) setServerError('') }}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              className={passwordError ? 'invalid' : ''}
              autoComplete="new-password"
              placeholder="8자 이상"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
          {passwordError && <span className="auth-field-error">{passwordError}</span>}
        </label>

        <label className="auth-field">
          <span className="auth-field-label">비밀번호 확인</span>
          <input
            type={showPassword ? 'text' : 'password'}
            value={passwordConfirm}
            onChange={(e) => { setPasswordConfirm(e.target.value); if (serverError) setServerError('') }}
            onBlur={() => setTouched((t) => ({ ...t, passwordConfirm: true }))}
            className={confirmError ? 'invalid' : ''}
            autoComplete="new-password"
          />
          {confirmError && <span className="auth-field-error">{confirmError}</span>}
        </label>

        <button type="submit" className="btn pri auth-submit" disabled={!canSubmit} style={{ width: 'auto', alignSelf: 'flex-start' }}>
          {submitting ? (<><Spinner size="sm" style={{ marginRight: 8 }} /> 생성 중...</>) : '계정 생성'}
        </button>
      </form>

      <div className="auth-user-list">
        {usersLoading ? (
          <Spinner size="sm" />
        ) : (
          users.map((u) => (
            <div key={u.id} className="auth-user-row">
              <div>
                <div className="auth-user-email">{u.email}</div>
                <div className="auth-user-meta">
                  {u.role} · 생성일 {formatDateTime(u.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
              <div className="auth-user-meta">
                마지막 로그인 {formatDateTime(u.lastLoginAt, { fallback: '없음', dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
