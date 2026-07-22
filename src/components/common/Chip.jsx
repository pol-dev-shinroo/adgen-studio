export default function Chip({ active, onClick, children }) {
  const cls = ['chip', active && 'on'].filter(Boolean).join(' ')
  return (
    <span className={cls} onClick={onClick}>
      {children}
    </span>
  )
}
