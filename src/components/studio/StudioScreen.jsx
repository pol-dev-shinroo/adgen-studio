import '../../styles/studio.css'
import { useStudio } from '../../context/StudioContext.jsx'
import WizardSteps from './WizardSteps.jsx'
import WizardFooter from './WizardFooter.jsx'
import StepReferenceBrand from './steps/StepReferenceBrand.jsx'
import StepReferenceAds from './steps/StepReferenceAds.jsx'
import StepMyBrand from './steps/StepMyBrand.jsx'
import StepGenerationOptions from './steps/StepGenerationOptions.jsx'

const STEP_COMPONENTS = {
  1: StepReferenceBrand,
  2: StepReferenceAds,
  3: StepMyBrand,
  4: StepGenerationOptions,
}

export default function StudioScreen() {
  const { step } = useStudio()
  const StepComponent = STEP_COMPONENTS[step]

  return (
    <section>
      <div className="head">
        <div>
          <h1>생성 스튜디오</h1>
          <p className="sub">경쟁사 광고의 스타일·구조를 참조해 우리 브랜드 광고를 생성합니다</p>
        </div>
      </div>
      <WizardSteps />
      <div className="card">
        <div className="panel">
          <StepComponent />
        </div>
        <WizardFooter />
      </div>
    </section>
  )
}
