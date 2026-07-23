import type { EventPayload } from "@/lib/types"

export function parseEventPayload(content: string | null | undefined): EventPayload | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as EventPayload
    if (
      parsed?.kind === "event" &&
      typeof parsed.title === "string" &&
      parsed.title.trim() &&
      typeof parsed.startsAt === "string" &&
      parsed.startsAt.trim()
    ) {
      return {
        kind: "event",
        title: parsed.title.trim(),
        startsAt: parsed.startsAt.trim(),
        endsAt: typeof parsed.endsAt === "string" ? parsed.endsAt.trim() || null : null,
        location: typeof parsed.location === "string" ? parsed.location.trim() || null : null,
        description: typeof parsed.description === "string" ? parsed.description.trim() || null : null,
      }
    }
  } catch {
    // not an event
  }
  return null
}

export function encodeEventPayload(payload: Omit<EventPayload, "kind">): string {
  const body: EventPayload = {
    kind: "event",
    title: payload.title.trim(),
    startsAt: payload.startsAt.trim(),
    endsAt: payload.endsAt?.trim() || null,
    location: payload.location?.trim() || null,
    description: payload.description?.trim() || null,
  }
  return JSON.stringify(body)
}

export function eventPreviewLabel(payload: EventPayload): string {
  const title = payload.title.trim()
  return title ? `📅 אירוע: ${title}` : "📅 אירוע"
}

export function buildEventPayload(opts: {
  title: string
  startsAt: string
  endsAt?: string | null
  location?: string | null
  description?: string | null
}): EventPayload | null {
  const title = opts.title.trim()
  const startsAt = opts.startsAt.trim()
  if (!title || !startsAt) return null
  return {
    kind: "event",
    title,
    startsAt,
    endsAt: opts.endsAt?.trim() || null,
    location: opts.location?.trim() || null,
    description: opts.description?.trim() || null,
  }
}

function toGoogleCalendarStamp(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
}

/** Google Calendar template URL for “add to calendar”. */
export function eventCalendarUrl(payload: EventPayload): string | null {
  const start = toGoogleCalendarStamp(payload.startsAt)
  if (!start) return null
  const endIso = payload.endsAt || new Date(new Date(payload.startsAt).getTime() + 60 * 60 * 1000).toISOString()
  const end = toGoogleCalendarStamp(endIso) ?? start
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: payload.title,
    dates: `${start}/${end}`,
  })
  if (payload.location) params.set("location", payload.location)
  if (payload.description) params.set("details", payload.description)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function formatEventWhen(payload: EventPayload): string {
  const start = new Date(payload.startsAt)
  if (Number.isNaN(start.getTime())) return payload.startsAt
  const startLabel = start.toLocaleString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  if (!payload.endsAt) return startLabel
  const end = new Date(payload.endsAt)
  if (Number.isNaN(end.getTime())) return startLabel
  const sameDay = start.toDateString() === end.toDateString()
  const endLabel = end.toLocaleString("he-IL", {
    ...(sameDay ? {} : { weekday: "short" as const, day: "numeric" as const, month: "short" as const }),
    hour: "2-digit",
    minute: "2-digit",
  })
  return `${startLabel} – ${endLabel}`
}
