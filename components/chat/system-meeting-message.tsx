"use client"

import type { Message } from "@/lib/types"
import { formatTime } from "@/lib/format"
import { parseMeetingSystemPayload, meetingSystemLabel } from "@/lib/meeting-system-message"
import { Video } from "lucide-react"

type Props = {
  message: Message
  onJoin?: (meetingId: string) => void
  joinBlocked?: boolean
  /** DM vs group — slightly different copy */
  isGroup?: boolean
  /** The person who started the call. They are already in the room. */
  isHost?: boolean
  /** This call is the one open on this device. */
  inThisCall?: boolean
}

export function SystemMeetingMessage({
  message,
  onJoin,
  joinBlocked,
  isGroup,
  isHost = false,
  inThisCall = false,
}: Props) {
  const payload = parseMeetingSystemPayload(message.content)
  const group = isGroup === true || payload?.isGroup === true
  const label = payload ? meetingSystemLabel(payload, { isGroup: group }) : "שיחה"
  const isStarted = payload?.event === "started"
  const live = isStarted && !joinBlocked
  const time = formatTime(message.created_at)

  const title = isHost && isStarted ? (group ? "התחלת שיחת וידאו קבוצתית" : "התחלת שיחת וידאו") : label
  const subtitle = !isStarted
    ? "השיחה נסגרה"
    : joinBlocked
      ? "השיחה הסתיימה"
      : isHost
        ? inThisCall
          ? "השיחה פתוחה אצלך"
          : "יצאת מהחדר. אפשר לחזור בלי להתחיל שיחה חדשה"
        : group
          ? "השיחה פתוחה למשתתפי הקבוצה"
          : "השיחה פתוחה"

  return (
    <div className="my-3 flex justify-center px-3">
      <article className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-panel)] text-right shadow-[0_12px_32px_rgb(8_20_28/0.06)]">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              live ? "bg-[var(--wa-accent-soft)] text-[var(--wa-teal-dark)]" : "bg-[var(--wa-header)] text-[var(--wa-text-secondary)]"
            }`}
          >
            <Video className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--wa-text)]">{title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--wa-text-secondary)]">{subtitle}</p>
            <p className="mt-1 text-[11px] text-[var(--wa-text-secondary)]" dir="ltr">
              {time}
            </p>
          </div>
        </div>

        {live && !isHost && payload && onJoin && (
          <div className="border-t border-[var(--wa-border)] px-4 py-3">
            <button
              type="button"
              onClick={() => onJoin(payload.meetingId)}
              className="wa-btn w-full py-2.5 text-sm"
            >
              הצטרפות לשיחה
            </button>
          </div>
        )}

        {live && isHost && !inThisCall && payload && onJoin && (
          <div className="border-t border-[var(--wa-border)] px-4 py-2.5">
            <button
              type="button"
              onClick={() => onJoin(payload.meetingId)}
              className="text-sm font-medium text-[var(--wa-teal-dark)] hover:underline"
            >
              חזרה לשיחה
            </button>
          </div>
        )}
      </article>
    </div>
  )
}
