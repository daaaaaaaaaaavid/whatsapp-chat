"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Modal } from "./modal"
import { BarChart3, Plus, Trash2 } from "lucide-react"
import { buildPollPayload } from "@/lib/poll"
import type { PollPayload } from "@/lib/types"

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (payload: PollPayload) => void | Promise<void>
}

const MAX_OPTIONS = 12
const MIN_OPTIONS = 2

export function PollDialog({ open, onClose, onSubmit }: Props) {
  const [question, setQuestion] = useState("")
  const [options, setOptions] = useState(["", ""])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQuestion("")
    setOptions(["", ""])
    setAllowMultiple(false)
    setBusy(false)
    setError(null)
  }, [open])

  const filledCount = options.filter((o) => o.trim()).length
  const canSend = question.trim().length > 0 && filledCount >= MIN_OPTIONS && !busy

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
  }

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return
    setOptions((prev) => [...prev, ""])
  }

  const removeOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) return
    setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const payload = buildPollPayload({
      question,
      optionTexts: options,
      allowMultiple,
    })
    if (!payload) {
      setError("הוסף שאלה ולפחות שתי אפשרויות")
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(payload)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "שליחת הסקר נכשלה")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="סקר חדש">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4" dir="rtl">
        <div className="flex items-start gap-3 rounded-xl bg-[var(--wa-header)] px-3 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884]/15 text-[#00a884]">
            <BarChart3 className="h-5 w-5" />
          </div>
          <p className="text-sm leading-relaxed text-[var(--wa-text-secondary)]">
            צור סקר קצר עם שאלה וכמה אפשרויות. כולם בצ׳אט יוכלו להצביע ולראות תוצאות בזמן אמת.
          </p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-[var(--wa-text-secondary)]">שאלה</span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            maxLength={200}
            placeholder="מה תרצו לשאול?"
            className="w-full resize-none rounded-xl border border-black/10 bg-[var(--wa-panel)] px-3 py-2.5 text-sm text-[var(--wa-text)] outline-none ring-[#00a884]/40 focus:ring-2"
            autoFocus
          />
        </label>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-[var(--wa-text-secondary)]">אפשרויות</span>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={option}
                onChange={(e) => updateOption(index, e.target.value)}
                maxLength={100}
                placeholder={`אפשרות ${index + 1}`}
                className="min-w-0 flex-1 rounded-xl border border-black/10 bg-[var(--wa-panel)] px-3 py-2.5 text-sm text-[var(--wa-text)] outline-none ring-[#00a884]/40 focus:ring-2"
              />
              {options.length > MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-black/5 hover:text-red-500"
                  aria-label="הסר אפשרות"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 px-3 py-2.5 text-sm text-[var(--wa-text-secondary)] transition hover:border-[#00a884]/50 hover:text-[#00a884]"
            >
              <Plus className="h-4 w-4" />
              הוסף אפשרות
            </button>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-[var(--wa-header)] px-3 py-3">
          <input
            type="checkbox"
            checked={allowMultiple}
            onChange={(e) => setAllowMultiple(e.target.checked)}
            className="h-4 w-4 accent-[#00a884]"
          />
          <span className="text-sm text-[var(--wa-text)]">אפשר לבחור יותר מאפשרות אחת</span>
        </label>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={!canSend}
          className="rounded-xl bg-[#00a884] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#019a77] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "שולח…" : "שלח סקר"}
        </button>
      </form>
    </Modal>
  )
}
