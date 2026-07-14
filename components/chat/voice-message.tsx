"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Pause, Play, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCallDuration } from "@/lib/format"
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

type Props = {
  url: string
  messageId: string
  isMine: boolean
  timeLabel: string
  status: "sending" | "sent" | "delivered" | "read"
  avatarUrl?: string | null
  avatarName?: string | null
}

export function VoiceMessage({
  url,
  messageId,
  isMine,
  timeLabel,
  status,
  avatarUrl,
  avatarName,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const bars = waveformBars(messageId)

  useEffect(() => {
    const audio = new Audio(url)
    audio.preload = "metadata"
    audioRef.current = audio

    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }
    const onTime = () => setCurrent(audio.currentTime)
    const onEnded = () => {
      setPlaying(false)
      setCurrent(0)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)

    audio.addEventListener("loadedmetadata", onMeta)
    audio.addEventListener("durationchange", onMeta)
    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)

    return () => {
      audio.pause()
      audio.removeEventListener("loadedmetadata", onMeta)
      audio.removeEventListener("durationchange", onMeta)
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
      audioRef.current = null
    }
  }, [url])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      void audio.play().catch(() => {})
    } else {
      audio.pause()
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

  return (
    <div className="mb-0.5 flex min-w-[240px] max-w-[320px] items-center gap-2 py-0.5" dir="ltr">
      <button
        type="button"
        onClick={toggle}
        className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--wa-text-secondary)] transition hover:text-[var(--wa-text)]"
        aria-label={playing ? "השהה" : "נגן"}
      >
        {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
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
          <span dir="ltr">{formatCallDuration(Math.round(displayTime || 0))}</span>
          <span className="flex items-center gap-1" dir="ltr">
            {timeLabel}
            {isMine && <MessageTicks status={status} />}
          </span>
        </div>
      </div>

      <div className="relative shrink-0">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#c5e1e8]">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
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
