"use client"

import type React from "react"
import { useEffect } from "react"
import { X } from "lucide-react"

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Modal({ open, onClose, title, children }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    if (open) document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-16 items-center gap-4 bg-[#00a884] px-5 text-white">
          <button onClick={onClose} aria-label="סגור">
            <X className="h-6 w-6" />
          </button>
          <h2 className="text-lg font-medium">{title}</h2>
        </header>
        <div className="wa-scroll flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
