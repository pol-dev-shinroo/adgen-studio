import Spinner from './Spinner.jsx'

// Centered block-level loading state for a whole screen/section — what
// Category 1 screens (AdGrid, ProductBrowser, ReferenceImagesScreen,
// GalleryScreen) show in place of their "no data yet" empty-state message
// while the initial mount fetch is still in flight, so that message doesn't
// flash briefly before real data arrives.
export default function PageLoader({ label = '불러오는 중...' }) {
  return (
    <div className="page-loader">
      <Spinner size="md" />
      <p className="sub">{label}</p>
    </div>
  )
}
