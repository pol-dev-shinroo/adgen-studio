export default function Badge({ variant, className, children }) {
  const cls = ['badge', variant, className].filter(Boolean).join(' ')
  return <span className={cls}>{children}</span>
}
