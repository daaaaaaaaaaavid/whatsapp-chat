"use client"

import { useEffect, useState } from "react"
import { Modal } from "./modal"
import { createSpaceChannel } from "@/lib/space-actions"

type Props = {
  open: boolean
  currentUserId: string
  spaceId: string
  spaceName: string
  onClose: () => void
  onCreated: (channelId: string) => void
}

export function NewChannelDialog({
  open,
  currentUserId,
  spaceId,
  spaceName,
  onClose,
  onCreated,
}: Props) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName("")
    setError(null)
    setBusy(false)
  }, [open])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const channelId = await createSpaceChannel(currentUserId, spaceId, name)
      onCreated(channelId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "יצירת ערוץ נכשלה")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`ערוץ חדש · ${spaceName}`}>
      <div className="space-y-4 px-6 py-5" dir="rtl">
        <p className="text-sm text-[var(--wa-text-secondary)]">
          כל חברי ה־Space יתווספו אוטומטית לערוץ.
        </p>
        <div>
          <label className="text-sm text-[#1a73e8]">שם הערוץ</label>
          <div className="mt-1 flex items-center gap-1 border-b-2 border-[#1a73e8]">
            <span className="text-[var(--wa-text-secondary)]">#</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="עיצוב"
              autoFocus
              className="flex-1 bg-transparent py-2 text-[var(--wa-text)] outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !busy) void submit()
              }}
            />
          </div>
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
            {busy ? "יוצר..." : "צור ערוץ"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
