import { useNavigation } from '../../context/NavigationContext.jsx'

export default function BrandSyncRow({ name, desc }) {
  const { showToast } = useNavigation()
  return (
    <div className="row">
      <div>
        <div className="t">{name}</div>
        <div className="d">{desc}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="status-ok">● 연결됨</span>
        <button className="btn ghost sm" onClick={() => showToast('자사몰 API 재동기화를 시작합니다')}>↻ 동기화</button>
      </div>
    </div>
  )
}
