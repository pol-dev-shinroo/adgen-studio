export default function N8nIntegrationCard() {
  return (
    <div className="card set-sect">
      <div className="sect">n8n 연동</div>
      <div className="row">
        <div>
          <div className="t">웹훅 Base URL</div>
          <div className="d">https://n8n.healthykiki.com/webhook</div>
        </div>
        <span className="status-ok">● 정상</span>
      </div>
    </div>
  )
}
