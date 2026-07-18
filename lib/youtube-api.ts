"use client"

type YtPlayer = {
  destroy: () => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getPlayerState: () => number
  getVideoData: () => { title?: string; video_id?: string }
}

type YtPlayerVars = {
  autoplay?: number
  controls?: number
  rel?: number
  modestbranding?: number
  playsinline?: number
  origin?: string
}

type YtNamespace = {
  Player: new (
    elementId: string,
    opts: {
      videoId: string
      playerVars?: YtPlayerVars
      events?: {
        onReady?: (e: { target: YtPlayer }) => void
        onStateChange?: (e: { data: number; target: YtPlayer }) => void
      }
    },
  ) => YtPlayer
  PlayerState: {
    UNSTARTED: number
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}

declare global {
  interface Window {
    YT?: YtNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YtNamespace> | null = null

export function loadYoutubeApi(): Promise<YtNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API is browser-only"))
  }
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error("YouTube API failed to load"))
    }

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      tag.async = true
      tag.onerror = () => reject(new Error("Failed to load YouTube iframe API"))
      document.head.appendChild(tag)
    }

    // Already loading / loaded but callback not fired yet
    const check = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(check)
        resolve(window.YT)
      }
    }, 50)
    window.setTimeout(() => {
      window.clearInterval(check)
    }, 15000)
  })

  return apiPromise
}

export type { YtPlayer, YtNamespace }
