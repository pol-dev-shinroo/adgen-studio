import { useState, useEffect } from 'react'
import '../../styles/feed.css'
import SearchBar from './SearchBar.jsx'
import FeedTabs from './FeedTabs.jsx'
import BrandFilterBar from './BrandFilterBar.jsx'
import AdGrid from './AdGrid.jsx'
import CollectedResults from './CollectedResults.jsx'
import CollectionProgress from './CollectionProgress.jsx'
import AdDetailModal from './AdDetailModal.jsx'
import { useAds } from '../../context/AdsContext.jsx'

export default function FeedScreen() {
  const { ads, collected, activeJob } = useAds()
  const [tab, setTab] = useState('archive')
  const [selectedAd, setSelectedAd] = useState(null)

  // activeJob is set synchronously the moment "실시간 수집" is clicked (see
  // AdsContext.collect), so switching on it — rather than waiting for
  // `collected` to be populated at the very end — makes the tab change
  // happen in the same render as the click.
  useEffect(() => {
    if (activeJob) setTab('collected')
  }, [activeJob])

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
      ) : activeJob ? (
        <CollectionProgress job={activeJob} />
      ) : (
        <CollectedResults onOpenDetail={setSelectedAd} />
      )}
      {selectedAd && <AdDetailModal ad={selectedAd} onClose={() => setSelectedAd(null)} />}
    </section>
  )
}
