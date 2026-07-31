import Thumb from '../common/Thumb.jsx'
import Badge from '../common/Badge.jsx'

// Real-photo grid card, mirrors StepReferenceAds.jsx's .refpick pattern —
// own .prod-card/.prod-grid classes in products.css rather than importing
// studio.css, same scoped-variant convention as .sync-* mirroring feed.css's
// .cp-*.
export default function ProductCard({ product, color, onClick }) {
  return (
    <div className="prod-card" onClick={onClick}>
      <Thumb gradient="g5" image={product.primaryImage} fit="contain">
        {product.extractedReferences.some((r) => r.type === 'product') && (
          <Badge variant="live">레퍼런스 준비됨</Badge>
        )}
        {product.images.length > 1 && (
          <Badge variant="media">이미지 {product.images.length}장</Badge>
        )}
      </Thumb>
      <div className="prod-card-body">
        <div className="prod-card-name">
          <span className="dot" style={{ background: color }}>{product.brand[0] || '?'}</span>
          {product.name}
        </div>
        <div className="prod-card-price">{product.priceFormatted}</div>
      </div>
    </div>
  )
}
