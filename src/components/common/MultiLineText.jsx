// Renders the "\n"-separated ad titles used across ad/thumbnail cards as <br />-joined lines.
export default function MultiLineText({ text }) {
  const lines = text.split('\n')
  return lines.map((line, i) => (
    <span key={i}>
      {line}
      {i < lines.length - 1 && <br />}
    </span>
  ))
}
