import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useNavigation } from './NavigationContext.jsx'
import {
  getProducts, startProductSync, getProductSyncStatus,
  getProductStatus, resetPineconeNamespace, extractProductImage,
  updateProductFields as updateProductFieldsApi,
} from '../api/backendClient.js'
import { adaptProduct } from '../api/adaptProduct.js'
import { useJobPolling } from '../hooks/useJobPolling.js'

const ProductsContext = createContext(null)

// The two Cafe24 malls this app syncs. Fixed in code rather than fetched
// from the backend, same as backend/src/config/index.js's BRAND_DEFS — the
// brand roster itself doesn't change at runtime, only whether each one has
// credentials configured.
const BRAND_DEFS = [
  { key: 'healthykiki', name: '헬시키키', color: '#5b5bd6' },
  { key: 'kikibeauty', name: '키키뷰티', color: '#d6a15b' },
]

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
        // Raw (unformatted) values, for Step 3's editable fields — *Raw is
        // the plain synced value, *OverrideRaw is blank unless the user has
        // saved an override (see adaptProduct.js for the effective-value
        // precedence this mirrors).
        priceRaw: p.raw['Price'] || '',
        priceOverrideRaw: p.priceOverrideRaw,
        promotionInfo: p.promotionInfo,
        promotionInfoOverrideRaw: p.promotionInfoOverrideRaw,
        adHookCopy: p.adHookCopy,
        adHookCopyOverrideRaw: p.adHookCopyOverrideRaw,
        imageUrl: p.primaryImage,
        extractedReferences: p.extractedReferences,
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
  // BB-3: one useJobPolling slot PER brand (BRAND_DEFS is a fixed,
  // module-level 2-entry list, so calling the hook a fixed number of times
  // — never in a loop over a value that could change length — is safe)
  // instead of one shared slot for every brand. Before this, starting a
  // sync for one brand's `run()` would overwrite the single activeJob state
  // a second brand's `run()` was also writing to, and the button that
  // starts ANY sync was disabled by `!!activeJob` regardless of which
  // brand — so two brands could never actually sync in parallel even
  // though the backend already runs each startSync call as its own
  // independent job (confirmed: jobStore.js's Map has no per-brand lock).
  const healthykikiJobPolling = useJobPolling({ pollIntervalMs: 1200 })
  const kikibeautyJobPolling = useJobPolling({ pollIntervalMs: 1200 })
  const jobPollingByBrand = { healthykiki: healthykikiJobPolling, kikibeauty: kikibeautyJobPolling }
  // brandKey -> job | null — each brand's own progress, independent of the
  // others. getSyncJob(brandKey) below is what components actually consume.
  const syncJobs = {
    healthykiki: healthykikiJobPolling.activeJob,
    kikibeauty: kikibeautyJobPolling.activeJob,
  }
  const getSyncJob = (brandKey) => syncJobs[brandKey] ?? null
  const [status, setStatus] = useState({ brands: [], productSyncConfigured: false })
  // Product IDs currently mid-extraction — a Set rather than one boolean
  // since 상품관리 and Step 3 could both show the same product's button.
  const [extractingIds, setExtractingIds] = useState(() => new Set())
  // Scoped strictly to the mount-time fetch below, not later re-fetches
  // after a sync job finishes — those are already covered by SyncProgress.
  const [productsLoading, setProductsLoading] = useState(true)
  // BB-5: lifted from ProductBrowser.jsx's own local useState — App.jsx
  // unmounts 상품 관리 entirely on nav-away, so a search/filter typed there
  // was lost on Feed -> Studio -> back to 상품 관리, same class of bug
  // AdsContext's feedTab/collectQuery/collectLimit fix.
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [productBrandFilter, setProductBrandFilter] = useState('전체')

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
      .finally(() => {
        if (!cancelled) setProductsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Runs a real product sync job against the backend: starts it, polls
  // until done/failed, then re-fetches the full product list. Mirrors
  // AdsContext's collect() job-polling shape (both now share useJobPolling).
  const sync = useCallback((brandKey) => {
    const polling = jobPollingByBrand[brandKey]
    if (!polling) return
    polling.run({
      initialJob: {
        brandKey,
        status: 'running',
        progress: { phase: 'fetching', totalProducts: 0, productsProcessed: 0, recentItems: [] },
      },
      start: async () => (await startProductSync(brandKey)).jobId,
      // brandKey isn't part of the job status response itself, so it's
      // merged back in on every poll — mostly redundant now that each
      // brand has its own polling slot (getSyncJob(brandKey) already knows
      // which brand it's looking at), but kept since SyncProgress/other
      // consumers still read job.brandKey directly off the job object.
      getStatus: async (jobId) => ({ ...(await getProductSyncStatus(jobId)), brandKey }),
      onFailed: (job) => {
        showToast(`동기화 실패: ${job.error || '알 수 없는 오류'}`)
      },
      onDone: async (job) => {
        const { products: refreshed } = await getProducts()
        setProducts(refreshed.map(adaptProduct))
        await loadStatus()
        // AA-4: a product whose analysis-relevant fields haven't changed
        // since its last sync skips the real analyze/embed/Pinecone-upsert
        // calls — surfaced here so "동기화 완료: 0건 성공" doesn't read as
        // if nothing happened when everything was actually just unchanged.
        showToast(
          `동기화 완료: ${job.summary.synced}건 성공` +
          (job.summary.skipped ? ` · 변경 없음 ${job.summary.skipped}건` : '') +
          (job.summary.failed ? ` · 실패 ${job.summary.failed}건` : '')
        )
      },
      onError: (err) => {
        console.error('Product sync failed:', err)
        showToast(`동기화 중 오류가 발생했습니다: ${err.message}`)
      },
    })
  }, [showToast, loadStatus, healthykikiJobPolling.run, kikibeautyJobPolling.run])

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

  // Costs 1 detection call + 1 isolation call per detected entity (Part M)
  // server-side — updates just the one product's row in local state on
  // success rather than re-fetching the whole list, since this is fired
  // from a single product's detail view. Merges the raw (unconverted)
  // references the backend returns into the row's raw sheet shape and
  // re-runs adaptProduct on it — same pattern updateProductFields already
  // uses below — so the Drive-webViewLink-to-thumbnail-URL conversion
  // adaptProduct.js applies isn't duplicated here.
  const extractImage = useCallback(async (brandKey, productId, { force = false } = {}) => {
    setExtractingIds((prev) => new Set(prev).add(productId))
    try {
      const result = await extractProductImage(brandKey, productId, { force })
      setProducts((prev) => prev.map((p) => (
        p.id === productId
          ? adaptProduct({ ...p.raw, 'Extracted References JSON': JSON.stringify(result.references) })
          : p
      )))
      // AA-2: a partial failure still saves whatever succeeded rather than
      // discarding everything — surface that explicitly rather than
      // reporting a silent "완료" that hides missing entities.
      if (result.failures?.length > 0) {
        showToast(`참조 이미지 추출 완료 (${result.references.length}개 성공, ${result.failures.length}개 실패)`)
      } else {
        showToast('참조 이미지 추출이 완료됐습니다')
      }
    } catch (err) {
      console.error('Product image extraction failed:', err)
      showToast(`이미지 추출 실패: ${err.message}`)
    } finally {
      setExtractingIds((prev) => {
        const next = new Set(prev)
        next.delete(productId)
        return next
      })
    }
  }, [showToast])

  // Not optimistic beforehand (like extractImage, this updates local state
  // only after the backend confirms the write) — re-runs adaptProduct on
  // the merged raw row rather than hand-rolling the override-precedence
  // logic a second time here.
  const updateProductFields = useCallback(async (brandKey, productId, fields) => {
    try {
      await updateProductFieldsApi(brandKey, productId, fields)
      setProducts((prev) => prev.map((p) => (
        p.id === productId ? adaptProduct({ ...p.raw, ...fields }) : p
      )))
      showToast('제품 정보가 저장됐습니다')
    } catch (err) {
      console.error('Product field update failed:', err)
      showToast(`저장 실패: ${err.message}`)
      throw err
    }
  }, [showToast])

  const brands = groupByBrand(products)

  return (
    <ProductsContext.Provider
      value={{
        products, brands, sync, getSyncJob, status, resetNamespace,
        extractImage, extractingIds, updateProductFields, productsLoading,
        productSearchQuery, setProductSearchQuery, productBrandFilter, setProductBrandFilter,
      }}
    >
      {children}
    </ProductsContext.Provider>
  )
}

export function useProducts() {
  const ctx = useContext(ProductsContext)
  if (!ctx) throw new Error('useProducts must be used within ProductsProvider')
  return ctx
}
