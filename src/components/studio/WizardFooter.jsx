import { useStudio } from '../../context/StudioContext.jsx'

export default function WizardFooter() {
  const { step, goPrev, goNext } = useStudio()
  return (
    <div className="footer">
      <button className="btn ghost" style={{ visibility: step === 1 ? 'hidden' : 'visible' }} onClick={goPrev}>
        ← 이전
      </button>
      <button className="btn pri" onClick={goNext}>
        {step === 4 ? '🚀 생성 시작' : '다음 →'}
      </button>
    </div>
  )
}
