import { useState } from 'react'
import { useNavigation } from '../../context/NavigationContext.jsx'

const NAV_ITEMS = [
  { key: 'feed', icon: '📡', label: '경쟁사 광고 피드' },
  { key: 'products', icon: '🗂️', label: '상품 관리' },
  { key: 'references', icon: '🖼️', label: '추출 참조 이미지' },
  { key: 'studio', icon: '✨', label: '생성 스튜디오' },
  { key: 'gallery', icon: '🖼️', label: '결과 갤러리' },
  { key: 'settings', icon: '⚙️', label: '설정' },
]

// Below global.css's 720px breakpoint, aside stops occupying permanent
// layout space and becomes an off-canvas drawer instead (main's own
// margin-left drops to 0 there via CSS alone — no JS needed for that part).
// .menu-toggle/.sidebar-backdrop are only ever visible under that same
// breakpoint (display:none above it), so this open state is simply inert
// — and harmless — at desktop widths.
export default function Sidebar() {
  const { screen, go } = useNavigation()
  const [open, setOpen] = useState(false)

  const handleNav = (key) => {
    go(key)
    setOpen(false)
  }

  return (
    <>
      <button className="menu-toggle" onClick={() => setOpen(true)} aria-label="메뉴 열기">☰</button>
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
      <aside className={open ? 'open' : ''}>
        <div className="logo">Ad<span>Gen</span> Studio</div>
        <div className="nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={screen === item.key ? 'on' : ''}
              onClick={() => handleNav(item.key)}
            >
              <span className="ic">{item.icon}</span>{item.label}
            </button>
          ))}
        </div>
      </aside>
    </>
  )
}
