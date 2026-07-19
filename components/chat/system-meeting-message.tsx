"use client"

import type { Message } from "@/lib/types"
import { formatTime } from "@/lib/format"
import { parseMeetingSystemPayload, meetingSystemLabel } from "@/lib/meeting-system-message"
import { Users } from "lucide-react"

type Props = {
  message: Message
  onJoin?: (meetingId: string) => void
  joinBlocked?: boolean
}

export function SystemMeetingMessage({ message, onJoin, joinBlocked }: Props) {
  const payload = parseMeetingSystemPayload(message.content)
  const label = payload ? meetingSystemLabel(payload) : "פגישה"
  const canJoin = payload?.event === "started" && Boolean(onJoin) && !joinBlocked

  return (
    <div className="my-2 flex justify-center px-2">
      <div className="inline-flex max-w-[95%] flex-wrap items-center justify-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-[var(--wa-text-secondary)] shadow-sm">
        <Users className="h-3.5 w-3.5 shrink-0 text-[#00a884]" />
        <span>{label}</span>
        <span className="text-[#8696a0]" dir="ltr">
          {formatTime(message.created_at)}
        </span>
        {canJoin && payload && (
          <button
            type="button"
            onClick={() => onJoin?.(payload.meetingId)}
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
