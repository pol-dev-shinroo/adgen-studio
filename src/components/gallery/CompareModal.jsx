import { useState } from 'react'
import Modal from '../common/Modal.jsx'
import RetryImage from '../common/RetryImage.jsx'
import ImageLightbox from '../common/ImageLightbox.jsx'
import { toEmbeddableImageUrl } from '../../api/adaptAd.js'

// Part V: replaces the old swipe-between-two ImageLightbox 비교 with a real
// side-by-side (경쟁사 원본 vs 생성 결과), plus a second gap this closes —
// visibility into which of our OWN reference images actually fed this
// specific render (제품 참조 always, 스타일 참조 only when one was selected
// for that render — generation.service.js snapshots both at generation
// time, see adaptGeneratedResult.js). Either pane, or a used-reference
// thumbnail, opens the existing ImageLightbox for a fuller view — this
// modal itself never shows more than a fixed-height preview.
export default function CompareModal({ referenceImage, result, onClose }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const usedReferences = [
    { key: 'product', label: '제품 참조', url: result.productReferenceImage },
    { key: 'style', label: '스타일 참조', url: result.styleReferenceImage },
  ].filter((ref) => ref.url)

  // Lightbox order mirrors reading order: the two big panes first, then the
  // used-reference thumbnails below — whichever thumbnail is clicked jumps
  // straight to its own index rather than always starting at 0.
  const lightboxImages = [referenceImage, result.originalImage, ...usedReferences.map((r) => r.url)].filter(Boolean)
  const openLightbox = (url) => setLightboxIndex(lightboxImages.indexOf(url))

  return (
    <>
      <Modal onClose={onClose} overlayClassName="compare-overlay" dialogClassName="compare-dialog">
        <button className="modal-close" onClick={onClose} aria-label="닫기">✕</button>
        <div className="compare-modal">
          <div className="sect" style={{ marginBottom: 12 }}>비교</div>

          <div className="compare-sbs">
            <div className="compare-pane" onClick={() => referenceImage && openLightbox(referenceImage)}>
              <div className="compare-pane-label">경쟁사 원본</div>
              {referenceImage ? (
                <RetryImage
                  src={toEmbeddableImageUrl(referenceImage, 'w800')}
                  alt=""
                  fallback={<div className="compare-pane-fallback">이미지를 불러올 수 없습니다</div>}
                />
              ) : (
                <div className="compare-pane-fallback">원본 이미지를 찾을 수 없습니다</div>
              )}
            </div>
            <div className="compare-pane" onClick={() => openLightbox(result.originalImage)}>
              <div className="compare-pane-label">생성 결과</div>
              <RetryImage
                src={result.image}
                alt=""
                fallback={<div className="compare-pane-fallback">이미지를 불러올 수 없습니다</div>}
              />
            </div>
          </div>

          {usedReferences.length > 0 && (
            <div className="compare-used">
              <div className="sub-sect">
                사용된 참조 이미지 <span className="hint">— 이 결과를 생성할 때 실제로 사용된 참조 이미지</span>
              </div>
              <div className="compare-used-row">
                {usedReferences.map((ref) => (
                  <button key={ref.key} type="button" className="compare-used-thumb" onClick={() => openLightbox(ref.url)}>
                    <img src={toEmbeddableImageUrl(ref.url, 'w200')} alt="" />
                    <span className="compare-used-thumb-label">{ref.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
