import type { Conversation } from "@/lib/types"

export type ChatRequestView = "none" | "outgoing" | "incoming" | "declined" | "hidden"

type RequestConversation = Pick<
  Conversation,
  "is_group" | "created_by" | "request_status" | "participants"
>

/** How this direct chat should look for the signed-in user. Groups and self-notes are normal chats. */
export function chatRequestView(conv: RequestConversation, currentUserId: string): ChatRequestView {
  if (conv.is_group) return "none"
  const parts = conv.participants ?? []
  if (parts.length > 0 && parts.every((p) => p.user_id === currentUserId)) return "none"

  const status = conv.request_status ?? "accepted"
  if (status !== "pending" && status !== "declined") return "none"

  const mine = conv.created_by === currentUserId
  if (status === "declined") return mine ? "declined" : "hidden"
  return mine ? "outgoing" : "incoming"
}

/** Composer is open for a normal chat, and for the person who sent the request. */
export function canComposeInConversation(conv: RequestConversation, currentUserId: string): boolean {
  const view = chatRequestView(conv, currentUserId)
  return view === "none" || view === "outgoing"
}
