"use client"

import type { EventPayload } from "@/lib/types"
import { eventCalendarUrl, formatEventWhen } from "@/lib/event-message"
import { CalendarDays, MapPin, ExternalLink } from "lucide-react"

type Props = {
  payload: EventPayload
}

export function EventMessage({ payload }: Props) {
  const calendarUrl = eventCalendarUrl(payload)

  return (
    <div className="mb-1 min-w-[240px] max-w-xs overflow-hidden rounded-lg bg-black/5" dir="rtl">
      <div className="flex gap-3 px-3 py-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f15c6d]/15 text-[#f15c6d]">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--wa-text)]">{payload.title}</div>
          <div className="mt-1 text-xs text-[var(--wa-text-secondary)]">{formatEventWhen(payload)}</div>
          {payload.location && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-[var(--wa-text-secondary)]">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words">{payload.location}</span>
            </div>
          )}
          {payload.description && (
            <p className="mt-1.5 line-clamp-3 text-xs text-[var(--wa-text-secondary)]">{payload.description}</p>
          )}
        </div>
      </div>
      {calendarUrl && (
        <a
          href={calendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex w-full items-center justify-center gap-1.5 border-t border-black/10 px-3 py-2 text-sm font-medium text-[#00a884] transition hover:bg-black/5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          הוסף ליומן
        </a>
      )}
    </div>
  )
}
