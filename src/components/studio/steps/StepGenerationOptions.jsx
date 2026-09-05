import { useAds } from '../../../context/AdsContext.jsx'
import { useStudio } from '../../../context/StudioContext.jsx'
import Thumb from '../../common/Thumb.jsx'
import Chip from '../../common/Chip.jsx'
import { FORMATS, QUANTITIES } from '../../../data/generationOptions.js'

export default function StepGenerationOptions() {
  const { ads } = useAds()
  const {
    refAdIds, refAdConfigs, toggleAdFormat, setAdQuantity,
    styleIntensity, updateStyleIntensity,
    freeRestyle, setFreeRestyle, strongReferenceInfluence, setStrongReferenceInfluence,
    verbatimCopy, setVerbatimCopy, creativeCopy, setCreativeCopy,
    hasStyleReferenceForBrand, hasAdCopyOverrideForBrand,
    instructions, setInstructions,
  } = useStudio()

  return (
    <>
      {/* Part DD: replaces the old single shared "포맷"/"생성 수량" chip rows
          — each selected reference ad now gets its own formats/quantity
          (e.g. AD A -> 1 image, AD B -> 2 images), so this renders one block
          per ad instead of one block for the whole job. Ad lookup mirrors
          StepReferenceAds.jsx's own `ads.filter(a => a.brand === refBrand)`
          pattern — here just finding one ad by id for its thumbnail/AD
          label, not filtering the whole list. */}
      <div className="sect">
        레퍼런스 광고별 생성 옵션{' '}
        <span className="hint">— 광고소재마다 포맷과 수량을 따로 설정할 수 있습니다</span>
      </div>
      {refAdIds.map((adId) => {
        const ad = ads.find((a) => a.id === adId)
        const cfg = refAdConfigs[adId] || { formats: [], quantity: '1장' }
        return (
          <div key={adId} className="ad-option-block">
            <div className="ad-option-header">
              {ad && <Thumb gradient={ad.gradient} image={ad.image} className="ad-option-thumb" />}
              <span>AD {String(adId).slice(-4)}</span>
            </div>

            <div className="sub-sect">포맷</div>
            <div className="optrow">
              {FORMATS.map((f) => (
                <Chip key={f} active={cfg.formats.includes(f)} onClick={() => toggleAdFormat(adId, f)}>{f}</Chip>
              ))}
            </div>

            <div className="sub-sect">생성 수량 (포맷당)</div>
            <div className="optrow">
              {QUANTITIES.map((q) => (
                <Chip key={q} active={cfg.quantity === q} onClick={() => setAdQuantity(adId, q)}>{q}</Chip>
              ))}
            </div>
          </div>
        )
      })}

      {/* Part U-2 / Part LL: this slider isn't general artistic license —
          it's a dial between two sources of creative material. Stays
          global/shared across every ad and product in the job — Part DD
          only asked for per-ad format/quantity, not per-ad style intensity.
          The old explanatory hint span is gone per direct client feedback —
          the 3 checkboxes below now spell out exactly what the slider
          affects, rather than one paragraph trying to describe all 3 axes
          the number used to blend together. */}
      <div className="sect">스타일 반영 강도</div>
      <div className="range" style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: 'var(--sub)' }}>경쟁사 스타일 유지</span>
        <input
          type="range"
          value={styleIntensity}
          onChange={(e) => updateStyleIntensity(Number(e.target.value))}
          style={{ width: 220 }}
        />
        <span style={{ fontSize: 12, color: 'var(--sub)' }}>우리 스타일 반영</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', minWidth: 32 }}>{styleIntensity}%</span>
      </div>

      {/* Part LL: 3 independent axes the slider used to force together as
          one number — each maps to a real fork in renderImage.service.js's
          styleInstructionFor / copywriting.service.js's
          styleIntensityInstructionFor. Auto-checked/unchecked live as the
          slider is dragged (updateStyleIntensity above), but independently
          toggleable by hand afterward. Checkboxes 2/3 are greyed out and
          disabled when this brand has no style reference / no ad-copy
          override selected in Step 3 yet, since toggling them would have no
          effect either way. */}
      <div className="style-checkbox-list" style={{ marginBottom: 16 }}>
        <label className="style-checkbox">
          <input
            type="checkbox"
            checked={freeRestyle}
            onChange={(e) => setFreeRestyle(e.target.checked)}
          />
          배경·조명·색감을 우리 스타일로 자유롭게 재해석
        </label>
        <label className="style-checkbox" style={{ opacity: hasStyleReferenceForBrand ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={strongReferenceInfluence}
            disabled={!hasStyleReferenceForBrand}
            onChange={(e) => setStrongReferenceInfluence(e.target.checked)}
          />
          선택한 참조 이미지를 강하게 반영 (모델 참조라면 얼굴까지 교체)
          {!hasStyleReferenceForBrand && <span className="hint"> — 3단계에서 참조 이미지를 먼저 선택해주세요</span>}
        </label>
        <label className="style-checkbox" style={{ opacity: hasAdCopyOverrideForBrand ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={verbatimCopy}
            disabled={!hasAdCopyOverrideForBrand}
            onChange={(e) => setVerbatimCopy(e.target.checked)}
          />
          선택한 카피 문구를 각색 없이 그대로 사용
          {!hasAdCopyOverrideForBrand && <span className="hint"> — 3단계에서 가격·프로모션·후킹을 먼저 선택해주세요</span>}
        </label>
        {/* Part MM: independent of the 3 above and never wired to the
            slider — an opt-in creative-rewrite mode, not a stronger version
            of "use our wording verbatim." Always enabled (doesn't depend on
            any Step 3 selection the way checkboxes 2/3 do) — it changes HOW
            the model writes the hook, not which facts/phrasing it draws on. */}
        <label className="style-checkbox">
          <input
            type="checkbox"
            checked={creativeCopy}
            onChange={(e) => setCreativeCopy(e.target.checked)}
          />
          카피를 AI가 창의적으로 재구성 (사실 나열이 아닌 설득력 있는 문구로)
        </label>
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
