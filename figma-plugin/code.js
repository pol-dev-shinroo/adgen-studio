// AdGen Studio Import — Figma plugin main thread.
//
// Phase 1 only: there's no bounding-box/position data anywhere in the
// generation pipeline (vision analysis only records a free-text location
// description, not coordinates), so the imported result is a reference
// image frame plus a SEPARATE, clearly-labeled "카피 (편집 가능)" copy panel
// next to it — not a pixel-accurate overlay. That's Phase 2, and depends on
// the vision-analysis step gaining real bounding-box output first.
//
// Runs in Figma's sandboxed plugin main thread, not a browser tab. Verified
// against real Figma (not assumed from docs): this sandbox's fetch() still
// sends a real Origin: null header and is still subject to the target
// server's actual CORS response — manifest.json's networkAccess only gates
// whether Figma itself permits the attempt, it does NOT bypass the target
// server's CORS policy the way it might sound like it does. What actually
// makes this work is the backend's own CORS config explicitly reflecting
// back the request's origin (including "null") for the couple of read-only
// endpoints this plugin needs — see backend/src/app.js. Given that, this
// thread's fetch and ui.html's fetch are equally capable network-wise; the
// list of results is fetched directly by ui.html (a normal page load, no
// relay needed), while the single-result export fetch happens here first
// (avoids a UI round-trip since this thread needs the data locally anyway
// to build the Figma nodes), falling back to a ui.html-relay only if this
// thread's own attempt genuinely fails.
const BASE_URL = 'https://backend-production-5a23.up.railway.app'

figma.showUI(__html__, { width: 420, height: 560 })

figma.ui.onmessage = async (msg) => {
  if (!msg || !msg.type) return

  if (msg.type === 'import') {
    await handleImport(msg.generationId)
  } else if (msg.type === 'export-data') {
    // ui.html's own fetch (the fallback path) succeeded — build from that.
    await buildImportFrame(msg.data)
  } else if (msg.type === 'export-data-error') {
    figma.ui.postMessage({
      type: 'import-status', generationId: msg.generationId, status: 'error',
      message: `가져오기 실패 (UI 재시도도 실패): ${msg.error}`,
    })
  }
}

async function handleImport(generationId) {
  figma.ui.postMessage({ type: 'import-status', generationId, status: 'importing' })
  try {
    const res = await fetch(`${BASE_URL}/api/generate/results/${generationId}/figma-export`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    await buildImportFrame(data)
  } catch (err) {
    // Genuine network/fetch failure — fall back to asking ui.html to fetch
    // instead and relay the result back (see the note above BASE_URL: both
    // paths have equal network access here, this is just a reliability
    // fallback, not a CORS workaround).
    console.warn('Main-thread figma-export fetch failed, falling back to UI relay:', err)
    figma.ui.postMessage({ type: 'request-export-fetch', generationId })
  }
}

async function buildImportFrame(data) {
  const { generationId, imageUrl, replacements } = data
  const size = data.size || '1024x1024'
  const [width, height] = size.split('x').map(Number)

  let imageBytes
  try {
    const imgRes = await fetch(imageUrl)
    const buf = await imgRes.arrayBuffer()
    imageBytes = new Uint8Array(buf)
  } catch (err) {
    figma.ui.postMessage({
      type: 'import-status', generationId, status: 'error',
      message: `이미지를 불러오지 못했습니다: ${(err && err.message) || err}`,
    })
    return
  }

  const image = figma.createImage(imageBytes)

  const imageFrame = figma.createFrame()
  imageFrame.name = `AdGen — ${generationId}`
  imageFrame.resize(width, height)

  const rect = figma.createRectangle()
  rect.resize(width, height)
  rect.x = 0
  rect.y = 0
  rect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }]
  imageFrame.appendChild(rect)

  const nodesToView = [imageFrame]
  let noCopyReason = null

  if (Array.isArray(replacements) && replacements.length > 0) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' })

    const copyFrame = figma.createFrame()
    copyFrame.name = '카피 (편집 가능)'
    copyFrame.layoutMode = 'VERTICAL'
    copyFrame.primaryAxisSizingMode = 'AUTO'
    copyFrame.counterAxisSizingMode = 'AUTO'
    copyFrame.itemSpacing = 20
    copyFrame.paddingTop = 24
    copyFrame.paddingBottom = 24
    copyFrame.paddingLeft = 24
    copyFrame.paddingRight = 24
    copyFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]
    copyFrame.x = imageFrame.x + width + 60
    copyFrame.y = imageFrame.y

    replacements.forEach((r) => {
      const group = figma.createFrame()
      group.name = r.location || '위치 미상'
      group.layoutMode = 'VERTICAL'
      group.primaryAxisSizingMode = 'AUTO'
      group.counterAxisSizingMode = 'AUTO'
      group.itemSpacing = 4
      group.fills = []

      // location is a free-text description ("top-center within red-
      // bordered box"), never coordinates — the caption exists so someone
      // reading this panel still knows roughly which part of the image
      // each line of copy belongs to, even without a real overlay.
      const caption = figma.createText()
      caption.fontName = { family: 'Inter', style: 'Regular' }
      caption.characters = r.location || '위치 미상'
      caption.fontSize = 11
      caption.fills = [{ type: 'SOLID', color: { r: 0.42, g: 0.44, b: 0.5 } }]

      // The actual editable deliverable — a real Figma text node, not a
      // screenshot/image of text.
      const text = figma.createText()
      text.fontName = { family: 'Inter', style: 'Bold' }
      text.characters = r.new_text || ''
      text.fontSize = 18

      group.appendChild(caption)
      group.appendChild(text)
      copyFrame.appendChild(group)
    })

    nodesToView.push(copyFrame)
  } else {
    noCopyReason = '이 결과에는 저장된 교체 카피가 없어 원본 이미지만 가져왔습니다 (이 기능 추가 이전에 생성된 결과일 수 있습니다).'
  }

  figma.currentPage.selection = nodesToView
  figma.viewport.scrollAndZoomIntoView(nodesToView)

  figma.ui.postMessage({
    type: 'import-status', generationId, status: noCopyReason ? 'no-copy' : 'done',
    message: noCopyReason || undefined,
  })
}
