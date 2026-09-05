import { useEffect, useState } from 'react'
import { useAIStudio } from '../../context/AIStudioContext.jsx'
import { listAiConversations } from '../../api/backendClient.js'

// Rough, Claude/ChatGPT-style relative labels — this sidebar only ever
// needs "how long ago", never an exact timestamp.
function relativeTime(iso) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  return new Date(iso).toLocaleDateString('ko-KR')
}

// Part SS: history sidebar — "+ 새 대화" plus every saved conversation,
// most-recent first (the backend already sorts the list this way). Refetches
// whenever conversationListVersion bumps (every successful autosave), so a
// newly-started or newly-labeled conversation shows up without a manual
// reload. Clicking a row calls loadConversation, the same resume path
// initializeConversation uses on mount.
export default function AIConversationList() {
  const { conversationId, loadConversation, resetConversation, conversationListVersion } = useAIStudio()
  const [conversations, setConversations] = useState([])

  useEffect(() => {
    let cancelled = false
    listAiConversations()
      .then(({ conversations: list }) => {
        if (!cancelled) setConversations(list || [])
      })
      .catch((err) => {
        console.error('Failed to list AI studio conversations', err)
      })
    return () => { cancelled = true }
  }, [conversationListVersion])

  return (
    <div className="ai-conversation-list">
      <button type="button" className="btn ghost sm ai-conversation-new" onClick={() => resetConversation()}>
        + 새 대화
      </button>
      {conversations.length === 0 && <p className="sub">저장된 대화가 없습니다.</p>}
      {conversations.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`ai-conversation-row${c.id === conversationId ? ' active' : ''}`}
          onClick={() => loadConversation(c.id)}
        >
          <span className="ai-conversation-label">{c.label}</span>
          <span className="ai-conversation-time">{relativeTime(c.updatedAt)}</span>
        </button>
      ))}
    </div>
  )
}
