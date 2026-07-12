import type { Conversation, Message } from "@/lib/types"

export function convDisplayName(conv: Conversation, currentUserId: string): string {
  if (conv.is_group) return conv.name ?? "קבוצה"
  const other = conv.participants?.find((p) => p.user_id !== currentUserId)
  return other?.profile?.display_name ?? other?.profile?.email ?? "משתמש"
}

export function convAvatarUrl(conv: Conversation, currentUserId: string): string | null {
  if (conv.is_group) return conv.avatar_url
  const other = conv.participants?.find((p) => p.user_id !== currentUserId)
  return other?.profile?.avatar_url ?? null
}

export function otherParticipantId(conv: Conversation, currentUserId: string): string | null {
  if (conv.is_group) return null
  return conv.participants?.find((p) => p.user_id !== currentUserId)?.user_id ?? null
}

export function messagePreview(msg: Message | null | undefined): string {
  if (!msg) return "אין הודעות עדיין"
  switch (msg.type) {
    case "image":
      return "📷 תמונה"
    case "video":
      return "🎥 סרטון"
    case "audio":
      return "🎵 הודעה קולית"
    case "file":
      return "📎 " + (msg.file_name ?? "קובץ")
    default:
      return msg.content ?? ""
  }
}
