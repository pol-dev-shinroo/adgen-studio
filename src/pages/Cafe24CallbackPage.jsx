import { useState } from 'react'

// Cafe24 OAuth redirect target. Cafe24's app registration rejects
// "localhost" redirect URIs outright ("domain 형식이 올바르지 않습니다" —
// it requires a real, publicly resolvable domain, not just an HTTPS
// scheme), so the redirect URI has to be a real deployed page rather than
// something running on the developer's own machine.
//
// This page is deliberately NOT part of the main app (no Sidebar, no
// Context providers, no /api calls) — it's a standalone landing spot whose
// only job is to display the `code` Cafe24 hands back in the query string
// so it can be copied into the one-time local exchange script
// (backend/scripts/cafe24-auth-exchange.js). The client secret and the
// actual token exchange never touch this page or leave the developer's
// machine.
export default function Cafe24CallbackPage() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state') // brand key, passed through by cafe24.client.js's getAuthorizeUrl
  const error = params.get('error')
  const [copied, setCopied] = useState(false)

  const command = code && state
    ? `node scripts/cafe24-auth-exchange.js ${state} ${code}`
    : null

  const copyCommand = () => {
    if (!command) return
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

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

        {!error && code && (
          <>
            <h1 style={styles.h1}>인증 완료 — 코드를 복사하세요</h1>
            <p style={styles.sub}>
              아래 명령어를 복사해 백엔드 터미널에서 실행하면 토큰이 저장됩니다.
              이 코드는 몇 분 안에 만료되니 바로 사용하세요.
            </p>
            <div style={styles.commandBox}>{command}</div>
            <button style={styles.copyBtn} onClick={copyCommand}>
              {copied ? '✔ 복사됨' : '명령어 복사'}
            </button>
            <p style={styles.hint}>브랜드: <b>{state}</b></p>
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
  commandBox: {
    background: '#1a1a2e',
    color: '#e3f6ee',
    fontFamily: 'monospace',
    fontSize: 13,
    padding: '14px 16px',
    borderRadius: 10,
    wordBreak: 'break-all',
    marginBottom: 14,
  },
  copyBtn: {
    background: '#5b5bd6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 13.5,
    fontWeight: 700,
    cursor: 'pointer',
  },
  hint: { fontSize: 12.5, color: '#999', marginTop: 16 },
}
