export default function ProductReviewField({ field, onEdit }) {
  const handleEdit = () => {
    const next = window.prompt(
      '값을 수정합니다 (API 원본 위에 오버라이드로 저장 — 재동기화에도 유지):',
      field.options[0]
    )
    if (next && next.trim()) onEdit(next.trim())
  }

  return (
    <div className="pr-field">
      <div className="fl">
        {field.label}{' '}
        {field.options.length > 1 && <span className="multi">{field.options.length}개 옵션</span>}
      </div>
      <div className="fv">
        <span className="opt">
          <b>{field.options[0]}</b>{' '}
          {field.note && (
            <span className="ov" style={field.noteType === 'danger' ? { color: 'var(--red)' } : undefined}>
              ({field.note})
            </span>
          )}
        </span>
        {field.options.slice(1).map((opt, i) => (
          <span key={i} className="opt">{opt}</span>
        ))}
      </div>
      <button className="btn ghost sm" onClick={handleEdit}>수정</button>
    </div>
  )
}
