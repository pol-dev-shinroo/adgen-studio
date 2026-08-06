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

      {/* Part U-2: this slider isn't general artistic license — it's a dial
          between two sources of creative material. Low keeps the
          competitor 레퍼런스 광고's own original look and phrasing (only
          the product and any facts that must differ change); high leans
          into OUR OWN material when we've actually provided some — Step
          3's selected 참조 이미지(모델/배지 등)와 선택한 카피
          (가격·프로모션·후킹). Copy rewritten to describe that real axis
          in plain terms rather than the old composition/lighting framing,
          which never actually matched what the slider does. */}
      <div className="sect">
        스타일 반영 강도{' '}
        <span className="hint">
          — 약하게: 경쟁사 레퍼런스 광고의 원본 구도·카피를 그대로 유지 (제품과 꼭 달라야 하는 정보만 교체) /
          강하게: 우리 브랜드가 선택한 참조 이미지·카피가 있다면 그것을 적극 반영
        </span>
      </div>
      <div className="range" style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: 'var(--sub)' }}>경쟁사 스타일 유지</span>
        <input
          type="range"
          value={styleIntensity}
          onChange={(e) => setStyleIntensity(Number(e.target.value))}
          style={{ width: 220 }}
        />
        <span style={{ fontSize: 12, color: 'var(--sub)' }}>우리 스타일 반영</span>
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
