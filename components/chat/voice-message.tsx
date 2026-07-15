"use client"

import { useEffect, useRef, useState } from "react"
import { LoaderCircle, Mic, Pause, Play, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCallDuration } from "@/lib/format"
import { createClient } from "@/lib/supabase/client"
import { downloadMediaBlob } from "@/lib/media-url"
import { useSignedMediaUrlControls } from "@/lib/use-signed-media-url"
import { MessageTicks } from "./message-ticks"

/** Deterministic fake waveform bars from a seed (message id). */
function waveformBars(seed: string, count = 36): number[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h)
  const bars: number[] = []
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff
    const v = 0.22 + ((h % 1000) / 1000) * 0.78
    bars.push(v)
  }
  return bars
}

function readFiniteDuration(audio: HTMLAudioElement): number {
  const d = audio.duration
  return Number.isFinite(d) && d > 0 ? d : 0
}

/** Some browsers report Infinity for WebM until we seek to the end once. */
async function resolveDuration(audio: HTMLAudioElement): Promise<number> {
  const immediate = readFiniteDuration(audio)
  if (immediate > 0) return immediate

  return new Promise((resolve) => {
    let settled = false
    const finish = (value: number) => {
      if (settled) return
      settled = true
      audio.removeEventListener("timeupdate", onTimeUpdate)
      resolve(value)
    }
    const onTimeUpdate = () => {
      const d = readFiniteDuration(audio)
      if (d > 0) {
        try {
          audio.currentTime = 0
        } catch {
          // ignore
        }
        finish(d)
      }
    }
    audio.addEventListener("timeupdate", onTimeUpdate)
    try {
      audio.currentTime = 1e101
    } catch {
      finish(0)
      return
    }
    window.setTimeout(() => finish(readFiniteDuration(audio)), 1500)
  })
}

function waitForAudioReady(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= 1 && readFiniteDuration(audio) > 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup()
      resolve()
    }
    const fail = () => {
      cleanup()
      reject(new Error("audio error"))
    }
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", ok)
      audio.removeEventListener("canplay", ok)
      audio.removeEventListener("error", fail)
    }
    audio.addEventListener("loadedmetadata", ok)
    audio.addEventListener("canplay", ok)
    audio.addEventListener("error", fail)
    audio.load()
  })
}

type Props = {
  /** Stored media reference (public-style path URL), not a short-lived signed URL. */
  fileUrl: string
  messageId: string
  isMine: boolean
  timeLabel: string
  status: "sending" | "sent" | "delivered" | "read"
  isGroup?: boolean
  viewCount?: number
  avatarUrl?: string | null
  avatarName?: string | null
}

export function VoiceMessage({
  fileUrl,
  messageId,
  isMine,
  timeLabel,
  status,
  isGroup,
  viewCount,
  avatarUrl,
  avatarName,
}: Props) {
  const { url: signedAvatarUrl } = useSignedMediaUrlControls(avatarUrl)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [buffering, setBuffering] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const bars = waveformBars(messageId)

  const refresh = () => setReloadToken((n) => n + 1)

  useEffect(() => {
    let cancelled = false
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    setReady(false)
    setLoadError(false)
    setPlayError(null)
    setBuffering(true)

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }

    const audio = new Audio()
    audio.preload = "auto"
    audioRef.current = audio

    const onTime = () => setCurrent(audio.currentTime)
    const onEnded = () => {
      setPlaying(false)
      setCurrent(0)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)

    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)

    void (async () => {
      try {
        const supabase = createClient()
        const blob = await downloadMediaBlob(supabase, fileUrl)
        if (cancelled) return
        if (!blob || blob.size === 0) throw new Error("empty media")

        const objectUrl = URL.createObjectURL(blob)
        objectUrlRef.current = objectUrl
        audio.src = objectUrl
        await waitForAudioReady(audio)
        if (cancelled) return
        const d = await resolveDuration(audio)
        if (cancelled) return
        if (d > 0) setDuration(d)
        setReady(true)
        setBuffering(false)
        setLoadError(false)
      } catch (err) {
        console.error("VoiceMessage load failed:", err)
        if (!cancelled) {
          setLoadError(true)
          setReady(false)
          setBuffering(false)
        }
      }
    })()

    return () => {
      cancelled = true
      audio.pause()
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
      audio.removeAttribute("src")
      try {
        audio.load()
      } catch {
        // ignore
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      audioRef.current = null
    }
  }, [fileUrl, reloadToken])

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio || !ready || buffering) {
      if (loadError) refresh()
      return
    }
    if (!audio.paused) {
      audio.pause()
      return
    }
    setPlayError(null)
    try {
      await audio.play()
    } catch (err) {
      console.error("VoiceMessage play failed:", err)
      setLoadError(true)
      setPlayError("לא ניתן לנגן")
      setReady(false)
    }
  }

  const seek = (ratio: number) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const t = Math.max(0, Math.min(1, ratio)) * duration
    audio.currentTime = t
    setCurrent(t)
  }

  const progress = duration > 0 ? current / duration : 0
  const displayDuration = duration > 0 ? duration : 0
  const displayTime = playing || current > 0 ? current : displayDuration
  const busy = buffering

  return (
    <div className="mb-0.5 flex min-w-[240px] max-w-[320px] items-center gap-2 py-0.5" dir="ltr">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--wa-text-secondary)] transition hover:text-[var(--wa-text)] disabled:opacity-50"
        aria-label={playing ? "השהה" : loadError ? "נסה שוב" : "נגן"}
      >
        {busy ? (
          <LoaderCircle className="h-5 w-5 animate-spin" />
        ) : playing ? (
          <Pause className="h-5 w-5 fill-current" />
        ) : (
          <Play className="h-5 w-5 fill-current" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className="relative flex h-8 cursor-pointer items-center gap-[2px]"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            seek((e.clientX - rect.left) / rect.width)
          }}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={displayDuration || 1}
          aria-valuenow={current}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") seek(progress - 0.05)
            if (e.key === "ArrowRight") seek(progress + 0.05)
          }}
        >
          {bars.map((h, i) => {
            const filled = i / bars.length <= progress
            return (
              <span
                key={i}
                className={cn(
                  "w-[2.5px] shrink-0 rounded-full",
                  filled ? "bg-[#53bdeb]" : isMine ? "bg-[#7a9b74]" : "bg-[#aebac1]",
                )}
                style={{ height: `${Math.round(h * 28)}px` }}
              />
            )
          })}
          <span
            className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#53bdeb] shadow-sm"
            style={{ left: `${Math.max(2, Math.min(98, progress * 100))}%` }}
          />
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] text-[var(--wa-text-secondary)]">
          <span dir="ltr">
            {playError || loadError
              ? playError || "שגיאה — לחץ לניסיון חוזר"
              : formatCallDuration(Math.round(displayTime || 0))}
          </span>
          <span className="flex items-center gap-1" dir="ltr">
            {timeLabel}
            {isMine && <MessageTicks status={status} isGroup={isGroup} viewCount={viewCount} />}
          </span>
        </div>
      </div>

      <div className="relative shrink-0">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#c5e1e8]">
          {signedAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signedAvatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-7 w-7 text-[#5a9aa8]" />
          )}
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white shadow",
            isMine ? "bg-[#00a884]" : "bg-[#54656f]",
          )}
          aria-hidden
        >
          <Mic className="h-3 w-3" />
        </span>
        {avatarName ? <span className="sr-only">{avatarName}</span> : null}
      </div>
    </div>
  )
}
