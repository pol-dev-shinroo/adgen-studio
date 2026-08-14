// Copies text to the clipboard via the Clipboard API, falling back to a
// temporary offscreen textarea + document.execCommand('copy') for contexts
// where navigator.clipboard is unavailable (non-HTTPS, permissions denied,
// older browsers). Returns true on success, false on failure — callers
// decide what to show the user (a confirmation toast vs. an error toast).
export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Falls through to the execCommand fallback below.
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
