"use client"

import type { Message } from "@/lib/types"
import { formatTime } from "@/lib/format"
import { parseWatchSystemPayload, watchSystemLabel } from "@/lib/watch-system-message"
import { Clapperboard } from "lucide-react"

type Props = {
  message: Message
  onJoin?: (videoId: string) => void
  /** When true, Join is hidden — session already ended */
  joinBlocked?: boolean
}

export function SystemWatchMessage({ message, onJoin, joinBlocked }: Props) {
  const payload = parseWatchSystemPayload(message.content)
  const label = payload ? watchSystemLabel(payload) : "צפייה משותפת"
  const canJoin = payload?.event === "started" && Boolean(onJoin) && !joinBlocked

  return (
    <div className="my-2 flex justify-center px-2">
      <div className="inline-flex max-w-[95%] flex-wrap items-center justify-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-[var(--wa-text-secondary)] shadow-sm">
        <Clapperboard className="h-3.5 w-3.5 shrink-0 text-[#00a884]" />
        <span>{label}</span>
        <span className="text-[#8696a0]" dir="ltr">
          {formatTime(message.created_at)}
        </span>
        {canJoin && payload && (
          <button
            type="button"
            onClick={() => onJoin?.(payload.videoId)}
            className="rounded-full bg-[#00a884] px-2.5 py-0.5 text-[11px] font-medium text-white transition hover:bg-[#06cf9c]"
          >
            הצטרף
          </button>
        )}
        {payload?.event === "started" && joinBlocked && (
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-[var(--wa-text-secondary)]">
            הסתיימה
          </span>
        )}
      </div>
    </div>
  )
}
