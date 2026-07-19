"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import {
  Clapperboard,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneOff,
  Play,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react"
import { loadYoutubeApi, type YtPlayer } from "@/lib/youtube-api"
import {
  expectedWatchTime,
  type WatchPlaybackState,
  type WatchReactionPayload,
} from "@/lib/watch-together"

const REACTION_EMOJIS = ["❤️", "😂", "🔥", "👏", "😮", "😍", "🎉", "😢"]

type FloatingReaction = WatchReactionPayload & { createdAt: number }

type SharedCallUi = {
  phase: "outgoing" | "connecting" | "connected"
  peerName: string
  seconds: number
  muted: boolean
  onToggleMute: () => void
  onHangup: () => void
}

type Props = {
  videoId: string
  hostName: string
  conversationLabel: string
  floatingReactions: FloatingReaction[]
  onClose: () => void
  onEndWatch: () => void
  onReaction: (emoji: string) => void
  onPublishSync: (state: Omit<WatchPlaybackState, "by">) => void
  registerPlayerBridge: (
    bridge: {
      getPlayback: () => WatchPlaybackState | null
      applySync: (state: WatchPlaybackState) => void
    } | null,
  ) => void
  /** Private chats only — start a voice call while watching */
  onStartSharedCall?: () => void
  sharedCall?: SharedCallUi | null
}

export function WatchOverlay({
  videoId,
  hostName,
  conversationLabel,
  floatingReactions,
  onClose,
  onEndWatch,
  onReaction,
  onPublishSync,
  registerPlayerBridge,
  onStartSharedCall,
  sharedCall,
}: Props) {
  const reactId = useId().replace(/:/g, "")
  const containerId = `yt-watch-${reactId}`
  const playerRef = useRef<YtPlayer | null>(null)
  const applyingRemoteRef = useRef(false)
  const lastPublishRef = useRef(0)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)

  const publishNow = useCallback(
    (override?: Partial<Pick<WatchPlaybackState, "playing" | "t">>) => {
      const player = playerRef.current
      if (!player || applyingRemoteRef.current) return
      const now = Date.now()
      if (now - lastPublishRef.current < 120) return
      lastPublishRef.current = now
      let t = 0
      let isPlaying = playing
      try {
        t = player.getCurrentTime()
        const state = player.getPlayerState()
        isPlaying = state === 1
      } catch {
        return
      }
      onPublishSync({
        videoId,
        playing: override?.playing ?? isPlaying,
        t: override?.t ?? t,
        at: now,
      })
    },
    [onPublishSync, playing, videoId],
  )

  const applySync = useCallback(
    (state: WatchPlaybackState) => {
      const player = playerRef.current
      if (!player || state.videoId !== videoId) return

      applyingRemoteRef.current = true
      const target = expectedWatchTime(state)
      let current = 0
      try {
        current = player.getCurrentTime()
      } catch {
        applyingRemoteRef.current = false
        return
      }

      if (Math.abs(current - target) > 1.25) {
        try {
          player.seekTo(target, true)
        } catch {
          // ignore
        }
      }

      try {
        const ps = player.getPlayerState()
        if (state.playing && ps !== 1) player.playVideo()
        if (!state.playing && ps === 1) player.pauseVideo()
        setPlaying(state.playing)
      } catch {
        // ignore
      }

      window.setTimeout(() => {
        applyingRemoteRef.current = false
      }, 350)
    },
    [videoId],
  )

  const getPlayback = useCallback((): WatchPlaybackState | null => {
    const player = playerRef.current
    if (!player) return null
    try {
      const t = player.getCurrentTime()
      const ps = player.getPlayerState()
      return {
        videoId,
        playing: ps === 1,
        t,
        at: Date.now(),
        by: "",
      }
    } catch {
      return null
    }
  }, [videoId])

  useEffect(() => {
    registerPlayerBridge({ getPlayback, applySync })
    return () => registerPlayerBridge(null)
  }, [applySync, getPlayback, registerPlayerBridge])

  useEffect(() => {
    let destroyed = false
    let player: YtPlayer | null = null

    void (async () => {
      try {
        const YT = await loadYoutubeApi()
        if (destroyed) return
        player = new YT.Player(containerId, {
          videoId,
          playerVars: {
            autoplay: 1,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            origin: typeof window !== "undefined" ? window.location.origin : undefined,
          },
          events: {
            onReady: (e) => {
              if (destroyed) return
              playerRef.current = e.target
              setReady(true)
              try {
                const data = e.target.getVideoData()
                if (data?.title) setTitle(data.title)
              } catch {
                // ignore
              }
              try {
                e.target.playVideo()
                setPlaying(true)
              } catch {
                // autoplay may be blocked
              }
            },
            onStateChange: (e) => {
              if (destroyed || applyingRemoteRef.current) return
              if (e.data === 1) {
                setPlaying(true)
                publishNow({ playing: true })
              } else if (e.data === 2) {
                setPlaying(false)
                publishNow({ playing: false })
              } else if (e.data === 0) {
                setPlaying(false)
                publishNow({ playing: false })
              }
            },
          },
        })
        playerRef.current = player
      } catch (err) {
        if (!destroyed) {
          setError(err instanceof Error ? err.message : "לא ניתן לטעון את יוטיוב")
        }
      }
    })()

    return () => {
      destroyed = true
      try {
        player?.destroy()
      } catch {
        // ignore
      }
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, videoId])

  useEffect(() => {
    if (!ready || !playing) return
    const id = window.setInterval(() => publishNow(), 4000)
    return () => window.clearInterval(id)
  }, [ready, playing, publishNow])

  const togglePlay = () => {
    const player = playerRef.current
    if (!player) return
    try {
      if (playing) {
        player.pauseVideo()
        setPlaying(false)
        publishNow({ playing: false })
      } else {
        player.playVideo()
        setPlaying(true)
        publishNow({ playing: true })
      }
    } catch {
      // ignore
    }
  }

  const skip = (delta: number) => {
    const player = playerRef.current
    if (!player) return
    try {
      const t = Math.max(0, player.getCurrentTime() + delta)
      player.seekTo(t, true)
      publishNow({ t, playing })
    } catch {
      // ignore
    }
  }

  const callMm = sharedCall ? String(Math.floor(sharedCall.seconds / 60)).padStart(2, "0") : "00"
  const callSs = sharedCall ? String(sharedCall.seconds % 60).padStart(2, "0") : "00"

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#0b141a] text-white pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <header className="flex shrink-0 items-center gap-3 px-4 py-3">
        <Clapperboard className="h-5 w-5 shrink-0 text-[#25d366]" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">צפייה משותפת · {conversationLabel}</h2>
          <p className="truncate text-xs text-white/60">
            {title ?? "יוטיוב"} · התחיל/ה {hostName}
          </p>
        </div>
        {onStartSharedCall && !sharedCall && (
          <button
            type="button"
            onClick={onStartSharedCall}
            className="flex h-10 items-center gap-1.5 rounded-full bg-[#25d366]/20 px-3 text-sm text-[#25d366] transition hover:bg-[#25d366]/30"
            title="פגישה קולית/וידאו בזמן הצפייה"
          >
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">פגישה</span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
          aria-label="יציאה"
          title="יציאה (האחרים ממשיכים)"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {sharedCall && (
        <div className="mx-3 mb-2 flex shrink-0 items-center gap-3 rounded-xl bg-white/10 px-3 py-2">
          <Phone className="h-4 w-4 shrink-0 text-[#25d366]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{sharedCall.peerName}</p>
            <p className="text-xs text-white/60" dir="ltr">
              {sharedCall.phase === "connected"
                ? `${callMm}:${callSs}`
                : sharedCall.phase === "connecting"
                  ? "מתחבר..."
                  : "מתקשר..."}
            </p>
          </div>
          {sharedCall.phase === "connected" && (
            <button
              type="button"
              onClick={sharedCall.onToggleMute}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
              aria-label={sharedCall.muted ? "בטל השתקה" : "השתק"}
            >
              {sharedCall.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={sharedCall.onHangup}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ea0038] transition hover:bg-[#ff2a55]"
            aria-label="נתק"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-3">
        <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-black shadow-2xl">
          <div id={containerId} className="absolute inset-0 h-full w-full [&>iframe]:h-full [&>iframe]:w-full" />
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
              טוען סרטון...
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {floatingReactions.map((r) => (
              <span
                key={r.id}
                className="watch-float absolute text-3xl drop-shadow-lg"
                style={{
                  left: `${12 + (hashStr(r.id) % 76)}%`,
                  bottom: "8%",
                }}
                title={r.byName}
              >
                {r.emoji}
              </span>
            ))}
          </div>
        </div>

        <div className="shrink-0 space-y-3 pb-2 pt-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => skip(-10)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
              aria-label="אחורה 10 שניות"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25d366] text-[#0b141a] transition hover:bg-[#2fe076]"
              aria-label={playing ? "השהה" : "נגן"}
            >
              {playing ? <Pause className="h-6 w-6" /> : <Play className="mr-0.5 h-6 w-6" />}
            </button>
            <button
              type="button"
              onClick={() => skip(10)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
              aria-label="קדימה 10 שניות"
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReaction(emoji)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl transition hover:scale-110 hover:bg-white/20"
                aria-label={`תגובה ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pb-1">
            {onStartSharedCall && !sharedCall && (
              <button
                type="button"
                onClick={onStartSharedCall}
                className="inline-flex items-center gap-2 rounded-full bg-[#25d366]/20 px-4 py-2.5 text-sm font-medium text-[#25d366] transition hover:bg-[#25d366]/30"
              >
                <Phone className="h-4 w-4" />
                פגישה משותפת
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/10 px-4 py-2.5 text-sm transition hover:bg-white/20"
            >
              יציאה
            </button>
            <button
              type="button"
              onClick={onEndWatch}
              className="rounded-full bg-[#ea0038]/25 px-4 py-2.5 text-sm font-medium text-[#ff8a9a] transition hover:bg-[#ea0038]/40"
            >
              סיים צפייה
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
