import { useState } from 'react'

function formatSyncedAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

// Read-only variant of the old ProductReviewPanel shape: no review badge,
// no "수정" override — every field here is a single real value straight
// from the Cafe24 -> GPT -> Pinecone sync, not an option array to pick from.
export default function ProductRow({ product }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`prod-review ${open ? 'open' : ''}`}>
      <div className="pr-head" onClick={() => setOpen((v) => !v)}>
        <span className="t">{product['Product Name'] || '(이름 없음)'}</span>
        <span className="pr-meta">
          {product['Price'] && <span className="pr-price">{product['Price']}</span>}
          <span className="d">{formatSyncedAt(product['Last Synced'])}</span>
        </span>
      </div>
      <div className="pr-body">
        <div className="pr-field emphasized">
          <div className="fl">프로모션</div>
          <div className="fv">{product['Promotion Info'] || '없음'}</div>
        </div>
        <div className="pr-field emphasized">
          <div className="fl">광고 후킹 카피</div>
          <div className="fv">{product['Ad Hook Copy'] || '없음'}</div>
        </div>
        <div className="pr-field">
          <div className="fl">제품특성</div>
          <div className="fv small">{product['제품특성'] || '없음'}</div>
        </div>
        <div className="pr-field">
          <div className="fl">효과효능</div>
          <div className="fv small">{product['효과효능'] || '없음'}</div>
        </div>
        <div className="pr-field">
          <div className="fl">페인포인트</div>
          <div className="fv small">{product['페인포인트'] || '없음'}</div>
        </div>
        <div className="pr-field">
          <div className="fl">권위/신뢰/인증</div>
          <div className="fv small">{product['권위신뢰'] || '없음'}</div>
        </div>
      </div>
    </div>
  )
}
