import { useEffect, useRef, useState } from 'react'
import { useAIStudio } from '../../context/AIStudioContext.jsx'
import { useNavigation } from '../../context/NavigationContext.jsx'
import Thumb from '../common/Thumb.jsx'
import Chip from '../common/Chip.jsx'
import Spinner from '../common/Spinner.jsx'

// Part EE §5: one dialog card per unresolved AI 'dialog' message — the
// Claude-Code-permission-dialog analogy. "교체" never resolves anything
// directly here (there's no concrete image yet); it just nudges the user at
// the always-visible right panel, which already shows the right gallery for
// this phase (see AIContextPanel.jsx) — clicking a thumbnail there is what
// actually resolves the dialog (see §6's "another input surface for the
// same decision").
function DialogCard({ message }) {
  const { chooseKeep, chooseCustom } = useAIStudio()
  const { showToast } = useNavigation()
  const [customText, setCustomText] = useState('')
  const resolved = !!message.chosenChoiceId

  const keepChoice = message.choices?.find((c) => c.id === 'keep')
  const replaceChoice = message.choices?.find((c) => c.id === 'replace')

  return (
    <div className={`ai-dialog-card${resolved ? ' resolved' : ''}`}>
      <div className="ai-dialog-question">{message.text}</div>
      {resolved ? (
        <div className="ai-dialog-resolved">✓ {message.resolvedLabel}</div>
      ) : (
        <>
          <div className="ai-dialog-actions">
            {keepChoice && (
              <button type="button" className="btn ghost sm" onClick={() => chooseKeep(null, keepChoice.label)}>
                {keepChoice.label}
              </button>
            )}
            {replaceChoice && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => showToast('오른쪽 패널에서 이미지를 선택하세요')}
              >
                {replaceChoice.label}
              </button>
            )}
          </div>
          <form
            className="ai-dialog-custom"
            onSubmit={(e) => { e.preventDefault(); chooseCustom(customText); setCustomText('') }}
          >
            <input
              type="text"
              placeholder="직접 입력..."
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
            />
            <button type="submit" className="btn pri sm">입력</button>
          </form>
        </>
      )}
    </div>
  )
}

function BrandChoiceRow() {
  const { refBrands, selectRefBrand } = useAIStudio()
  if (refBrands.length === 0) return <p className="sub">참고할 경쟁사 광고가 아직 없습니다 — 경쟁사 광고 피드에서 먼저 수집하세요.</p>
  return (
    <div className="optrow">
      {refBrands.map((brand) => (
        <Chip key={brand} active={false} onClick={() => selectRefBrand(brand)}>{brand}</Chip>
      ))}
    </div>
  )
}

function AdChoiceGrid() {
  const { ads, selectedRefBrand, selectRefAd } = useAIStudio()
  const brandAds = ads.filter((a) => a.brand === selectedRefBrand)
  if (brandAds.length === 0) return <p className="sub">'{selectedRefBrand}'의 수집된 광고가 없습니다.</p>
  return (
    <div className="ai-ad-grid">
      {brandAds.map((ad) => (
        <button key={ad.id} type="button" className="ai-ad-card" onClick={() => selectRefAd(ad.id)}>
          <Thumb gradient={ad.gradient} image={ad.image} />
          <span>AD {String(ad.id).slice(-4)}</span>
        </button>
      ))}
    </div>
  )
}

function ChatMessage({ message, isLast, phase }) {
  if (message.kind === 'dialog') return <DialogCard message={message} />

  return (
    <div className={`ai-msg ai-msg-${message.role}`}>
      <div className="ai-msg-bubble">
        {message.text}
        {message.kind === 'choices' && isLast && phase === 'select-brand' && <BrandChoiceRow />}
        {message.kind === 'choices' && isLast && phase === 'select-ad' && <AdChoiceGrid />}
      </div>
    </div>
  )
}

export default function AIChatPane() {
  const { messages, phase, chooseCustom, segmentationError, retrySegmentation } = useAIStudio()
  const [freeText, setFreeText] = useState('')
  const listRef = useRef(null)

  // Standard chat UX — newest message scrolled into view as the log grows.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  const dialogOpen = phase.startsWith('dialog:')

  return (
    <div className="ai-chat-pane">
      <div className="ai-chat-list" ref={listRef}>
        {messages.map((m, i) => (
          <ChatMessage key={m.id} message={m} isLast={i === messages.length - 1} phase={phase} />
        ))}
        {phase === 'segmenting' && !segmentationError && (
          <div className="ai-msg ai-msg-ai">
            <div className="ai-msg-bubble ai-msg-loading"><Spinner size="sm" /> 분석 중...</div>
          </div>
        )}
        {segmentationError && (
          <div className="ai-msg ai-msg-ai">
            <div className="ai-msg-bubble">
              분석에 실패했습니다: {segmentationError}
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn ghost sm" onClick={retrySegmentation}>다시 시도</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* §9: no edit/undo for an already-answered dialog — reloading the
          screen is the only way to start over, noted here since this is the
          natural place a user might look for a "go back" control. */}
      <form
        className="ai-chat-input"
        onSubmit={(e) => { e.preventDefault(); if (dialogOpen) { chooseCustom(freeText); setFreeText('') } }}
      >
        <input
          type="text"
          placeholder={dialogOpen ? '직접 입력하려면 여기에 입력하세요' : '이전 답변은 다시 편집할 수 없습니다 — 화면을 새로고침하면 처음부터 다시 시작합니다'}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          disabled={!dialogOpen}
        />
        <button type="submit" className="btn pri sm" disabled={!dialogOpen}>전송</button>
      </form>
    </div>
  )
}
