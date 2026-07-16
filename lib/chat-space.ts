import type { ChatPrefs } from "@/lib/chat-prefs"

export type ChatSpace = "personal" | "work"

export const SPACE_LABELS: Record<ChatSpace, string> = {
  personal: "אישי",
  work: "עבודה",
}

/** Default: after 18:00 until 08:00 — work notifications stay quiet. */
export const DEFAULT_WORK_QUIET = {
  enabled: true,
  start: "18:00",
  end: "08:00",
} as const

export function conversationSpace(
  prefs: ChatPrefs,
  conversationId: string,
  workSpaceId?: string | null,
): ChatSpace {
  if (workSpaceId) return "work"
  return prefs.workConversations.includes(conversationId) ? "work" : "personal"
}

export function setConversationSpace(
  prefs: ChatPrefs,
  conversationId: string,
  space: ChatSpace,
): ChatPrefs {
  const inWork = prefs.workConversations.includes(conversationId)
  if (space === "work" && !inWork) {
    return { ...prefs, workConversations: [...prefs.workConversations, conversationId] }
  }
  if (space === "personal" && inWork) {
    return {
      ...prefs,
      workConversations: prefs.workConversations.filter((id) => id !== conversationId),
    }
  }
  return prefs
}

export function filterConversationsBySpace<
  T extends { id: string; work_space_id?: string | null },
>(conversations: T[], prefs: ChatPrefs, space: ChatSpace): T[] {
  return conversations.filter(
    (c) => conversationSpace(prefs, c.id, c.work_space_id) === space,
  )
}

export function unreadInSpace(
  conversations: { id: string; unread_count?: number; work_space_id?: string | null }[],
  prefs: ChatPrefs,
  space: ChatSpace,
): number {
  return filterConversationsBySpace(conversations, prefs, space).reduce(
    (sum, c) => sum + (c.unread_count ?? 0),
    0,
  )
}

/** Minutes from midnight for "HH:MM" (local). */
function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return h * 60 + min
}

/** True when local time is inside quiet window (supports overnight ranges). */
export function isWithinQuietHours(
  startHm: string,
  endHm: string,
  now = new Date(),
): boolean {
  const start = parseHm(startHm)
  const end = parseHm(endHm)
  if (start == null || end == null) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  if (start === end) return true
  if (start < end) return mins >= start && mins < end
  // Overnight: e.g. 18:00 → 08:00
  return mins >= start || mins < end
}

export function isWorkQuietHoursActive(prefs: ChatPrefs, now = new Date()): boolean {
  if (!prefs.workQuietHoursEnabled) return false
  return isWithinQuietHours(prefs.workQuietStart, prefs.workQuietEnd, now)
}

/**
 * Should we suppress sound/toast for this conversation given active space + quiet hours?
 * - In personal mode: suppress work chats (and always during work quiet hours).
 * - In work mode: suppress personal chats so focus stays on work.
 */
export function shouldSuppressSpaceNotification(
  prefs: ChatPrefs,
  conversationId: string,
  now = new Date(),
  workSpaceId?: string | null,
): boolean {
  const space = conversationSpace(prefs, conversationId, workSpaceId)
  const active = prefs.activeSpace

  if (space === "work") {
    if (active !== "work") return true
    if (isWorkQuietHoursActive(prefs, now)) return true
    return false
  }

  // personal
  return active === "work"
}
