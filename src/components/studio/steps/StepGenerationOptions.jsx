import { useStudio } from '../../../context/StudioContext.jsx'
import Chip from '../../common/Chip.jsx'

const FORMATS = ['1:1 피드', '4:5 피드', '9:16 스토리']
const QUANTITIES = ['1장', '2장', '4장']

export default function StepGenerationOptions() {
  const {
    formats, toggleFormat,
    quantity, setQuantity,
    styleIntensity, setStyleIntensity,
    instructions, setInstructions,
  } = useStudio()

  return (
    <>
      <div className="sect">포맷</div>
      <div className="optrow">
        {FORMATS.map((f) => (
          <Chip key={f} active={formats.includes(f)} onClick={() => toggleFormat(f)}>{f}</Chip>
        ))}
      </div>

      <div className="sect">생성 수량 (포맷당)</div>
      <div className="optrow">
        {QUANTITIES.map((q) => (
          <Chip key={q} active={quantity === q} onClick={() => setQuantity(q)}>{q}</Chip>
        ))}
      </div>

      <div className="sect">스타일 반영 강도</div>
      <div className="range" style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: 'var(--sub)' }}>약하게</span>
        <input
          type="range"
          value={styleIntensity}
          onChange={(e) => setStyleIntensity(Number(e.target.value))}
          style={{ width: 220 }}
        />
        <span style={{ fontSize: 12, color: 'var(--sub)' }}>강하게</span>
      </div>

      <div className="field">
        <label>추가 지시문 (선택)</label>
        <textarea
          rows={2}
          placeholder="예: 여름 느낌의 밝은 배경, 모델 없이 제품 중심으로"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </div>
    </>
  )
}
