import '../../styles/settings.css'
import N8nIntegrationCard from './N8nIntegrationCard.jsx'

export default function SettingsScreen() {
  return (
    <section>
      <div className="head">
        <div>
          <h1>설정</h1>
          <p className="sub">n8n 연동</p>
        </div>
      </div>

      <N8nIntegrationCard />
    </section>
  )
}
