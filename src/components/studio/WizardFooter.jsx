import { useStudio } from '../../context/StudioContext.jsx'

export default function WizardFooter() {
  const { step, goPrev, goNext, totalRenders } = useStudio()
  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      {/* BB-4: real render-count preview, right above the button that
          actually commits to spending — computed from this exact set of
          selections, not a guess (see StudioContext.jsx's totalRenders). On
          its own row (not squeezed into the button row) so it never causes
          the buttons themselves to wrap.
          Part DD: dropped the per-factor breakdown ("제품 N개 × 레퍼런스
          광고 N개 × 포맷 N개 × N") — now that format/quantity vary per
          reference ad, there's no longer one shared "포맷 N개 × N장" figure
          that applies uniformly across every selected ad, so a single
          factored-out formula would be misleading. The total itself is
          still exact (same totalRenders StepGenerationOptions' own per-ad
          blocks add up to), just without a breakdown that no longer means
          anything as one expression. */}
      {step === 4 && (
        <div className="sub" style={{ padding: '12px 20px 0' }}>
          총 <strong>{totalRenders}</strong>장 생성됩니다
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
