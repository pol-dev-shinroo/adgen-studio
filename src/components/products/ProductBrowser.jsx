import { useState, useMemo } from 'react'
import { useProducts } from '../../context/ProductsContext.jsx'
import Chip from '../common/Chip.jsx'
import ProductCard from './ProductCard.jsx'
import ProductDetailModal from './ProductDetailModal.jsx'

export default function ProductBrowser() {
  const { products, brands } = useProducts()
  const [query, setQuery] = useState('')
  const [brandFilter, setBrandFilter] = useState('전체')
  const [detailProduct, setDetailProduct] = useState(null)

  const colorByBrand = useMemo(
    () => Object.fromEntries(brands.map((b) => [b.name, b.color])),
    [brands]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (brandFilter !== '전체' && p.brand !== brandFilter) return false
      if (q && !p.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [products, query, brandFilter])

  return (
    <div className="card set-sect">
      <div className="sect">동기화된 제품 <span className="hint">— {products.length}개</span></div>

      <div className="browser-controls">
        <input
          className="browser-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제품명으로 검색"
        />
        <div className="filters" style={{ marginBottom: 0 }}>
          <Chip active={brandFilter === '전체'} onClick={() => setBrandFilter('전체')}>전체</Chip>
          {brands.map((b) => (
            <Chip key={b.key} active={brandFilter === b.name} onClick={() => setBrandFilter(b.name)}>
              {b.name}
            </Chip>
          ))}
        </div>
      </div>

      {products.length === 0 ? (
        <p className="sub">아직 동기화된 제품이 없습니다 — 위에서 브랜드를 동기화하세요.</p>
      ) : filtered.length === 0 ? (
        <p className="sub">
          {query ? `"${query}"에 해당하는 제품이 없습니다.` : `${brandFilter} 브랜드에 동기화된 제품이 없습니다.`}
        </p>
      ) : (
        <div className="prod-grid">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              color={colorByBrand[p.brand]}
              onClick={() => setDetailProduct(p)}
            />
          ))}
        </div>
      )}

      {detailProduct && (
        <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} />
      )}
    </div>
  )
}
