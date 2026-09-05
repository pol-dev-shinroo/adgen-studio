import { useEffect, useRef, useState } from 'react'
import '../../styles/aiStudio.css'
import { useAIStudio } from '../../context/AIStudioContext.jsx'
import { useAds } from '../../context/AdsContext.jsx'
import AIImagePane from './AIImagePane.jsx'
import AIChatPane from './AIChatPane.jsx'
import AIContextPanel from './AIContextPanel.jsx'
import AIConversationList from './AIConversationList.jsx'
import CompareModal from '../gallery/CompareModal.jsx'

// Part EE §9 / Part SS: no reset-on-navigate anymore — AIStudioProvider is
// composed once at the top of the tree (same as every other context here)
// and never unmounts on its own as the user navigates away and back, so
// this screen used to unconditionally wipe the conversation on every mount.
// Part SS persists conversations, so mounting now calls
// initializeConversation instead: it resumes the most recently saved
// conversation (or starts blank on a true first visit), while a pending
// Part-OO "이어서 편집" seed still always wins and starts a fresh one — see
// initializeConversation's own comment in AIStudioContext.jsx.
export default function AIStudioScreen() {
  const { initializeConversation, sourceResult } = useAIStudio()
  const { ads } = useAds()
  const resetOnce = useRef(false)
  const [compareOpen, setCompareOpen] = useState(false)

  useEffect(() => {
    if (resetOnce.current) return
    resetOnce.current = true
    initializeConversation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Part OO §2.5: this flow is meaningfully different from starting 생성 AI
  // from scratch — the user already produced sourceResult via 생성 스튜디오
  // and needs to see how it came out (경쟁사 원본 vs. that result) before and
  // while deciding how to refine it further. Reuses CompareModal exactly as
  // 결과 갤러리 already does — same referenceImage fallback chain
  // ResultCard.jsx's own compareImages derivation uses. Stays visible for
  // the WHOLE conversation (not just the first message), since the user may
  // want to re-check the before/after at any point mid-dialog, and renders
  // nothing at all for a normal from-scratch conversation (sourceResult null).
  const sourceReferenceAd = sourceResult
    ? ads.find((a) => String(a.id) === String(sourceResult.referenceAdId))
    : null
  const sourceReferenceImage = sourceResult
    ? (sourceResult.originalReferenceAdImage || sourceReferenceAd?.images?.[0] || '')
    : ''

  return (
    <section className="ai-studio-screen">
      <div className="head">
        <div>
          <h1>생성 AI</h1>
          <p className="sub">경쟁사 광고 1건을 세그먼트별로 분석하고, 대화로 하나씩 결정하며 이미지를 생성합니다.</p>
        </div>
      </div>

      {sourceResult && (
        <div className="ai-studio-source-banner">
          🔧 결과 갤러리에서 이어서 편집 중
          <button type="button" className="btn ghost sm" onClick={() => setCompareOpen(true)}>
            원본 비교 보기
          </button>
        </div>
      )}

      <div className="ai-studio-grid">
        <AIConversationList />
        <div className="ai-studio-left">
          <AIImagePane />
          <AIChatPane />
        </div>
        <AIContextPanel />
      </div>

      {compareOpen && sourceResult && (
        <CompareModal referenceImage={sourceReferenceImage} result={sourceResult} onClose={() => setCompareOpen(false)} />
      )}
    </section>
  )
}
