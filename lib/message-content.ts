import { parseCallSystemPayload, callSystemLabel } from "@/lib/call-system-message"

const URL_RE = /(https?:\/\/[^\s<>"']+)/gi

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE)
  if (!matches) return []
  return Array.from(new Set(matches.map((u) => u.replace(/[.,);]+$/, ""))))
}

export function splitTextWithLinks(text: string): Array<{ type: "text" | "link"; value: string }> {
  const parts: Array<{ type: "text" | "link"; value: string }> = []
  let last = 0
  const re = new RegExp(URL_RE.source, "gi")
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) })
    const raw = m[0]
    const cleaned = raw.replace(/[.,);]+$/, "")
    parts.push({ type: "link", value: cleaned })
    if (cleaned.length < raw.length) {
      parts.push({ type: "text", value: raw.slice(cleaned.length) })
    }
    last = m.index + raw.length
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) })
  return parts.length ? parts : [{ type: "text", value: text }]
}

/** Detect call system payload even when type is wrongly "text". */
export function isCallSystemContent(content: string | null | undefined): boolean {
  return Boolean(parseCallSystemPayload(content))
}

export function displayMessageContent(content: string | null | undefined, type?: string): string {
  const payload = parseCallSystemPayload(content)
  if (payload) return callSystemLabel(payload)
  return content ?? ""
}

export type ReplyQuote = {
  author: string
  preview: string
  body: string
}

/** Parse legacy `↩ author: preview\nbody` reply format. */
export function parseReplyContent(content: string | null | undefined): ReplyQuote | null {
  if (!content) return null
  const m = content.match(/^↩\s+([^:]+):\s*([^\n]*)\n([\s\S]*)$/)
  if (!m) return null
  return { author: m[1].trim(), preview: m[2].trim(), body: m[3] }
}

export function highlightQuery(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const q = query.trim()
  if (!q) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const parts: Array<{ text: string; hit: boolean }> = []
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(needle, i)
    if (idx < 0) {
      parts.push({ text: text.slice(i), hit: false })
      break
    }
    if (idx > i) parts.push({ text: text.slice(i, idx), hit: false })
    parts.push({ text: text.slice(idx, idx + needle.length), hit: true })
    i = idx + needle.length
  }
  return parts
}
