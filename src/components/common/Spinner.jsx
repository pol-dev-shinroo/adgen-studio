// Small inline loading ring, no external dependency — used both standalone
// (via PageLoader) and inline next to a button's "...중" label text, so the
// app's loading language is consistent everywhere instead of relying on
// text alone.
export default function Spinner({ size = 'sm', style }) {
  const dim = size === 'md' ? 22 : 14
  const border = size === 'md' ? 3 : 2

  return (
    <span
      className="spinner"
      style={{ width: dim, height: dim, borderWidth: border, ...style }}
      aria-hidden="true"
    />
  )
}
