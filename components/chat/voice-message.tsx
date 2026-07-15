"use client"

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { LoaderCircle, Mic, Pause, Play, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCallDuration } from "@/lib/format"
import { createClient } from "@/lib/supabase/client"
import { inferAudioMimeFromUrl } from "@/lib/media-mime"
import { downloadMediaBlob, parseMediaDurationHint } from "@/lib/media-url"
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

function blobForPlayback(blob: Blob, fileUrl: string): Blob {
  const mime = inferAudioMimeFromUrl(fileUrl)
  if (blob.type && blob.type !== "application/octet-stream" && !blob.type.startsWith("video/")) {
    return blob
  }
  return new Blob([blob], { type: mime })
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

/**
 * Voice notes use decoded AudioBuffer playback so seeking always works,
 * including for WebM files from MediaRecorder that HTMLAudioElement cannot seek.
 */
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
  const hintDuration = parseMediaDurationHint(fileUrl) ?? 0
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(hintDuration)
  const [current, setCurrent] = useState(0)
  const [buffering, setBuffering] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [dragging, setDragging] = useState(false)
  const bars = waveformBars(messageId)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const startedAtRef = useRef(0)
  const offsetRef = useRef(0)
  const playingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const durationRef = useRef(hintDuration)
  durationRef.current = duration

  const refresh = () => setReloadToken((n) => n + 1)

  const stopSource = () => {
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null
        sourceRef.current.stop()
      } catch {
        // already stopped
      }
      try {
        sourceRef.current.disconnect()
      } catch {
        // ignore
      }
      sourceRef.current = null
    }
  }

  const stopRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const ensureContext = async () => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) throw new Error("Web Audio API unavailable")
    if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx()
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }

  const livePosition = () => {
    const ctx = audioCtxRef.current
    if (!playingRef.current || !ctx) return offsetRef.current
    const total = durationRef.current
    return Math.min(total, Math.max(0, offsetRef.current + (ctx.currentTime - startedAtRef.current)))
  }

  const startRaf = () => {
    stopRaf()
    const tick = () => {
      if (!playingRef.current) return
      const pos = livePosition()
      setCurrent(pos)
      if (pos >= durationRef.current - 0.02) {
        playingRef.current = false
        setPlaying(false)
        offsetRef.current = 0
        setCurrent(0)
        stopSource()
        stopRaf()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const playFrom = async (offset: number) => {
    const buffer = bufferRef.current
    if (!buffer) throw new Error("no buffer")
    const ctx = await ensureContext()
    stopSource()
    const startAt = Math.max(0, Math.min(offset, Math.max(0, buffer.duration - 0.01)))
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.onended = () => {
      if (sourceRef.current !== source) return
      const endedAt = livePosition()
      if (endedAt >= durationRef.current - 0.05) {
        playingRef.current = false
        setPlaying(false)
        offsetRef.current = 0
        setCurrent(0)
        sourceRef.current = null
        stopRaf()
      }
    }
    source.start(0, startAt)
    sourceRef.current = source
    offsetRef.current = startAt
    startedAtRef.current = ctx.currentTime
    playingRef.current = true
    setPlaying(true)
    setCurrent(startAt)
    startRaf()
  }

  const pausePlayback = (keepOffset?: number) => {
    const pos = keepOffset != null ? keepOffset : livePosition()
    offsetRef.current = pos
    setCurrent(pos)
    playingRef.current = false
    setPlaying(false)
    stopSource()
    stopRaf()
  }

  useEffect(() => {
    let cancelled = false
    playingRef.current = false
    offsetRef.current = 0
    setPlaying(false)
    setCurrent(0)
    const hinted = parseMediaDurationHint(fileUrl) ?? 0
    setDuration(hinted)
    durationRef.current = hinted
    setReady(false)
    setLoadError(false)
    setPlayError(null)
    setBuffering(true)
    stopSource()
    stopRaf()
    bufferRef.current = null

    void (async () => {
      try {
        const supabase = createClient()
        const blob = await downloadMediaBlob(supabase, fileUrl)
        if (cancelled) return
        if (!blob || blob.size === 0) throw new Error("empty media")

        const typed = blobForPlayback(blob, fileUrl)
        const arrayBuffer = await typed.arrayBuffer()
        if (cancelled) return

        const ctx = await ensureContext()
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
        if (cancelled) return

        bufferRef.current = decoded
        const d = decoded.duration
        // Tiny/bogus decode durations (common with some WebM) — keep the wall-clock hint.
        if (Number.isFinite(d) && d > 0.05) {
          setDuration(d)
          durationRef.current = d
        } else if (hinted > 0) {
          setDuration(hinted)
          durationRef.current = hinted
        }
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
      playingRef.current = false
      stopSource()
      stopRaf()
      bufferRef.current = null
      const ctx = audioCtxRef.current
      audioCtxRef.current = null
      if (ctx) {
        void ctx.close().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, reloadToken])

  const toggle = async () => {
    if (buffering) {
      if (loadError) refresh()
      return
    }
    if (!ready || !bufferRef.current) {
      if (loadError) refresh()
      return
    }
    setPlayError(null)
    try {
      if (playingRef.current) {
        pausePlayback()
        return
      }
      const start =
        offsetRef.current >= durationRef.current - 0.05 ? 0 : offsetRef.current
      await playFrom(start)
    } catch (err) {
      console.error("VoiceMessage play failed:", err)
      setLoadError(true)
      setPlayError("לא ניתן לנגן")
      setReady(false)
    }
  }

  const seekToRatio = (ratio: number, resumeIfPlaying = true) => {
    const total = durationRef.current
    if (!bufferRef.current || total <= 0) return
    const t = Math.max(0, Math.min(1, ratio)) * total
    const wasPlaying = playingRef.current

    if (wasPlaying) {
      // Preserve the scrubbed offset (do not re-read live position)
      pausePlayback(t)
    } else {
      offsetRef.current = t
      setCurrent(t)
    }

    if (resumeIfPlaying && wasPlaying) {
      void playFrom(t).catch((err) => {
        console.error("VoiceMessage seek play failed:", err)
        setPlayError("לא ניתן לדלג")
      })
    }
  }

  const ratioFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  const onSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (!ready || !bufferRef.current || durationRef.current <= 0) return
    const el = event.currentTarget
    el.setPointerCapture(event.pointerId)
    setDragging(true)
    const wasPlaying = playingRef.current
    seekToRatio(ratioFromClientX(event.clientX), false)

    const onMove = (e: PointerEvent) => {
      e.preventDefault()
      seekToRatio(ratioFromClientX(e.clientX), false)
    }
    const onUp = (e: PointerEvent) => {
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerup", onUp)
      el.removeEventListener("pointercancel", onUp)
      setDragging(false)
      seekToRatio(ratioFromClientX(e.clientX), wasPlaying)
    }
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerup", onUp)
    el.addEventListener("pointercancel", onUp)
  }

  const progress = duration > 0 ? current / duration : 0
  const displayDuration = duration > 0 ? duration : hintDuration > 0 ? hintDuration : 0
  const displayTime = playing || current > 0 || dragging ? current : displayDuration
  const busy = buffering
  const canSeek = ready && Boolean(bufferRef.current) && displayDuration > 0
  const clockLabel = (() => {
    if (playError || loadError) {
      // Still show known length when load fails so the bubble isn't "0:00".
      if (displayDuration > 0) {
        return `${playError || "שגיאה"} · ${formatCallDuration(Math.max(1, Math.round(displayDuration)))}`
      }
      return playError || "שגיאה — לחץ לניסיון חוזר"
    }
    if (displayTime <= 0) return formatCallDuration(0)
    if (playing || current > 0 || dragging) return formatCallDuration(Math.floor(displayTime))
    return formatCallDuration(Math.max(1, Math.round(displayTime)))
  })()

  return (
    <div
      className="mb-0.5 flex min-w-[240px] max-w-[320px] items-center gap-2 py-0.5"
      dir="ltr"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          void toggle()
        }}
        disabled={busy && !loadError}
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
          ref={trackRef}
          className={cn(
            "relative flex h-8 touch-none items-center gap-[2px]",
            canSeek ? "cursor-pointer" : "cursor-default",
          )}
          onPointerDown={onSeekPointerDown}
          role="slider"
          aria-label="דלג בהודעה הקולית"
          aria-valuemin={0}
          aria-valuemax={displayDuration || 1}
          aria-valuenow={current}
          aria-disabled={!canSeek}
          tabIndex={canSeek ? 0 : -1}
          onKeyDown={(e) => {
            if (!canSeek) return
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault()
              seekToRatio(progress - 0.05)
            }
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault()
              seekToRatio(progress + 0.05)
            }
            if (e.key === "Home") {
              e.preventDefault()
              seekToRatio(0)
            }
            if (e.key === "End") {
              e.preventDefault()
              seekToRatio(1)
            }
          }}
        >
          {bars.map((h, i) => {
            const filled = i / bars.length <= progress
            return (
              <span
                key={i}
                className={cn(
                  "pointer-events-none w-[2.5px] shrink-0 rounded-full",
                  filled ? "bg-[#53bdeb]" : isMine ? "bg-[#7a9b74]" : "bg-[#aebac1]",
                )}
                style={{ height: `${Math.round(h * 28)}px` }}
              />
            )
          })}
          <span
            className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#53bdeb] shadow ring-2 ring-white/80"
            style={{ left: `${Math.max(2, Math.min(98, progress * 100))}%` }}
          />
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] text-[var(--wa-text-secondary)]">
          <span dir="ltr">{clockLabel}</span>
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
