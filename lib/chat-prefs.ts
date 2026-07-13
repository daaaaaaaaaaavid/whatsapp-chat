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
}

function key(userId: string) {
  return `wa-chat-prefs:${userId}`
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
    }
  } catch {
    return { ...EMPTY, reactions: {} }
  }
}

export function saveChatPrefs(userId: string, prefs: ChatPrefs) {
  if (typeof window === "undefined") return
  localStorage.setItem(key(userId), JSON.stringify(prefs))
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
