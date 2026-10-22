/** Plain-text editing helpers for dictation into a textarea. */

const CLING_START = /^[,.;:?!…)\]}%]/

/** Append a spoken piece with natural spacing (no space before punctuation or after a newline). */
export function appendSpoken(base: string, piece: string): string {
  if (!piece) return base
  if (!base) return piece.replace(/^[ \t]+/, "")
  if (piece.startsWith("\n")) return base.replace(/[ \t]+$/, "") + piece
  const trimmedPiece = piece.replace(/^[ \t]+/, "")
  if (CLING_START.test(trimmedPiece)) return base.replace(/[ \t]+$/, "") + trimmedPiece
  if (/[\s([{]$/.test(base)) return base + trimmedPiece
  return `${base} ${trimmedPiece}`
}

export function deleteLastWord(text: string): string {
  return text.replace(/\s*\S+\s*$/, "")
}

export function deleteLastSentence(text: string): string {
  const trimmed = text.replace(/\s+$/, "")
  const body = trimmed.replace(/[.!?…]+$/, "")
  const cut = Math.max(
    body.lastIndexOf("."),
    body.lastIndexOf("!"),
    body.lastIndexOf("?"),
    body.lastIndexOf("…"),
    body.lastIndexOf("\n"),
  )
  return cut >= 0 ? trimmed.slice(0, cut + 1) : ""
}

/** Remove the last dictated chunk if the text still ends with it; otherwise the last sentence. */
export function deleteLastChunk(text: string, chunk: string): string {
  const trimmedChunk = chunk.trim()
  const trimmedText = text.replace(/\s+$/, "")
  if (trimmedChunk && trimmedText.endsWith(trimmedChunk)) {
    return trimmedText.slice(0, trimmedText.length - trimmedChunk.length).replace(/[ \t]+$/, "")
  }
  return deleteLastSentence(text)
}

export function replaceLastWord(text: string, next: string): string {
  const match = text.match(/(\S+)(\s*)$/)
  if (!match || match.index === undefined) return appendSpoken(text, next)
  return text.slice(0, match.index) + next + match[2]
}
