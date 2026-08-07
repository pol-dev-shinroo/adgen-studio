// Part W: was a <span> — no tab stop, no Enter/Space activation, no button
// semantics — despite being the control behind every filter chip and
// format/quantity/hook picker in the app. `.chip`'s own CSS already sets
// every property a native <button> would otherwise differ on (background,
// border, padding, cursor, font), and the app-wide `*{font-family}` reset
// covers the rest, so swapping the element is styling-neutral.
export default function Chip({ active, onClick, children }) {
  const cls = ['chip', active && 'on'].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  )
}
