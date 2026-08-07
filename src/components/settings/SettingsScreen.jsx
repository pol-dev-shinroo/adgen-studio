import '../../styles/settings.css'
import SystemStatusCard from './SystemStatusCard.jsx'
import CredentialsCard from './CredentialsCard.jsx'
import UserManagementCard from './UserManagementCard.jsx'

export default function SettingsScreen() {
  return (
    <section>
      <div className="head">
        <div>
          <h1>설정</h1>
          <p className="sub">시스템 연동 상태 · 자격 증명 · 사용자 관리</p>
        </div>
      </div>

      <SystemStatusCard />
      <CredentialsCard />
      <UserManagementCard />
    </section>
  )
}
