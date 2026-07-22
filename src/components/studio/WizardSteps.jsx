import { useStudio } from '../../context/StudioContext.jsx'

const LABELS = ['1. 레퍼런스 브랜드', '2. 광고소재 선택', '3. 내 브랜드·제품', '4. 생성 옵션']

export default function WizardSteps() {
  const { step, setStep } = useStudio()
  return (
    <div className="steps">
      {LABELS.map((label, i) => {
        const n = i + 1
        const cls = step === n ? 'on' : step > n ? 'done' : ''
        return (
          <div key={n} className={`step ${cls}`} onClick={() => setStep(n)}>
            {label}
          </div>
        )
      })}
    </div>
  )
}
