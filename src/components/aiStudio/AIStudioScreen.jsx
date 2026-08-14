import { useEffect, useRef } from 'react'
import '../../styles/aiStudio.css'
import { useAIStudio } from '../../context/AIStudioContext.jsx'
import AIImagePane from './AIImagePane.jsx'
import AIChatPane from './AIChatPane.jsx'
import AIContextPanel from './AIContextPanel.jsx'

// Part EE §9: no persistence across screen navigations/reloads — every
// visit to 생성 AI starts fresh. AIStudioProvider is composed once at the
// top of the tree (same as every other context here) and never unmounts on
// its own as the user navigates away and back, so this screen resets the
// conversation itself on mount rather than relying on unmount/remount.
export default function AIStudioScreen() {
  const { resetConversation } = useAIStudio()
  const resetOnce = useRef(false)

  useEffect(() => {
    if (resetOnce.current) return
    resetOnce.current = true
    resetConversation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="ai-studio-screen">
      <div className="head">
        <div>
          <h1>생성 AI</h1>
          <p className="sub">경쟁사 광고 1건을 세그먼트별로 분석하고, 대화로 하나씩 결정하며 이미지를 생성합니다.</p>
        </div>
      </div>

      <div className="ai-studio-grid">
        <div className="ai-studio-left">
          <AIImagePane />
          <AIChatPane />
        </div>
        <AIContextPanel />
      </div>
    </section>
  )
}
