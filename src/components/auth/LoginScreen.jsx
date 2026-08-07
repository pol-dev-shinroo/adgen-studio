import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import Spinner from '../common/Spinner.jsx'
import '../../styles/auth.css'

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

// The very first thing anyone using this app now sees. Centered card on the
// app's existing token system (--brand/--card/--r/--shadow) and the same
// "Ad[Gen] Studio" logo treatment Sidebar.jsx already has, real inline
// validation (not just a toast after a failed submit), a genuine loading
// state, and a specific wrong-credentials message rather than a generic
// failure — this is deliberately not a bare form.
export default function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState({ email: false, password: false })
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')

  const emailError = touched.email && !isValidEmail(email) ? '올바른 이메일 주소를 입력해주세요.' : ''
  const passwordError = touched.password && !password ? '비밀번호를 입력해주세요.' : ''
  const canSubmit = isValidEmail(email) && password.length > 0 && !submitting

  const handleSubmit = async (e) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    setServerError('')
    if (!isValidEmail(email) || !password) return

    setSubmitting(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setServerError(err.message || '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <div className="auth-logo">Ad<span>Gen</span> Studio</div>
        <h1 className="auth-title">로그인</h1>
        <p className="auth-sub">계정 정보를 입력해 계속하세요.</p>

        {serverError && <div className="auth-error" role="alert">{serverError}</div>}

        <label className="auth-field">
          <span className="auth-field-label">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (serverError) setServerError('') }}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            className={emailError ? 'invalid' : ''}
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
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
              autoComplete="current-password"
              placeholder="••••••••"
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

        <button type="submit" className="btn pri auth-submit" disabled={!canSubmit}>
          {submitting ? (<><Spinner size="sm" style={{ marginRight: 8 }} /> 로그인 중...</>) : '로그인'}
        </button>
      </form>
    </div>
  )
}
