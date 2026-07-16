"use client"

import { useEffect, useState } from "react"
import { Modal } from "./modal"
import { createWorkSpace } from "@/lib/space-actions"

type Props = {
  open: boolean
  currentUserId: string
  onClose: () => void
  onCreated: (result: { spaceId: string; channelId: string }) => void
}

export function NewSpaceDialog({ open, currentUserId, onClose, onCreated }: Props) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName("")
    setDescription("")
    setError(null)
    setBusy(false)
  }, [open])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await createWorkSpace(currentUserId, name, description)
      onCreated(result)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "יצירת Space נכשלה")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Space חדש">
      <div className="space-y-4 px-6 py-5" dir="rtl">
        <p className="text-sm text-[var(--wa-text-secondary)]">
          Space הוא מרחב צוות עם ערוצים (כמו Google Chat). נוצר אוטומטית ערוץ &quot;כללי&quot;.
        </p>
        <div>
          <label className="text-sm text-[#1a73e8]">שם ה־Space</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="למשל: צוות מוצר"
            autoFocus
            className="mt-1 w-full border-b-2 border-[#1a73e8] bg-transparent py-2 text-[var(--wa-text)] outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim() && !busy) void submit()
            }}
          />
        </div>
        <div>
          <label className="text-sm text-[var(--wa-text-secondary)]">תיאור (אופציונלי)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="למה ה־Space הזה משמש"
            className="mt-1 w-full border-b border-[var(--wa-border)] bg-transparent py-2 text-[var(--wa-text)] outline-none"
          />
        </div>
        {error && <p className="text-sm text-[#ea0038]">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)]"
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void submit()}
            className="rounded-lg bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "יוצר..." : "צור Space"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
