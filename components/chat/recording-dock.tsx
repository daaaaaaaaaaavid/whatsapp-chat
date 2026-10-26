"use client"

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { LoaderCircle, Pause, Play, SendHorizontal, Square, Trash2 } from "lucide-react"
import { formatCallDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import { VoiceWave } from "./voice-wave"

type Preview = {
  url: string
  durationSec: number
}

type Props = {
  phase: "live" | "preview"
  elapsedSec: number
  preview: Preview | null
  sending: boolean
  onStop: () => void
  onDiscard: () => void
  onSend: () => void
}

export function RecordingDock({ phase, elapsedSec, preview, sending, onStop, onDiscard, onSend }: Props) {
  if (phase === "live") {
    return (
      <div
        className="wa-composer mx-2 mb-2 mt-1 flex items-center gap-2 rounded-[1.6rem] px-2 py-2"
        dir="rtl"
        role="status"
        aria-live="polite"
      >
        <button
          type="button"
          onClick={onDiscard}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-[#ff3b30]/10 hover:text-[#ff3b30]"
          aria-label="בטל הקלטה"
          title="בטל הקלטה"
        >
          <Trash2 className="h-5 w-5" />
        </button>
        <span className="flex shrink-0 items-center gap-2 rounded-full bg-[#ff3b30]/10 px-3 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff3b30] opacity-70 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff3b30]" />
          </span>
          <span className="min-w-[2.6rem] tabular-nums text-sm font-semibold text-[var(--wa-text)]" dir="ltr">
            {formatCallDuration(elapsedSec)}
          </span>
        </span>
        <VoiceWave live count={26} className="h-8 min-w-0 flex-1 px-1" />
        <button
          type="button"
          onClick={onStop}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-[0_8px_18px_rgb(255_59_48/0.28)] transition hover:brightness-105"
          aria-label="עצור ושמע"
          title="עצירה והאזנה"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>
      </div>
    )
  }

  if (!preview) return null

  return (
    <PreviewDock
      preview={preview}
      sending={sending}
      onDiscard={onDiscard}
      onSend={onSend}
    />
  )
}

function PreviewDock({
  preview,
  sending,
  onDiscard,
  onSend,
}: {
  preview: Preview
  sending: boolean
  onDiscard: () => void
  onSend: () => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(preview.durationSec)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setCurrent(audio.currentTime || 0)
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration)
    }
    const onEnd = () => {
      setPlaying(false)
      setCurrent(0)
    }
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("durationchange", onMeta)
    audio.addEventListener("loadedmetadata", onMeta)
    audio.addEventListener("ended", onEnd)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("play", onPlay)
    return () => {
      audio.pause()
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("durationchange", onMeta)
      audio.removeEventListener("loadedmetadata", onMeta)
      audio.removeEventListener("ended", onEnd)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("play", onPlay)
    }
  }, [preview.url])

  const total = duration > 0 ? duration : preview.durationSec
  const progress = total > 0 ? Math.min(1, current / total) : 0
  const shown = playing || current > 0.05 ? current : total

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio || sending) return
    if (!audio.paused) {
      audio.pause()
      return
    }
    try {
      await audio.play()
    } catch {
      setPlaying(false)
    }
  }

  const seek = (event: ReactPointerEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
    setCurrent(audio.currentTime)
  }

  return (
    <div className="wa-composer mx-2 mb-2 mt-1 flex items-center gap-2 rounded-[1.6rem] px-2 py-2" dir="ltr">
      {preview.url ? <audio ref={audioRef} src={preview.url} preload="auto" className="hidden" /> : null}
      <button
        type="button"
        onClick={onDiscard}
        disabled={sending}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#ff3b30] transition hover:bg-[#ff3b30]/10 disabled:opacity-40"
        aria-label="מחק הקלטה"
        title="מחק הקלטה"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={sending}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--wa-accent-soft)] text-[var(--wa-teal-dark)] transition hover:brightness-95 disabled:opacity-40"
        aria-label={playing ? "השהה" : "נגן"}
      >
        {playing ? <Pause className="h-4.5 w-4.5 fill-current" /> : <Play className="h-4.5 w-4.5 fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={cn("cursor-pointer", sending && "pointer-events-none opacity-60")}
          onPointerDown={seek}
          role="slider"
          aria-label="מיקום בהקלטה"
          aria-valuemin={0}
          aria-valuemax={Math.round(total) || 1}
          aria-valuenow={Math.round(current)}
          tabIndex={0}
          onKeyDown={(e) => {
            const audio = audioRef.current
            if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return
            const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 0.05 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.05 : 0
            if (!step) return
            e.preventDefault()
            audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + step * audio.duration))
            setCurrent(audio.currentTime)
          }}
        >
          <VoiceWave count={28} progress={progress} className="h-8" />
        </div>
      </div>
      <span className="w-10 shrink-0 text-center text-xs font-medium tabular-nums text-[var(--wa-text-secondary)]" dir="ltr">
        {formatCallDuration(shown)}
      </span>
      <button
        type="button"
        onClick={onSend}
        disabled={sending}
        className="wa-send flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50"
        aria-label="שלח הקלטה"
        title="שלח הקלטה"
      >
        {sending ? (
          <LoaderCircle className="h-5 w-5 animate-spin" />
        ) : (
          <SendHorizontal className="h-5 w-5 -scale-x-100" />
        )}
      </button>
    </div>
  )
}
