import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useNavigation } from './NavigationContext.jsx'
import { useAds } from './AdsContext.jsx'
import { useProducts } from './ProductsContext.jsx'
import { useGallery } from './GalleryContext.jsx'
import { useProductRefSelections } from '../hooks/useProductRefSelections.js'
import { looksLikeFactualCopy } from '../utils/looksLikeFactualCopy.js'
import {
  startAiSegmentation, startAiRender, startAiBackgroundImage,
  listAiConversations, getAiConversation, saveAiConversation,
} from '../api/backendClient.js'
import { QUANTITIES } from '../data/generationOptions.js'

const AIStudioContext = createContext(null)

function nextId() {
  return Date.now() + Math.random()
}

// Part OO: a "pending seed" for starting a conversation from one of OUR OWN
// prior 생성 스튜디오 results ("이어서 편집"), set by startFromResult
// (called from ResultCard.jsx right before navigating to this screen) and
// consumed by resetConversation below. Deliberately module-level state, NOT
// React state — startFromResult fires synchronously right before
// go('ai-studio') triggers a navigation-driven re-render, and there is no
// guarantee that a setState from the previous screen has actually committed
// before AIStudioScreen's own mount effect reads it; a plain module
// variable has no such race since it's just a JS reference, read/write
// unconditionally regardless of React's render timing. There is only ever
// one AIStudioProvider instance in this app, so a single module-level slot
// is safe.
let pendingSeed = null

// Part EE: builds the fixed dialog sequence a real segmentation result
// implies — exactly one background dialog, one per detected text segment
// (in detection order), one model dialog ONLY if a model segment exists,
// then one product dialog. A plain function (not a useMemo tied to
// component state) so it can also be called with a segments array that
// hasn't landed in state yet — see runSegmentation below, where the
// segmentation call's own response is used to seed the very first dialog in
// the same tick the response arrives, before React has committed it to
// `segments` state.
function buildDialogSequence(segments) {
  const backgroundSeg = segments.find((s) => s.type === 'background')
  const textSegs = segments.filter((s) => s.type === 'text')
  const modelSeg = segments.find((s) => s.type === 'model')
  const productSeg = segments.find((s) => s.type === 'product')

  const sequence = [{ phase: 'dialog:background', segmentId: backgroundSeg?.id ?? null }]
  textSegs.forEach((s) => sequence.push({ phase: `dialog:text:${s.id}`, segmentId: s.id }))
  if (modelSeg) sequence.push({ phase: 'dialog:model', segmentId: modelSeg.id })
  // §5d: product replacement is always exactly one confirm/pick dialog,
  // even when segmentation found several product-type instances (a bundle
  // shot with 3-4 units side by side, say) — never one dialog per instance.
  // Highlighting a single representative instance (the first) mirrors how
  // the background dialog also only highlights a representative rectangle,
  // not the segment's own multi-instance reality.
  sequence.push({ phase: 'dialog:product', segmentId: productSeg?.id ?? null })
  return sequence
}

// Part SS: loadConversation resumes directly into whatever dialog phase was
// saved (e.g. 'dialog:text:text-2') without replaying the phase-advancement
// sequence that normally sets activeSegmentId as a side effect of getting
// there — this derives the same value buildDialogSequence's own entry would
// have set, so AIImagePane.jsx's highlight box still lands on the right
// segment immediately after a resume, not just after the next dialog answer.
function activeSegmentIdForPhase(phase, segments) {
  if (!phase || !phase.startsWith('dialog:')) return null
  const entry = buildDialogSequence(segments).find((e) => e.phase === phase)
  return entry?.segmentId ?? null
}

function dialogMessageFor(entry, segments) {
  const { phase, segmentId } = entry
  if (phase === 'dialog:background') {
    return {
      text: '배경을 어떻게 할까요?',
      choices: [
        { id: 'keep', label: '경쟁사 배경을 유지' },
        { id: 'replace', label: '우리 배경으로 교체' },
        { id: 'custom', label: '직접 입력' },
      ],
    }
  }
  if (phase === 'dialog:model') {
    return {
      text: '모델을 어떻게 할까요?',
      choices: [
        { id: 'keep', label: '경쟁사 모델을 그대로 유지' },
        { id: 'replace', label: '우리 모델로 얼굴 교체' },
        { id: 'custom', label: '직접 입력' },
      ],
    }
  }
  if (phase === 'dialog:product') {
    return {
      text: '제품 이미지를 확인해주세요.',
      choices: [
        { id: 'keep', label: '자동 선택 (기본 참조 이미지 사용)' },
        { id: 'replace', label: '직접 선택' },
        { id: 'custom', label: '직접 입력' },
      ],
    }
  }
  // dialog:text:<id>
  const segment = segments.find((s) => s.id === segmentId)
  const factual = looksLikeFactualCopy(segment?.text || '')
  return {
    text: `문구: "${segment?.text || segment?.label || ''}"`,
    choices: [
      { id: 'keep', label: factual ? '문구 구조는 유지하고 실제 값만 교체' : '원본 문구 그대로 유지' },
      { id: 'replace', label: '우리 브랜드의 추출된 문구 스타일로 대체' },
      { id: 'custom', label: '직접 입력' },
    ],
  }
}

export function AIStudioProvider({ children }) {
  const { showToast, go } = useNavigation()
  const { ads, brands: refBrands } = useAds()
  const { brands: myBrands } = useProducts()
  const { refreshResults } = useGallery()

  // Part SS: a stable id for the CURRENT conversation, created once
  // (crypto.randomUUID() — browser-native, no new dependency) whenever a
  // conversation starts, fresh or seeded, and swapped for the resumed
  // conversation's own id by loadConversation. null only before the very
  // first resetConversation/loadConversation call ever runs.
  const [conversationId, setConversationId] = useState(null)
  // Bumped after every successful autosave so AIConversationList.jsx knows
  // to refetch the sidebar list (its own updatedAt/label just changed) —
  // simpler than prop-drilling a callback or standing up an event bus for
  // one signal.
  const [conversationListVersion, setConversationListVersion] = useState(0)

  const [phase, setPhase] = useState('select-brand')
  const [messages, setMessages] = useState([])
  const [segments, setSegments] = useState([])
  const [imageUrl, setImageUrl] = useState(null)
  const [activeSegmentId, setActiveSegmentId] = useState(null)
  const [decisions, setDecisions] = useState({ background: null, texts: {}, model: null, product: null })

  const [selectedRefBrand, setSelectedRefBrand] = useState(null)
  const [selectedRefAdId, setSelectedRefAdId] = useState(null)
  const [selectedBrandKey, setSelectedBrandKey] = useState(null)
  const [selectedProductId, setSelectedProductId] = useState(null)

  // Part OO: set only for a conversation seeded from one of OUR OWN prior
  // 생성 스튜디오 results ("이어서 편집") — sourceImageUrl is the actual image
  // segmented/isolated/rendered against (in place of the competitor ad's
  // own image); sourceResult is the whole originating result object,
  // needed by AIStudioScreen.jsx's before/after banner (§2.5) for its
  // referenceImage/productReferenceImage/styleReferenceImage fallbacks,
  // not just the pieces already pulled into the 4 selection states above.
  // Both null for a normal from-scratch conversation.
  const [sourceImageUrl, setSourceImageUrl] = useState(null)
  const [sourceResult, setSourceResult] = useState(null)

  const [formats, setFormats] = useState([])
  const [quantity, setQuantity] = useState(QUANTITIES[0])

  const [segmentationError, setSegmentationError] = useState(null)
  const [renderError, setRenderError] = useState(null)
  const [lastResult, setLastResult] = useState(null)

  // Part FF-2: the real, standalone isolated-background image shown in
  // place of the original ad while the 배경 dialog is active — see
  // AIImagePane.jsx and adSegmentation.service.js's isolateAdBackground for
  // why this replaced the earlier box/mask-on-the-original-ad approaches.
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(null)
  const [backgroundImageLoading, setBackgroundImageLoading] = useState(false)
  const [backgroundImageError, setBackgroundImageError] = useState(null)

  const appendMessage = useCallback((partial) => {
    const message = { id: nextId(), createdAt: new Date().toISOString(), ...partial }
    setMessages((prev) => [...prev, message])
    return message.id
  }, [])

  // Marks the most recently appended unanswered dialog message (kind
  // 'dialog', no chosenChoiceId yet) as resolved, in place — it stays in the
  // log, it just stops accepting further input. Never deletes/replaces a
  // message: the chat is a permanent record of the conversation.
  const resolveOpenDialog = useCallback((choiceId, resolvedLabel) => {
    setMessages((prev) => {
      const openIndex = [...prev].reverse().findIndex((m) => m.kind === 'dialog' && !m.chosenChoiceId)
      if (openIndex === -1) return prev
      const index = prev.length - 1 - openIndex
      const next = [...prev]
      next[index] = { ...next[index], chosenChoiceId: choiceId, resolvedLabel }
      return next
    })
  }, [])

  // Part EE §4: the single, well-commented phase-advancement function.
  // Everything that completes one phase (a brand/ad pick, a dialog answer)
  // funnels through here so the "what comes next" logic lives in exactly
  // one place — a future new segment type only needs a change here, not
  // scattered across every UI component. `context.segments` exists for
  // exactly one caller (runSegmentation's success path below): the freshly
  // fetched segments haven't been committed to `segments` state yet in that
  // same tick, so the caller passes them through explicitly rather than
  // this function reading a stale empty array. `context.refBrand` exists
  // for the same reason on selectRefBrand's side — setSelectedRefBrand's
  // update hasn't landed yet either when advancePhase runs synchronously
  // right after it, so reading `selectedRefBrand` straight from this
  // closure here would show the PREVIOUS value, not the one just picked.
  const advancePhase = useCallback((fromPhase, context = {}) => {
    const segs = context.segments ?? segments
    const refBrandValue = context.refBrand ?? selectedRefBrand

    if (fromPhase === 'select-brand') {
      setPhase('select-ad')
      setActiveSegmentId(null)
      appendMessage({
        role: 'ai', kind: 'choices',
        text: `'${refBrandValue}'의 어떤 광고를 참고할까요?`,
      })
      return
    }

    if (fromPhase === 'select-ad') {
      setPhase('select-product')
      setActiveSegmentId(null)
      appendMessage({ role: 'ai', kind: 'text', text: '어떤 우리 브랜드/제품으로 생성할까요? 오른쪽 패널에서 선택해주세요.' })
      return
    }

    if (fromPhase === 'select-product') {
      setPhase('segmenting')
      setActiveSegmentId(null)
      appendMessage({ role: 'ai', kind: 'text', text: '광고 이미지를 분석하고 있습니다...' })
      return
    }

    // Segmentation just finished — enter the first dialog in the sequence
    // its result implies (see buildDialogSequence above). `segs` here is
    // always segmentsOverride, the freshly fetched array — see this
    // function's own header comment for why.
    if (fromPhase === 'segmenting') {
      const [firstEntry] = buildDialogSequence(segs)
      setPhase(firstEntry.phase)
      setActiveSegmentId(firstEntry.segmentId)
      const { text, choices } = dialogMessageFor(firstEntry, segs)
      appendMessage({ role: 'ai', kind: 'dialog', text, choices, segmentId: firstEntry.segmentId })
      return
    }

    if (fromPhase.startsWith('dialog:')) {
      const sequence = buildDialogSequence(segs)
      const currentIndex = sequence.findIndex((entry) => entry.phase === fromPhase)
      const nextEntry = sequence[currentIndex + 1]

      if (nextEntry) {
        setPhase(nextEntry.phase)
        setActiveSegmentId(nextEntry.segmentId)
        const { text, choices } = dialogMessageFor(nextEntry, segs)
        appendMessage({ role: 'ai', kind: 'dialog', text, choices, segmentId: nextEntry.segmentId })
      } else {
        setPhase('review')
        setActiveSegmentId(null)
        appendMessage({ role: 'ai', kind: 'summary', text: '모든 선택이 끝났습니다 — 아래에서 포맷과 수량을 정하고 생성을 시작하세요.' })
      }
      return
    }
  }, [segments, selectedRefBrand, appendMessage])

  const selectRefBrand = useCallback((brand) => {
    setSelectedRefBrand(brand)
    appendMessage({ role: 'user', kind: 'text', text: brand })
    advancePhase('select-brand', { refBrand: brand })
  }, [appendMessage, advancePhase])

  const selectRefAd = useCallback((adId) => {
    setSelectedRefAdId(adId)
    appendMessage({ role: 'user', kind: 'text', text: `AD ${String(adId).slice(-4)}` })
    advancePhase('select-ad')
  }, [appendMessage, advancePhase])

  const selectBrandProduct = useCallback((brandKey, productId) => {
    setSelectedBrandKey(brandKey)
    setSelectedProductId(productId)
    const brand = myBrands.find((b) => b.key === brandKey)
    const productName = brand ? Object.keys(brand.products).find((n) => brand.products[n].productId === productId) : null
    appendMessage({ role: 'user', kind: 'text', text: productName ? `${brand.name} · ${productName}` : String(productId) })
    advancePhase('select-product')
  }, [myBrands, appendMessage, advancePhase])

  const runSegmentation = useCallback(async () => {
    if (!selectedRefAdId) return
    setSegmentationError(null)
    try {
      // Part OO: when this conversation was seeded from one of OUR OWN
      // prior 생성 스튜디오 results, sourceImageUrl is segmented instead of
      // the competitor ad's own image — the user is refining what they
      // already generated, not re-analyzing the untouched original.
      const { segments: fetchedSegments, imageUrl: fetchedImageUrl } = sourceImageUrl
        ? await startAiSegmentation(selectedRefAdId, sourceImageUrl)
        : await startAiSegmentation(selectedRefAdId)
      setSegments(fetchedSegments)
      setImageUrl(fetchedImageUrl)
      advancePhase('segmenting', { segments: fetchedSegments })
    } catch (err) {
      console.error('Ad segmentation failed:', err)
      setSegmentationError(err.message || '알 수 없는 오류')
      showToast(`분석 실패: ${err.message}`)
    }
  }, [selectedRefAdId, sourceImageUrl, advancePhase, showToast])

  // Fires exactly once per entry into 'segmenting', guarded by a ref rather
  // than relying on the effect itself — React 18 StrictMode (see main.jsx)
  // deliberately double-invokes effects in dev to surface side-effect bugs,
  // and this is a real, metered gpt-5.5 call that must never fire twice for
  // one conversation because of that. The ref survives the StrictMode
  // double-invoke (it doesn't recreate the component), so the second
  // invocation sees it already set and skips. retrySegmentation (exposed
  // below) calls runSegmentation directly, bypassing this guard entirely —
  // a real user-initiated retry after a failure must always go through.
  const segmentationStartedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'segmenting') {
      segmentationStartedRef.current = false
      return
    }
    if (segmentationStartedRef.current) return
    segmentationStartedRef.current = true
    runSegmentation()
  }, [phase, runSegmentation])

  // Part FF-2: fires once per conversation, the instant the background
  // dialog phase is entered — same StrictMode-double-invoke-safe ref guard
  // as runSegmentation's own effect above (this is also a real, metered
  // call). Failure is non-fatal: AIImagePane.jsx falls back to showing the
  // original ad image (no highlight) rather than blocking the conversation
  // over a nice-to-have preview image.
  const runBackgroundIsolation = useCallback(async () => {
    if (!selectedRefAdId) return
    setBackgroundImageLoading(true)
    setBackgroundImageError(null)
    try {
      // Part OO: same sourceImageUrl override as runSegmentation above.
      const { backgroundImageUrl: url } = sourceImageUrl
        ? await startAiBackgroundImage(selectedRefAdId, sourceImageUrl)
        : await startAiBackgroundImage(selectedRefAdId)
      setBackgroundImageUrl(url)
    } catch (err) {
      console.error('Ad background isolation failed:', err)
      setBackgroundImageError(err.message || '알 수 없는 오류')
    } finally {
      setBackgroundImageLoading(false)
    }
  }, [selectedRefAdId, sourceImageUrl])

  const backgroundImageStartedRef = useRef(false)
  useEffect(() => {
    if (phase !== 'dialog:background') {
      backgroundImageStartedRef.current = false
      return
    }
    if (backgroundImageStartedRef.current) return
    backgroundImageStartedRef.current = true
    runBackgroundIsolation()
  }, [phase, runBackgroundIsolation])

  // Part EE §5: chooseKeep/chooseReplace/chooseCustom are the three generic
  // decision primitives every dialog (background/text/model/product)
  // reduces to — see each dialog's own option list in the spec, all of
  // which map onto exactly one of these three shapes. Clicking a thumbnail
  // in the right panel is equivalent to picking option (b) in chat, so it
  // calls chooseReplace with the picked image URL too — the panel is just
  // another input surface for the same decision, never a separate one.
  const applyDecision = useCallback((mode, value, resolvedLabel) => {
    const decision = { mode, value: value ?? null }
    setDecisions((prev) => {
      if (phase === 'dialog:background') return { ...prev, background: decision }
      if (phase === 'dialog:model') return { ...prev, model: decision }
      if (phase === 'dialog:product') return { ...prev, product: decision }
      if (phase.startsWith('dialog:text:')) {
        const segmentId = phase.slice('dialog:text:'.length)
        return { ...prev, texts: { ...prev.texts, [segmentId]: decision } }
      }
      return prev
    })
    resolveOpenDialog(mode, resolvedLabel ?? (mode === 'keep' ? '유지' : mode === 'replace' ? '교체' : value))
    advancePhase(phase)
  }, [phase, resolveOpenDialog, advancePhase])

  const chooseKeep = useCallback((value = null, label) => {
    applyDecision('keep', value, label)
  }, [applyDecision])

  const chooseReplace = useCallback((imageUrlValue, label) => {
    applyDecision('replace', imageUrlValue, label ?? '교체됨')
  }, [applyDecision])

  const chooseCustom = useCallback((text) => {
    if (!text || !text.trim()) return
    applyDecision('custom', text.trim(), text.trim())
  }, [applyDecision])

  const toggleFormat = useCallback((fmt) => {
    setFormats((prev) => (prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]))
  }, [])

  const startGenerate = useCallback(async () => {
    if (formats.length === 0) {
      showToast('포맷을 1개 이상 선택하세요')
      return
    }
    setRenderError(null)
    setPhase('generating')
    appendMessage({ role: 'ai', kind: 'text', text: '이미지를 생성하고 있습니다...' })

    try {
      const result = await startAiRender({
        refAdId: selectedRefAdId,
        refBrand: selectedRefBrand,
        brand: { key: selectedBrandKey, productId: selectedProductId },
        formats,
        quantity: Number(String(quantity).replace(/\D/g, '')) || 1,
        decisions,
        // §7 step 2: the backend needs each text segment's own transcribed
        // text (not just its id) to correlate it against
        // analyzeReferenceAd's identified_texts by exact string match — this
        // screen already fetched `segments` once via /segment, so re-sending
        // it here is free (no extra real API call), unlike re-running
        // segmentation server-side would be.
        segments,
        // Part OO: when set, the backend analyzes/renders against THIS
        // image instead of the competitor ad's own — refAdId/refBrand above
        // still travel through as lineage metadata regardless (see
        // postRender's own comment).
        sourceImageUrl: sourceImageUrl || undefined,
      })
      setLastResult(result)
      await refreshResults()

      // The backend never throws for a partial/total per-render failure —
      // it always responds 200 with a { succeeded, failed, failures }
      // summary (same "don't abort a whole batch over one bad render"
      // posture as 생성 스튜디오's own job summary) — succeeded === 0 is the
      // one case this screen must still treat as a real failure, since
      // there's nothing in 결과 갤러리 to show for it.
      if (result.succeeded === 0) {
        const message = result.failures?.[0]?.error || '알 수 없는 오류'
        setRenderError(message)
        setPhase('review')
        appendMessage({ role: 'ai', kind: 'text', text: `생성 실패: ${message}` })
        showToast(`생성 실패: ${message}`)
        return
      }

      setPhase('done')
      const summary = result.failed > 0 ? ` (성공 ${result.succeeded}건 · 실패 ${result.failed}건)` : ''
      appendMessage({ role: 'ai', kind: 'text', text: `생성이 완료됐습니다${summary} — 결과 갤러리에서 확인하세요.` })
      showToast(`생성이 완료됐습니다${summary}`)
    } catch (err) {
      console.error('생성 AI render failed:', err)
      setRenderError(err.message || '알 수 없는 오류')
      setPhase('review')
      appendMessage({ role: 'ai', kind: 'text', text: `생성 실패: ${err.message}` })
      showToast(`생성 실패: ${err.message}`)
    }
  }, [
    formats, quantity, decisions, selectedRefAdId, selectedRefBrand, selectedBrandKey, selectedProductId,
    sourceImageUrl, appendMessage, refreshResults, showToast,
  ])

  const goToGallery = useCallback(() => {
    go('gallery')
  }, [go])

  // Part OO: called from ResultCard.jsx ("💬 생성 AI에서 이어서 편집") right
  // before navigating here — resolves everything a seeded conversation
  // needs and stashes it in the module-level pendingSeed (see its own
  // comment for why this can't just be more React state), rather than
  // setting this context's own state directly: resetConversation is the
  // single place that actually applies a seed (or starts blank), so there's
  // exactly one code path that initializes a conversation, not two.
  // myBrandsList is passed in (rather than read from this context's own
  // `myBrands`) since ResultCard.jsx already has it from its own
  // useProducts() call and the two are guaranteed to be the same data.
  const startFromResult = useCallback((result, myBrandsList) => {
    const brandKey = myBrandsList.find((b) => b.name === result.brand)?.key
    if (!brandKey) {
      console.warn(
        `startFromResult: could not resolve a brand key for result brand "${result.brand}" ` +
        '(brand name changed, or products haven\'t loaded yet) — falling back to a blank conversation instead ' +
        'of seeding into a broken state.'
      )
      pendingSeed = null
      return
    }
    pendingSeed = {
      selectedRefBrand: result.refBrand,
      selectedRefAdId: result.referenceAdId,
      selectedBrandKey: brandKey,
      selectedProductId: result.productId,
      // The real, downloadable Drive URL — never the w600 embeddable
      // thumbnail variant (`result.image`), which the backend can't use as
      // a download source the way it uses every other imageUrl in this app.
      sourceImageUrl: result.originalImage,
      sourceResult: result,
    }
  }, [])

  // §9: no persistence across screen navigations/reloads — each visit
  // starts fresh. AIStudioScreen.jsx calls this on mount rather than this
  // context resetting itself on unmount, since (like every other context in
  // this app) it's composed once at the top of the tree and never unmounts
  // on its own as the user navigates between screens.
  //
  // Seeds the very first chat message itself — nothing else ever prompts
  // for a brand pick (advancePhase only ever fires in response to an action
  // that already completed a phase), so without this the chat would open
  // completely empty with no way to start the conversation at all.
  //
  // Part OO: checks pendingSeed FIRST — when present (a fresh "이어서 편집"
  // click), skips straight past select-brand/select-ad/select-product
  // (all 3 already implied by the seed) directly into 'segmenting', which
  // the existing runSegmentation effect below picks up exactly as it
  // already does for that phase, now carrying sourceImageUrl through.
  const resetConversation = useCallback(() => {
    if (pendingSeed) {
      const seed = pendingSeed
      pendingSeed = null
      setConversationId(crypto.randomUUID())
      setPhase('segmenting')
      setMessages([{
        id: nextId(), createdAt: new Date().toISOString(), role: 'ai', kind: 'text',
        text: '이 결과를 이어서 편집합니다 — 이미지를 분석하고 있습니다...',
      }])
      setSegments([])
      setImageUrl(null)
      setActiveSegmentId(null)
      setDecisions({ background: null, texts: {}, model: null, product: null })
      setSelectedRefBrand(seed.selectedRefBrand)
      setSelectedRefAdId(seed.selectedRefAdId)
      setSelectedBrandKey(seed.selectedBrandKey)
      setSelectedProductId(seed.selectedProductId)
      setSourceImageUrl(seed.sourceImageUrl)
      setSourceResult(seed.sourceResult)
      setFormats([])
      setQuantity(QUANTITIES[0])
      setSegmentationError(null)
      setRenderError(null)
      setLastResult(null)
      setBackgroundImageUrl(null)
      setBackgroundImageLoading(false)
      setBackgroundImageError(null)
      return
    }

    setConversationId(crypto.randomUUID())
    setPhase('select-brand')
    setMessages([{ id: nextId(), createdAt: new Date().toISOString(), role: 'ai', kind: 'choices', text: '어떤 브랜드의 광고를 참고할까요?' }])
    setSegments([])
    setImageUrl(null)
    setActiveSegmentId(null)
    setDecisions({ background: null, texts: {}, model: null, product: null })
    setSelectedRefBrand(null)
    setSelectedRefAdId(null)
    setSelectedBrandKey(null)
    setSelectedProductId(null)
    setSourceImageUrl(null)
    setSourceResult(null)
    setFormats([])
    setQuantity(QUANTITIES[0])
    setSegmentationError(null)
    setRenderError(null)
    setLastResult(null)
    setBackgroundImageUrl(null)
    setBackgroundImageLoading(false)
    setBackgroundImageError(null)
  }, [])

  // Part SS: fetches full detail for one saved conversation and hydrates
  // every relevant piece of state — the resume path used both by
  // initializeConversation below (auto-resuming on mount) and by
  // AIConversationList.jsx (clicking a row in the sidebar). Anything NOT
  // persisted (formats/quantity/backgroundImage*/segmentationError/
  // renderError/lastResult) resets to its blank-conversation default, same
  // as resetConversation, since none of those survive a resume anyway.
  const loadConversation = useCallback(async (id) => {
    try {
      const conv = await getAiConversation(id)
      setConversationId(conv.id)
      setPhase(conv.phase)
      setMessages(conv.messages)
      setSegments(conv.segments)
      setDecisions(conv.decisions)
      setImageUrl(conv.imageUrl)
      setSelectedRefBrand(conv.selectedRefBrand)
      setSelectedRefAdId(conv.selectedRefAdId)
      setSelectedBrandKey(conv.selectedBrandKey)
      setSelectedProductId(conv.selectedProductId)
      setSourceResult(conv.sourceResult)
      setSourceImageUrl(conv.sourceResult?.originalImage ?? null)
      setActiveSegmentId(activeSegmentIdForPhase(conv.phase, conv.segments))
      setFormats([])
      setQuantity(QUANTITIES[0])
      setSegmentationError(null)
      setRenderError(null)
      setLastResult(null)
      setBackgroundImageUrl(null)
      setBackgroundImageLoading(false)
      setBackgroundImageError(null)
    } catch (err) {
      console.error('Failed to load AI studio conversation', err)
      resetConversation()
    }
  }, [resetConversation])

  // Part SS: AIStudioScreen.jsx's mount-effect entry point, replacing its
  // old unconditional resetConversation() call. A pendingSeed (fresh "이어서
  // 편집" click) always wins and starts a NEW conversation — resetConversation
  // itself already checks pendingSeed first, so it's the right call either
  // way. Otherwise resumes the most recently updated saved conversation, if
  // any; a blank slate only when none exist yet (first-ever visit) or the
  // list fetch fails.
  const initializeConversation = useCallback(async () => {
    if (pendingSeed) {
      resetConversation()
      return
    }
    try {
      const { conversations } = await listAiConversations()
      if (conversations && conversations.length > 0) {
        await loadConversation(conversations[0].id)
      } else {
        resetConversation()
      }
    } catch (err) {
      console.error('Failed to list AI studio conversations', err)
      resetConversation()
    }
  }, [resetConversation, loadConversation])

  // Part SS: debounced autosave, mirroring the ~800ms pattern already used
  // elsewhere in this app for save-as-you-go UX. Skips saving while still
  // on the very first, unanswered select-brand prompt (messages.length<=1)
  // — nothing worth persisting yet, and saving here would litter the
  // sidebar with empty "새 대화" rows on every mount. Logs (rather than
  // throws) on failure — losing one autosave tick isn't worth surfacing as
  // a user-facing error given the next edit will just retry it.
  const autosaveTimerRef = useRef(null)
  useEffect(() => {
    if (!conversationId) return
    if (phase === 'select-brand' && messages.length <= 1) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      saveAiConversation(conversationId, {
        id: conversationId,
        selectedBrandKey, selectedRefBrand, selectedRefAdId, selectedProductId,
        sourceResult, phase, imageUrl, messages, segments, decisions,
      }).then(() => {
        setConversationListVersion((v) => v + 1)
      }).catch((err) => {
        console.error('Failed to autosave AI studio conversation', err)
      })
    }, 800)
    return () => clearTimeout(autosaveTimerRef.current)
  }, [
    conversationId, phase, messages, decisions, segments, imageUrl,
    selectedRefBrand, selectedRefAdId, selectedBrandKey, selectedProductId, sourceResult,
  ])

  // Selected brand's own product-reference derivation, mirroring
  // StudioContext's productRefSelections but scoped to the ONE selected
  // product this screen ever deals with (see useProductRefSelections.js).
  const selectedBrand = myBrands.find((b) => b.key === selectedBrandKey) || null
  const selectedProductName = selectedBrand
    ? Object.keys(selectedBrand.products).find((n) => selectedBrand.products[n].productId === selectedProductId)
    : null
  const productRefSelection = selectedBrand
    ? useProductRefSelections(selectedBrand, selectedProductName ? [selectedProductName] : [])
    : { galleryItems: [], availablePrices: [], availablePromotions: [], availableAdHooks: [] }

  return (
    <AIStudioContext.Provider
      value={{
        phase, messages, segments, imageUrl, activeSegmentId, decisions,
        refBrands, ads, myBrands,
        selectedRefBrand, selectedRefAdId, selectedBrandKey, selectedProductId,
        selectRefBrand, selectRefAd, selectBrandProduct,
        segmentationError, retrySegmentation: runSegmentation,
        backgroundImageUrl, backgroundImageLoading, backgroundImageError,
        retryBackgroundImage: runBackgroundIsolation,
        chooseKeep, chooseReplace, chooseCustom,
        formats, toggleFormat, quantity, setQuantity,
        startGenerate, renderError, lastResult,
        selectedBrand, selectedProductName, productRefSelection,
        resetConversation, goToGallery,
        // Part OO: startFromResult seeds pendingSeed (see its own comment) —
        // sourceResult is exposed so AIStudioScreen.jsx's before/after
        // banner (§2.5) can render without a second round-trip.
        startFromResult, sourceResult,
        // Part SS: conversation persistence — AIStudioScreen.jsx calls
        // initializeConversation on mount instead of resetConversation
        // directly; AIConversationList.jsx uses conversationId (to
        // highlight the active row), loadConversation (row click), and
        // conversationListVersion (a refetch signal bumped after every
        // successful autosave).
        conversationId, loadConversation, initializeConversation, conversationListVersion,
      }}
    >
      {children}
    </AIStudioContext.Provider>
  )
}

export function useAIStudio() {
  const ctx = useContext(AIStudioContext)
  if (!ctx) throw new Error('useAIStudio must be used within AIStudioProvider')
  return ctx
}
