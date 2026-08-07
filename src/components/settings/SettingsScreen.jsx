import '../../styles/settings.css'
import SystemStatusCard from './SystemStatusCard.jsx'

export default function SettingsScreen() {
  return (
    <section>
      <div className="head">
        <div>
          <h1>설정</h1>
          <p className="sub">시스템 연동 상태</p>
        </div>
      </div>

      <SystemStatusCard />
    </section>
  )
}
