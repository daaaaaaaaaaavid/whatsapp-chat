"use client"

import type React from "react"
import { useEffect } from "react"
import { X } from "lucide-react"

type Props = {
  open: boolean
  onClose: () => void
  title: string
  headerAction?: React.ReactNode
  children: React.ReactNode
}

export function Modal({ open, onClose, title, headerAction, children }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    if (open) document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        className="wa-auth-card flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="wa-brand-bar flex h-16 items-center gap-4 px-5">
          <button onClick={onClose} aria-label="סגור">
            <X className="h-6 w-6" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-lg font-medium">{title}</h2>
          {headerAction}
        </header>
        <div className="wa-scroll flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
