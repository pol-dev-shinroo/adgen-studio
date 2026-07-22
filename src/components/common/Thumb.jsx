export default function Thumb({ gradient, className, children }) {
  const cls = ['thumb', gradient, className].filter(Boolean).join(' ')
  return <div className={cls}>{children}</div>
}
