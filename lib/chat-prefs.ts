export type ChatPrefs = {
  archived: string[]
  favorites: string[]
  pinned: string[]
}

const EMPTY: ChatPrefs = { archived: [], favorites: [], pinned: [] }

function key(userId: string) {
  return `wa-chat-prefs:${userId}`
}

export function loadChatPrefs(userId: string): ChatPrefs {
  if (typeof window === "undefined") return { ...EMPTY }
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<ChatPrefs>
    return {
      archived: Array.isArray(parsed.archived) ? parsed.archived : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
    }
  } catch {
    return { ...EMPTY }
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
