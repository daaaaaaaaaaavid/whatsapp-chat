import type { Message } from "@/lib/types"

export type TickStatus = "sending" | "sent" | "delivered" | "read"

/** Derive WhatsApp-style ticks for an outgoing message. */
export function messageTickStatus(
  message: Message | null | undefined,
  totalOthers: number,
): TickStatus {
  if (!message) return "delivered"
  if (message.id.startsWith("temp-") || message.pending) return "sending"
  const readCount = (message.reads ?? []).filter((r) => r.user_id !== message.sender_id).length
  if (readCount > 0) {
    return readCount >= totalOthers && totalOthers > 0 ? "read" : "delivered"
  }
  // No other participants (e.g. note-to-self) — treat as read.
  if (totalOthers <= 0) return "read"
  // Successfully sent: show delivered ticks, not a single "unread" check.
  return "delivered"
}
