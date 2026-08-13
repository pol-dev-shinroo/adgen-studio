import { useStudio } from '../../context/StudioContext.jsx'

export default function WizardFooter() {
  const { step, goPrev, goNext, totalRenders, activeBrandProductCount, refAdIds, formats, quantity } = useStudio()
  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      {/* BB-4: real render-count preview, right above the button that
          actually commits to spending — computed from this exact set of
          selections, not a guess (see StudioContext.jsx's totalRenders). On
          its own row (not squeezed into the button row) so it never causes
          the buttons themselves to wrap. */}
      {step === 4 && (
        <div className="sub" style={{ padding: '12px 20px 0' }}>
          총 <strong>{totalRenders}</strong>장 생성됩니다
          {' '}— 제품 {activeBrandProductCount}개 × 레퍼런스 광고 {refAdIds.length}개 × 포맷 {formats.length}개 × {quantity}
        </div>
      )}
      <div className="footer" style={{ borderTop: 'none' }}>
        <button className="btn ghost" style={{ visibility: step === 1 ? 'hidden' : 'visible' }} onClick={goPrev}>
          ← 이전
        </button>
        <button className="btn pri" onClick={goNext}>
          {step === 4 ? '🚀 생성 시작' : '다음 →'}
        </button>
      </div>
    </div>
  )
}
