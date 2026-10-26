"use client"

import { useEffect, useRef, useState } from "react"
import { MoreVertical, RefreshCw } from "lucide-react"

type Props = {
  syncing: boolean
  onSync: () => void
}

/** Shown after the first Google sync, instead of the large sync row. */
export function GoogleSyncMenu({ syncing, onSync }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (!open) return
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15"
        aria-label="אפשרויות"
        aria-expanded={open}
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div className="wa-menu absolute left-0 top-11 z-20 w-56 py-1">
          <button
            type="button"
            disabled={syncing}
            onClick={() => {
              setOpen(false)
              onSync()
            }}
            className="flex w-full items-center justify-end gap-2 px-4 py-2.5 text-right text-sm text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
          >
            <span>{syncing ? "מסנכרן מגוגל..." : "סנכרן שוב מגוגל"}</span>
            <RefreshCw className={`h-4 w-4 text-[#1a73e8] ${syncing ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}
    </div>
  )
}
