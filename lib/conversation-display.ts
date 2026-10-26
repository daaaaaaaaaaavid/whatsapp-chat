import type { Conversation, Message } from "@/lib/types"
import { isValidEmail } from "@/lib/validation"
import { callSystemLabel, parseCallSystemPayload } from "@/lib/call-system-message"
import { plainMessageText } from "@/lib/message-formatting"
import { parsePollPayload, pollPreviewLabel } from "@/lib/poll"
import { parseContactPayload, contactPreviewLabel } from "@/lib/contact-message"
import { parseEventPayload, eventPreviewLabel } from "@/lib/event-message"
import { isStickerMessage, stickerPreviewLabel } from "@/lib/sticker-message"
import { parseWatchSystemPayload, watchSystemLabel } from "@/lib/watch-system-message"
import { parseMeetingSystemPayload, meetingSystemLabel } from "@/lib/meeting-system-message"
import { viewOncePreviewLabel } from "@/lib/view-once"

/** Email this direct chat is waiting on, when the other person has no account yet. */
export function emailHeldAddress(
  conv: Pick<Conversation, "is_group" | "name" | "pending_email">,
): string | null {
  const pending = conv.pending_email?.trim()
  if (pending && isValidEmail(pending)) return pending
  if (conv.is_group) return null
  const name = conv.name?.trim() ?? ""
  return isValidEmail(name) ? name : null
}

/** Non-group chat with only the current user (notes / message yourself). */
export function isSelfConversation(conv: Conversation, currentUserId: string): boolean {
  if (conv.is_group) return false
  const parts = conv.participants ?? []
  if (parts.length === 0) return false
  if (!parts.every((p) => p.user_id === currentUserId)) return false
  if (emailHeldAddress(conv)) return false
  return true
}

export function convDisplayName(conv: Conversation, currentUserId: string): string {
  if (conv.is_group) return conv.name ?? "קבוצה"
  if (isSelfConversation(conv, currentUserId)) return "הודעה לעצמי"
  const other = conv.participants?.find((p) => p.user_id !== currentUserId)
  if (other) return other.profile?.display_name ?? other.profile?.email ?? "משתמש"
  return emailHeldAddress(conv) ?? "משתמש"
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
  if (isStickerMessage(msg)) return stickerPreviewLabel()
  const poll = parsePollPayload(msg.content)
  if (poll || msg.type === "poll") {
    return poll ? pollPreviewLabel(poll) : "📊 סקר"
  }
  const contact = parseContactPayload(msg.content)
  if (contact || msg.type === "contact") {
    return contact ? contactPreviewLabel(contact) : "👤 איש קשר"
  }
  const event = parseEventPayload(msg.content)
  if (event || msg.type === "event") {
    return event ? eventPreviewLabel(event) : "📅 אירוע"
  }
  const call = parseCallSystemPayload(msg.content)
  const watch = parseWatchSystemPayload(msg.content)
  const meeting = parseMeetingSystemPayload(msg.content)
  if (meeting) return meetingSystemLabel(meeting)
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
    case "sticker":
      return stickerPreviewLabel()
    default:
      return plainMessageText(msg.content)
  }
}
