import type { Conversation, Message } from "@/lib/types"
import { callSystemLabel, parseCallSystemPayload } from "@/lib/call-system-message"
import { plainMessageText } from "@/lib/message-formatting"
import { parsePollPayload, pollPreviewLabel } from "@/lib/poll"
import { parseWatchSystemPayload, watchSystemLabel } from "@/lib/watch-system-message"
import { parseMeetingSystemPayload, meetingSystemLabel } from "@/lib/meeting-system-message"
import { viewOncePreviewLabel } from "@/lib/view-once"

/** Non-group chat with only the current user (notes / message yourself). */
export function isSelfConversation(conv: Conversation, currentUserId: string): boolean {
  if (conv.is_group) return false
  const parts = conv.participants ?? []
  if (parts.length === 0) return false
  return parts.every((p) => p.user_id === currentUserId)
}

export function convDisplayName(conv: Conversation, currentUserId: string): string {
  if (conv.is_group) return conv.name ?? "קבוצה"
  if (isSelfConversation(conv, currentUserId)) return "הודעה לעצמי"
  const other = conv.participants?.find((p) => p.user_id !== currentUserId)
  return other?.profile?.display_name ?? other?.profile?.email ?? "משתמש"
}

export function convAvatarUrl(conv: Conversation, currentUserId: string): string | null {
  if (conv.is_group) return conv.avatar_url
  if (isSelfConversation(conv, currentUserId)) return null
  const other = conv.participants?.find((p) => p.user_id !== currentUserId)
  return other?.profile?.avatar_url ?? null
}

export function otherParticipantId(conv: Conversation, currentUserId: string): string | null {
  if (conv.is_group) return null
  if (isSelfConversation(conv, currentUserId)) return null
  return conv.participants?.find((p) => p.user_id !== currentUserId)?.user_id ?? null
}

export function messagePreview(msg: Message | null | undefined): string {
  if (!msg) return "אין הודעות עדיין"
  if (msg.deleted_at) return "ההודעה נמחקה"
  const viewOnce = viewOncePreviewLabel(msg)
  if (viewOnce) return viewOnce
  const poll = parsePollPayload(msg.content)
  if (poll || msg.type === "poll") {
    return poll ? pollPreviewLabel(poll) : "📊 סקר"
  }
  const call = parseCallSystemPayload(msg.content)
  const watch = parseWatchSystemPayload(msg.content)
  const meeting = parseMeetingSystemPayload(msg.content)
  if (meeting) return `👥 ${meetingSystemLabel(meeting)}`
  if (watch) return `🎬 ${watchSystemLabel(watch)}`
  if (call || msg.type === "system") {
    return call ? callSystemLabel(call) : (msg.content ?? "הודעת מערכת")
  }
  switch (msg.type) {
    case "image": {
      const caption = msg.content?.replace(/^↩ .+\n/, "").trim()
      return caption ? `📷 ${caption}` : "📷 תמונה"
    }
    case "video": {
      const caption = msg.content?.replace(/^↩ .+\n/, "").trim()
      return caption ? `🎥 ${caption}` : "🎥 סרטון"
    }
    case "audio":
      return "🎵 הודעה קולית"
    case "file":
      return "📎 " + (msg.file_name ?? "קובץ")
    default:
      return plainMessageText(msg.content)
  }
}
