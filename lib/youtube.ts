/** Extract a YouTube video ID from common URL shapes. */
export function parseYoutubeVideoId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  // Bare 11-char id
  if (/^[\w-]{11}$/.test(raw)) return raw

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`)
    const host = url.hostname.replace(/^www\./, "").toLowerCase()

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0]
      return id && /^[\w-]{11}$/.test(id) ? id : null
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = url.searchParams.get("v")
      if (v && /^[\w-]{11}$/.test(v)) return v

      const parts = url.pathname.split("/").filter(Boolean)
      // /embed/ID, /shorts/ID, /live/ID, /v/ID
      if (
        parts.length >= 2 &&
        ["embed", "shorts", "live", "v"].includes(parts[0]) &&
        /^[\w-]{11}$/.test(parts[1])
      ) {
        return parts[1]
      }
    }
  } catch {
    return null
  }

  return null
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function youtubeThumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}
