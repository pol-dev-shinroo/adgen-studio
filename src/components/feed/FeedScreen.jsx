import { useState, useEffect } from 'react'
import '../../styles/feed.css'
import SearchBar from './SearchBar.jsx'
import FeedTabs from './FeedTabs.jsx'
import BrandFilterBar from './BrandFilterBar.jsx'
import AdGrid from './AdGrid.jsx'
import CollectedResults from './CollectedResults.jsx'
import AdDetailModal from './AdDetailModal.jsx'
import { useAds } from '../../context/AdsContext.jsx'

export default function FeedScreen() {
  const { ads, collected } = useAds()
  const [tab, setTab] = useState('archive')
  const [selectedAd, setSelectedAd] = useState(null)

  // Mirrors the mockup's behavior of jumping to the "collected" tab as soon
  // as a real-time collection run finishes.
  useEffect(() => {
    if (collected.length > 0) setTab('collected')
  }, [collected])

  return (
    <section>
      <div className="head">
        <div>
          <h1>경쟁사 광고 피드</h1>
          <p className="sub">브랜드명 또는 AD ID로 검색해 실시간 수집 · 이미지/동영상 모두 브랜드별 아카이빙</p>
        </div>
      </div>
      <SearchBar />
      <FeedTabs tab={tab} onChange={setTab} archiveCount={ads.length} collectedCount={collected.length} />
      {tab === 'archive' ? (
        <div>
          <BrandFilterBar />
          <AdGrid onOpenDetail={setSelectedAd} />
        </div>
      ) : (
        <CollectedResults onOpenDetail={setSelectedAd} />
      )}
      {selectedAd && <AdDetailModal ad={selectedAd} onClose={() => setSelectedAd(null)} />}
    </section>
  )
}
