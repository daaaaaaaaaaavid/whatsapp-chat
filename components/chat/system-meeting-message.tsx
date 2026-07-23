"use client"

import type { Message } from "@/lib/types"
import { formatTime } from "@/lib/format"
import { parseMeetingSystemPayload, meetingSystemLabel } from "@/lib/meeting-system-message"
import { Users, Video } from "lucide-react"

type Props = {
  message: Message
  onJoin?: (meetingId: string) => void
  joinBlocked?: boolean
  /** DM vs group — slightly different copy */
  isGroup?: boolean
}

export function SystemMeetingMessage({ message, onJoin, joinBlocked, isGroup }: Props) {
  const payload = parseMeetingSystemPayload(message.content)
  const label = payload
    ? meetingSystemLabel(payload, { isGroup: isGroup !== false })
    : "פגישה"
  const canJoin = payload?.event === "started" && Boolean(onJoin) && !joinBlocked
  const isStarted = payload?.event === "started"

  return (
    <div className="my-3 flex justify-center px-3">
      <div
        className={`inline-flex max-w-[min(100%,420px)] flex-col items-stretch gap-2 rounded-2xl px-4 py-3 text-center shadow-md ${
          isStarted && !joinBlocked
            ? "bg-gradient-to-b from-[#00a884]/18 to-white/95 ring-2 ring-[#00a884]/45"
            : "bg-white/95 ring-1 ring-black/5"
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              isStarted && !joinBlocked ? "bg-[#00a884] text-white" : "bg-[#00a884]/15 text-[#00a884]"
            }`}
          >
            {isStarted ? <Video className="h-4 w-4" /> : <Users className="h-4 w-4" />}
          </span>
          <div className="min-w-0 text-start">
            <p
              className={`text-sm font-semibold leading-snug ${
                isStarted && !joinBlocked ? "text-[#0b141a]" : "text-[var(--wa-text-secondary)]"
              }`}
            >
              {label}
            </p>
            <p className="text-[11px] text-[#8696a0]" dir="ltr">
              {formatTime(message.created_at)}
            </p>
          </div>
        </div>

        {canJoin && payload && (
          <button
            type="button"
            onClick={() => onJoin?.(payload.meetingId)}
            className="w-full rounded-full bg-[#00a884] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#06cf9c] active:scale-[0.98]"
          >
            הצטרף עכשיו
          </button>
        )}
        {payload?.event === "started" && joinBlocked && (
          <span className="rounded-full bg-black/5 px-3 py-1.5 text-xs text-[var(--wa-text-secondary)]">
            הפגישה הסתיימה
          </span>
        )}
      </div>
    </div>
  )
}
