/** Persist ended Watch Together sessions so Join stays disabled after reload. */

const STORAGE_KEY = "whachat-watch-closed-v1"

type ClosedMap = Record<string, number>

function key(conversationId: string, videoId: string) {
  return `${conversationId}:${videoId}`
}

function load(): ClosedMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ClosedMap
  } catch {
    return {}
  }
}

function save(map: ClosedMap) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota
  }
}

export function markWatchSessionClosed(conversationId: string, videoId: string) {
  const map = load()
  map[key(conversationId, videoId)] = Date.now()
  save(map)
}

export function isWatchSessionClosed(conversationId: string, videoId: string): boolean {
  return Boolean(load()[key(conversationId, videoId)])
}
