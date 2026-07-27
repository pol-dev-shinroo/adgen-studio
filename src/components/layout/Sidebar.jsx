import { useNavigation } from '../../context/NavigationContext.jsx'

const NAV_ITEMS = [
  { key: 'feed', icon: '📡', label: '경쟁사 광고 피드' },
  { key: 'products', icon: '🗂️', label: '상품 관리' },
  { key: 'references', icon: '🖼️', label: '추출 참조 이미지' },
  { key: 'studio', icon: '✨', label: '생성 스튜디오' },
  { key: 'gallery', icon: '🖼️', label: '결과 갤러리' },
  { key: 'settings', icon: '⚙️', label: '설정' },
]

export default function Sidebar() {
  const { screen, go } = useNavigation()
  return (
    <aside>
      <div className="logo">Ad<span>Gen</span> Studio</div>
      <div className="nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={screen === item.key ? 'on' : ''}
            onClick={() => go(item.key)}
          >
            <span className="ic">{item.icon}</span>{item.label}
          </button>
        ))}
      </div>
    </aside>
  )
}
