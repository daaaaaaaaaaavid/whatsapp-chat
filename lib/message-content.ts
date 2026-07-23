import { parseCallSystemPayload, callSystemLabel } from "@/lib/call-system-message"
import { parseWatchSystemPayload, watchSystemLabel } from "@/lib/watch-system-message"
import { parseMeetingSystemPayload, meetingSystemLabel } from "@/lib/meeting-system-message"

const URL_RE = /(https?:\/\/[^\s<>"']+)/gi
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const LINK_OR_EMAIL_RE = new RegExp(`(${URL_RE.source}|${EMAIL_RE.source})`, "gi")

export type MessageTextPart = {
  type: "text" | "link" | "email"
  value: string
}

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE)
  if (!matches) return []
  return Array.from(new Set(matches.map((u) => u.replace(/[.,);]+$/, ""))))
}

export function splitTextWithLinks(text: string): MessageTextPart[] {
  const parts: MessageTextPart[] = []
  let last = 0
  const re = new RegExp(LINK_OR_EMAIL_RE.source, "gi")
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) })
    const raw = m[0]
    const isLink = /^https?:\/\//i.test(raw)
    const cleaned = raw.replace(/[.,);:!?]+$/, "")
    parts.push({ type: isLink ? "link" : "email", value: cleaned })
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
  const meeting = parseMeetingSystemPayload(content)
  if (meeting) return meetingSystemLabel(meeting)
  const watch = parseWatchSystemPayload(content)
  if (watch) return watchSystemLabel(watch)
  const payload = parseCallSystemPayload(content)
  if (payload) return callSystemLabel(payload)
  if (type === "poll") return "📊 סקר"
  if (type === "contact") return "👤 איש קשר"
  if (type === "event") return "📅 אירוע"
  if (type === "sticker") return "🎨 מדבקה"
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
