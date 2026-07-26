import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useNavigation } from './NavigationContext.jsx'
import {
  getProducts, startProductSync, getProductSyncStatus,
  getProductStatus, resetPineconeNamespace,
} from '../api/backendClient.js'
import { adaptProduct } from '../api/adaptProduct.js'

const ProductsContext = createContext(null)

const POLL_INTERVAL_MS = 1200

// The two Cafe24 malls this app syncs. Fixed in code rather than fetched
// from the backend, same as backend/src/config/index.js's BRAND_DEFS — the
// brand roster itself doesn't change at runtime, only whether each one has
// credentials configured.
const BRAND_DEFS = [
  { key: 'healthykiki', name: '헬시키키', color: '#5b5bd6' },
  { key: 'kikibeauty', name: '키키뷰티', color: '#d6a15b' },
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Groups the adapted product list into the per-brand shape the Studio
// "내 브랜드" step needs: one entry per known brand (even with zero
// products yet), each holding its products keyed by name. Sourcing from
// adaptProduct's output (rather than raw sheet rows) means Step 3 gets the
// same formatted price/image handling as the product-management screen,
// for free.
function groupByBrand(products) {
  return BRAND_DEFS.map((def) => {
    const brandProducts = products.filter((p) => p.brand === def.name)
    const productsByName = {}
    let lastSynced = null

    brandProducts.forEach((p) => {
      productsByName[p.name] = {
        productId: p.id,
        price: p.priceFormatted,
        promotionInfo: p.promotionInfo,
        adHookCopy: p.adHookCopy,
        imageUrl: p.primaryImage,
      }
      if (p.lastSynced && (!lastSynced || p.lastSynced > lastSynced)) {
        lastSynced = p.lastSynced
      }
    })

    return {
      key: def.key,
      name: def.name,
      color: def.color,
      desc: `제품 ${brandProducts.length}개`,
      products: productsByName,
      lastSynced,
    }
  })
}

export function ProductsProvider({ children }) {
  const { showToast } = useNavigation()
  const [products, setProducts] = useState([])
  const [activeJob, setActiveJob] = useState(null) // { brandKey, status, progress, summary, ... } | null
  const [status, setStatus] = useState({ brands: [], productSyncConfigured: false })

  const loadStatus = useCallback(() => {
    return getProductStatus()
      .then(setStatus)
      .catch((err) => {
        console.error('Failed to load product status from backend:', err)
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    getProducts()
      .then(({ products: raw }) => {
        if (!cancelled) setProducts(raw.map(adaptProduct))
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load products from backend:', err)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Runs a real product sync job against the backend: starts it, polls
  // until done/failed, then re-fetches the full product list. Mirrors
  // AdsContext's collect() job-polling shape.
  const sync = useCallback(async (brandKey) => {
    setActiveJob({
      brandKey,
      status: 'running',
      progress: { phase: 'fetching', totalProducts: 0, productsProcessed: 0, recentItems: [] },
    })

    try {
      const { jobId } = await startProductSync(brandKey)

      let job
      do {
        await sleep(POLL_INTERVAL_MS)
        job = await getProductSyncStatus(jobId)
        setActiveJob({ ...job, brandKey })
      } while (job.status === 'running')

      if (job.status === 'failed') {
        showToast(`동기화 실패: ${job.error || '알 수 없는 오류'}`)
        return
      }

      const { products: refreshed } = await getProducts()
      setProducts(refreshed.map(adaptProduct))
      await loadStatus()
      showToast(
        `동기화 완료: ${job.summary.synced}건 성공` +
        (job.summary.failed ? ` · 실패 ${job.summary.failed}건` : '')
      )
    } catch (err) {
      console.error('Product sync failed:', err)
      showToast(`동기화 중 오류가 발생했습니다: ${err.message}`)
    } finally {
      setActiveJob(null)
    }
  }, [showToast, loadStatus])

  // DESTRUCTIVE — wipes a brand's entire Pinecone namespace. The actual
  // confirmation friction (typing the brand name) lives in the UI; this is
  // just the network call + status refresh once it's already been confirmed.
  const resetNamespace = useCallback(async (brandKey) => {
    try {
      await resetPineconeNamespace(brandKey)
      showToast('Pinecone 네임스페이스가 초기화됐습니다')
      await loadStatus()
    } catch (err) {
      console.error('Pinecone namespace reset failed:', err)
      showToast(`초기화 실패: ${err.message}`)
    }
  }, [showToast, loadStatus])

  const brands = groupByBrand(products)

  return (
    <ProductsContext.Provider value={{ products, brands, sync, activeJob, status, resetNamespace }}>
      {children}
    </ProductsContext.Provider>
  )
}

export function useProducts() {
  const ctx = useContext(ProductsContext)
  if (!ctx) throw new Error('useProducts must be used within ProductsProvider')
  return ctx
}
