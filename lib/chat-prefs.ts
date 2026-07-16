import type { ChatSpace } from "@/lib/chat-space"
import { DEFAULT_WORK_QUIET } from "@/lib/chat-space"

export type ChatPrefs = {
  archived: string[]
  favorites: string[]
  pinned: string[]
  muted: string[]
  /** Message IDs starred by this user */
  starredMessages: string[]
  /** Message IDs pinned in a conversation (local) */
  pinnedMessages: string[]
  /** Message IDs hidden for me only */
  hiddenMessages: string[]
  /** messageId -> emoji chosen by this user (local until DB reactions exist) */
  reactions: Record<string, string>
  /**
   * Conversation IDs tagged as Work for this user only.
   * Untagged = Personal. Same conversation row — no duplicated messages/storage.
   */
  workConversations: string[]
  /** Which inbox the user is viewing */
  activeSpace: ChatSpace
  /** When true, Work notifications are silenced during quiet hours */
  workQuietHoursEnabled: boolean
  workQuietStart: string
  workQuietEnd: string
}

const EMPTY: ChatPrefs = {
  archived: [],
  favorites: [],
  pinned: [],
  muted: [],
  starredMessages: [],
  pinnedMessages: [],
  hiddenMessages: [],
  reactions: {},
  workConversations: [],
  activeSpace: "personal",
  workQuietHoursEnabled: DEFAULT_WORK_QUIET.enabled,
  workQuietStart: DEFAULT_WORK_QUIET.start,
  workQuietEnd: DEFAULT_WORK_QUIET.end,
}

function key(userId: string) {
  return `wa-chat-prefs:${userId}`
}

function normalizeSpace(value: unknown): ChatSpace {
  return value === "work" ? "work" : "personal"
}

function normalizeHm(value: unknown, fallback: string): string {
  return typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value.trim()) ? value.trim() : fallback
}

export function loadChatPrefs(userId: string): ChatPrefs {
  if (typeof window === "undefined") return { ...EMPTY, reactions: {} }
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return { ...EMPTY, reactions: {} }
    const parsed = JSON.parse(raw) as Partial<ChatPrefs>
    return {
      archived: Array.isArray(parsed.archived) ? parsed.archived : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      muted: Array.isArray(parsed.muted) ? parsed.muted : [],
      starredMessages: Array.isArray(parsed.starredMessages) ? parsed.starredMessages : [],
      pinnedMessages: Array.isArray(parsed.pinnedMessages) ? parsed.pinnedMessages : [],
      hiddenMessages: Array.isArray(parsed.hiddenMessages) ? parsed.hiddenMessages : [],
      reactions:
        parsed.reactions && typeof parsed.reactions === "object" && !Array.isArray(parsed.reactions)
          ? parsed.reactions
          : {},
      workConversations: Array.isArray(parsed.workConversations) ? parsed.workConversations : [],
      activeSpace: normalizeSpace(parsed.activeSpace),
      workQuietHoursEnabled:
        typeof parsed.workQuietHoursEnabled === "boolean"
          ? parsed.workQuietHoursEnabled
          : DEFAULT_WORK_QUIET.enabled,
      workQuietStart: normalizeHm(parsed.workQuietStart, DEFAULT_WORK_QUIET.start),
      workQuietEnd: normalizeHm(parsed.workQuietEnd, DEFAULT_WORK_QUIET.end),
    }
  } catch {
    return { ...EMPTY, reactions: {} }
  }
}

export function saveChatPrefs(userId: string, prefs: ChatPrefs) {
  if (typeof window === "undefined") return
  localStorage.setItem(key(userId), JSON.stringify(prefs))
  // Best-effort sync to Supabase (requires migration-invites-prefs.sql)
  void import("@/lib/supabase/client")
    .then(({ createClient }) => {
      const supabase = createClient()
      return supabase
        .from("profiles")
        .update({
          chat_prefs: {
            archived: prefs.archived,
            favorites: prefs.favorites,
            pinned: prefs.pinned,
            muted: prefs.muted,
            starredMessages: prefs.starredMessages,
            pinnedMessages: prefs.pinnedMessages,
            hiddenMessages: prefs.hiddenMessages,
            reactions: prefs.reactions,
            workConversations: prefs.workConversations,
            activeSpace: prefs.activeSpace,
            workQuietHoursEnabled: prefs.workQuietHoursEnabled,
            workQuietStart: prefs.workQuietStart,
            workQuietEnd: prefs.workQuietEnd,
          },
        })
        .eq("id", userId)
    })
    .catch(() => {})
}

/** Merge remote prefs from profiles.chat_prefs over local storage. */
export function mergeRemoteChatPrefs(userId: string, remote: Partial<ChatPrefs> | null | undefined): ChatPrefs {
  const local = loadChatPrefs(userId)
  if (!remote || typeof remote !== "object") return local
  const merged: ChatPrefs = {
    archived: Array.isArray(remote.archived) ? remote.archived : local.archived,
    favorites: Array.isArray(remote.favorites) ? remote.favorites : local.favorites,
    pinned: Array.isArray(remote.pinned) ? remote.pinned : local.pinned,
    muted: Array.isArray(remote.muted) ? remote.muted : local.muted,
    starredMessages: Array.isArray(remote.starredMessages) ? remote.starredMessages : local.starredMessages,
    pinnedMessages: Array.isArray(remote.pinnedMessages) ? remote.pinnedMessages : local.pinnedMessages,
    hiddenMessages: Array.isArray(remote.hiddenMessages) ? remote.hiddenMessages : local.hiddenMessages,
    reactions:
      remote.reactions && typeof remote.reactions === "object" && !Array.isArray(remote.reactions)
        ? remote.reactions
        : local.reactions,
    workConversations: Array.isArray(remote.workConversations)
      ? remote.workConversations
      : local.workConversations,
    activeSpace:
      remote.activeSpace === "work" || remote.activeSpace === "personal"
        ? remote.activeSpace
        : local.activeSpace,
    workQuietHoursEnabled:
      typeof remote.workQuietHoursEnabled === "boolean"
        ? remote.workQuietHoursEnabled
        : local.workQuietHoursEnabled,
    workQuietStart: normalizeHm(remote.workQuietStart, local.workQuietStart),
    workQuietEnd: normalizeHm(remote.workQuietEnd, local.workQuietEnd),
  }
  localStorage.setItem(key(userId), JSON.stringify(merged))
  return merged
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

export function toggleArchived(prefs: ChatPrefs, id: string): ChatPrefs {
  return { ...prefs, archived: toggleId(prefs.archived, id) }
}

export function toggleFavorite(prefs: ChatPrefs, id: string): ChatPrefs {
  return { ...prefs, favorites: toggleId(prefs.favorites, id) }
}

export function togglePinned(prefs: ChatPrefs, id: string): ChatPrefs {
  return { ...prefs, pinned: toggleId(prefs.pinned, id) }
}

export function toggleMuted(prefs: ChatPrefs, id: string): ChatPrefs {
  return { ...prefs, muted: toggleId(prefs.muted, id) }
}

export function toggleStarredMessage(prefs: ChatPrefs, messageId: string): ChatPrefs {
  return { ...prefs, starredMessages: toggleId(prefs.starredMessages, messageId) }
}

export function togglePinnedMessage(prefs: ChatPrefs, messageId: string): ChatPrefs {
  return { ...prefs, pinnedMessages: toggleId(prefs.pinnedMessages, messageId) }
}

export function hideMessageForMe(prefs: ChatPrefs, messageId: string): ChatPrefs {
  if (prefs.hiddenMessages.includes(messageId)) return prefs
  return { ...prefs, hiddenMessages: [...prefs.hiddenMessages, messageId] }
}

export function setMessageReaction(prefs: ChatPrefs, messageId: string, emoji: string | null): ChatPrefs {
  const next = { ...prefs.reactions }
  if (!emoji) delete next[messageId]
  else next[messageId] = emoji
  return { ...prefs, reactions: next }
}
