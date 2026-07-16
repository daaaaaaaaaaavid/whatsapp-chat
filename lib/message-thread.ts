import type { Message } from "@/lib/types"

/** Walk reply_to chain to the top-level message (thread root). */
export function getThreadRootId(
  message: Message,
  byId: Map<string, Message>,
): string {
  let current = message
  const seen = new Set<string>()
  while (current.reply_to_id && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = byId.get(current.reply_to_id)
    if (!parent) break
    current = parent
  }
  return current.id
}

export function buildMessageMap(messages: Message[]): Map<string, Message> {
  return new Map(messages.map((m) => [m.id, m]))
}

/** Replies that belong under a root (excludes the root itself). */
export function getThreadReplies(
  rootId: string,
  messages: Message[],
  byId?: Map<string, Message>,
): Message[] {
  const map = byId ?? buildMessageMap(messages)
  return messages
    .filter((m) => m.id !== rootId && getThreadRootId(m, map) === rootId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

export function countThreadReplies(
  rootId: string,
  messages: Message[],
  byId?: Map<string, Message>,
): number {
  return getThreadReplies(rootId, messages, byId).length
}

/** Top-level messages for the main group stream (thread replies hidden). */
export function filterMainStreamMessages(
  messages: Message[],
  hideThreadReplies: boolean,
): Message[] {
  if (!hideThreadReplies) return messages
  return messages.filter((m) => !m.reply_to_id)
}

export function threadReplyPreview(message: Message): string {
  if (message.deleted_at) return "הודעה שנמחקה"
  if (message.type === "image") return "תמונה"
  if (message.type === "video") return "סרטון"
  if (message.type === "audio") return "הודעה קולית"
  if (message.type === "file") return message.file_name ?? "קובץ"
  if (message.type === "poll") return "📊 סקר"
  const text = (message.content ?? "").trim()
  if (!text) return "הודעה"
  if (text.startsWith("{") && text.includes('"kind":"poll"')) return "📊 סקר"
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}
