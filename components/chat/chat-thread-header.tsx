"use client"

import { Lock } from "lucide-react"

/** Encryption notice + optional “load older” control above the message list. */
export function ChatThreadHeader({
  hasMore,
  loadingOlder,
  onLoadOlder,
}: {
  hasMore: boolean
  loadingOlder: boolean
  onLoadOlder: () => void
}) {
  return (
    <>
      <div className="mx-auto mb-4 flex items-center gap-1.5 rounded-lg bg-[#fdf4c5] px-3 py-1.5 text-center text-xs text-[var(--wa-text-secondary)] shadow-sm">
        <Lock className="h-3 w-3" />
        הודעות פרטיות — רק משתתפי השיחה יכולים לקרוא אותן
      </div>

      {(hasMore || loadingOlder) && (
        <div className="mb-3 flex justify-center">
          <button
            type="button"
            disabled={loadingOlder}
            onClick={onLoadOlder}
            className="rounded-full bg-[var(--wa-panel)] px-3 py-1 text-xs text-[var(--wa-text-secondary)] shadow-sm hover:bg-white disabled:opacity-60"
          >
            {loadingOlder ? "טוען הודעות ישנות..." : "טען הודעות ישנות יותר"}
          </button>
        </div>
      )}
    </>
  )
}
