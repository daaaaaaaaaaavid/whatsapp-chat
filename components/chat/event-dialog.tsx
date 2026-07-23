"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Modal } from "./modal"
import { CalendarDays } from "lucide-react"
import { buildEventPayload } from "@/lib/event-message"
import type { EventPayload } from "@/lib/types"

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (payload: EventPayload) => void | Promise<void>
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function defaultStart(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return toLocalInputValue(d)
}

function defaultEnd(startLocal: string): string {
  const d = new Date(startLocal)
  if (Number.isNaN(d.getTime())) return defaultStart()
  d.setHours(d.getHours() + 1)
  return toLocalInputValue(d)
}

export function EventDialog({ open, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState("")
  const [startsAt, setStartsAt] = useState(defaultStart)
  const [endsAt, setEndsAt] = useState(() => defaultEnd(defaultStart()))
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const start = defaultStart()
    setTitle("")
    setStartsAt(start)
    setEndsAt(defaultEnd(start))
    setLocation("")
    setDescription("")
    setBusy(false)
    setError(null)
  }, [open])

  const canSend = title.trim().length > 0 && startsAt.trim().length > 0 && !busy

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const startDate = new Date(startsAt)
    const endDate = endsAt ? new Date(endsAt) : null
    if (Number.isNaN(startDate.getTime())) {
      setError("תאריך התחלה לא תקין")
      return
    }
    if (endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() < startDate.getTime()) {
      setError("שעת הסיום חייבת להיות אחרי ההתחלה")
      return
    }
    const payload = buildEventPayload({
      title,
      startsAt: startDate.toISOString(),
      endsAt: endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString() : null,
      location,
      description,
    })
    if (!payload) {
      setError("הוסף כותרת ותאריך לאירוע")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(payload)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "שליחת האירוע נכשלה")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="אירוע חדש">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4" dir="rtl">
        <div className="flex items-start gap-3 rounded-xl bg-[var(--wa-header)] px-3 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f15c6d]/15 text-[#f15c6d]">
            <CalendarDays className="h-5 w-5" />
          </div>
          <p className="text-sm leading-relaxed text-[var(--wa-text-secondary)]">
            צור כרטיס אירוע עם כותרת, זמן ומקום. הנמענים יוכלו להוסיף אותו ליומן.
          </p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[var(--wa-text-secondary)]">כותרת</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="למשל: פגישת צוות"
            className="w-full rounded-xl border border-black/10 bg-[var(--wa-panel)] px-3 py-2.5 text-sm text-[var(--wa-text)] outline-none ring-[#00a884]/40 focus:ring-2"
            autoFocus
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--wa-text-secondary)]">התחלה</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => {
                setStartsAt(e.target.value)
                if (!endsAt || new Date(endsAt) <= new Date(e.target.value)) {
                  setEndsAt(defaultEnd(e.target.value))
                }
              }}
              className="w-full rounded-xl border border-black/10 bg-[var(--wa-panel)] px-3 py-2.5 text-sm text-[var(--wa-text)] outline-none ring-[#00a884]/40 focus:ring-2"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--wa-text-secondary)]">סיום</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-[var(--wa-panel)] px-3 py-2.5 text-sm text-[var(--wa-text)] outline-none ring-[#00a884]/40 focus:ring-2"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[var(--wa-text-secondary)]">מיקום (אופציונלי)</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={200}
            placeholder="כתובת או קישור לפגישה"
            className="w-full rounded-xl border border-black/10 bg-[var(--wa-panel)] px-3 py-2.5 text-sm text-[var(--wa-text)] outline-none ring-[#00a884]/40 focus:ring-2"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[var(--wa-text-secondary)]">תיאור (אופציונלי)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="פרטים נוספים…"
            className="w-full resize-none rounded-xl border border-black/10 bg-[var(--wa-panel)] px-3 py-2.5 text-sm text-[var(--wa-text)] outline-none ring-[#00a884]/40 focus:ring-2"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!canSend}
          className="rounded-xl bg-[#00a884] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#008f72] disabled:opacity-50"
        >
          {busy ? "שולח…" : "שלח אירוע"}
        </button>
      </form>
    </Modal>
  )
}
