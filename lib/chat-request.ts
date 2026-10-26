import type { Conversation } from "@/lib/types"
import { emailHeldAddress } from "@/lib/conversation-display"

export type ChatRequestView = "none" | "outgoing" | "incoming" | "declined" | "hidden"

type RequestConversation = Pick<
  Conversation,
  "is_group" | "created_by" | "request_status" | "participants" | "name" | "pending_email"
>

/** How this direct chat should look for the signed-in user. Groups and self-notes are normal chats. */
export function chatRequestView(conv: RequestConversation, currentUserId: string): ChatRequestView {
  if (conv.is_group) return "none"
  const parts = conv.participants ?? []
  const solo = parts.length > 0 && parts.every((p) => p.user_id === currentUserId)
  if (solo && !emailHeldAddress(conv)) return "none"

  const status = conv.request_status ?? (solo ? "pending" : "accepted")
  if (status !== "pending" && status !== "declined") return "none"

  const mine = conv.created_by === currentUserId
  if (status === "declined") return mine ? "declined" : "hidden"
  return mine ? "outgoing" : "incoming"
}

/** Composer stays open so either person can write. Closing a request is separate. */
export function canComposeInConversation(conv: RequestConversation, currentUserId: string): boolean {
  const view = chatRequestView(conv, currentUserId)
  return view === "none" || view === "outgoing" || view === "incoming"
}
