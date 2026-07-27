import { useState, useEffect } from 'react'
import { BASE_URL } from '../api/backendClient.js'

// Cafe24 OAuth redirect target. Cafe24's app registration rejects
// "localhost" redirect URIs outright ("domain 형식이 올바르지 않습니다" —
// it requires a real, publicly resolvable domain, not just an HTTPS
// scheme), so the redirect URI has to be a real deployed page rather than
// something running on the developer's own machine.
//
// This page is deliberately NOT part of the main app (no Sidebar, no
// Context providers) — it's a standalone landing spot. It does now make one
// direct fetch call (the one exception to "no /api calls"), POSTing the
// `code` Cafe24 hands back straight to the deployed backend's exchange
// endpoint — the backend (on Railway) and whoever is completing this
// consent in their browser are frequently different machines, so the old
// "copy this command and run it locally" flow no longer reaches the
// backend that actually needs the tokens.
export default function Cafe24CallbackPage() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state') // brand key, passed through by cafe24.client.js's getAuthorizeUrl
  const error = params.get('error')
  const [exchangeStatus, setExchangeStatus] = useState('idle') // 'idle' | 'loading' | 'success' | 'failed'
  const [exchangeError, setExchangeError] = useState('')

  useEffect(() => {
    if (error || !code || !state) return

    let cancelled = false
    setExchangeStatus('loading')

    fetch(`${BASE_URL}/api/products/${encodeURIComponent(state)}/cafe24/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || `요청 실패 (HTTP ${res.status})`)
        if (!cancelled) setExchangeStatus('success')
      })
      .catch((err) => {
        if (cancelled) return
        setExchangeStatus('failed')
        setExchangeError(err.message)
      })

    return () => { cancelled = true }
  }, [code, state, error])

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>Ad<span style={{ color: '#5b5bd6' }}>Gen</span> Studio</div>

        {error && (
          <>
            <h1 style={styles.h1}>인증 실패</h1>
            <p style={styles.sub}>Cafe24가 오류를 반환했습니다: <b>{error}</b></p>
          </>
        )}

        {!error && !code && (
          <>
            <h1 style={styles.h1}>잘못된 접근</h1>
            <p style={styles.sub}>이 페이지는 Cafe24 인증 흐름을 통해서만 열려야 합니다. code 파라미터가 없습니다.</p>
          </>
        )}

        {!error && code && exchangeStatus === 'loading' && (
          <>
            <h1 style={styles.h1}>인증 처리 중...</h1>
            <p style={styles.sub}>토큰을 발급받아 저장하고 있습니다. 잠시만 기다려주세요.</p>
          </>
        )}

        {!error && code && exchangeStatus === 'success' && (
          <>
            <h1 style={styles.h1}>✔ 인증 완료</h1>
            <p style={styles.sub}>
              <b>{state}</b> 브랜드의 Cafe24 인증이 완료되고 토큰이 저장됐습니다.
              이제 이 창을 닫고 상품 관리 화면으로 돌아가 연결 상태를 확인하세요.
            </p>
          </>
        )}

        {!error && code && exchangeStatus === 'failed' && (
          <>
            <h1 style={styles.h1}>인증 실패</h1>
            <p style={styles.sub}>토큰 저장에 실패했습니다: <b>{exchangeError}</b></p>
            <p style={styles.sub}>
              인증 코드는 몇 분 안에 만료됩니다 — <code>node scripts/cafe24-auth.js {state}</code>를
              다시 실행해 새로 시도해주세요.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f6fb',
    fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
    padding: 20,
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '36px 40px',
    maxWidth: 520,
    width: '100%',
    boxShadow: '0 8px 30px rgba(20,20,40,.08)',
  },
  logo: { fontWeight: 800, fontSize: 15, marginBottom: 24, color: '#1a1a2e' },
  h1: { fontSize: 20, margin: '0 0 10px' },
  sub: { fontSize: 13.5, color: '#666', lineHeight: 1.6, margin: '0 0 18px' },
}
