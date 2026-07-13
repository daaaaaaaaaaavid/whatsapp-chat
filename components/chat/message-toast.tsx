"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

export type MessageToastItem = {
  id: string
  title: string
  body: string
  conversationId: string
}

type Props = {
  toasts: MessageToastItem[]
  onOpen: (conversationId: string) => void
  onDismiss: (id: string) => void
}

export function MessageToastStack({ toasts, onOpen, onDismiss }: Props) {
  if (typeof document === "undefined" || !toasts.length) return null

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[9999] flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <MessageToastCard key={t.id} toast={t} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  )
}

function MessageToastCard({
  toast,
  onOpen,
  onDismiss,
}: {
  toast: MessageToastItem
  onOpen: (conversationId: string) => void
  onDismiss: (id: string) => void
}) {
  useEffect(() => {
    const id = window.setTimeout(() => onDismiss(toast.id), 7000)
    return () => window.clearTimeout(id)
  }, [toast.id, onDismiss])

  return (
    <div
      className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl bg-[#111b21] text-white shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
      style={{ animation: "toast-in 0.25s ease-out" }}
      role="status"
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 pl-11 text-right"
        onClick={() => {
          onOpen(toast.conversationId)
          onDismiss(toast.id)
        }}
      >
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-base font-semibold text-white">
          {toast.title.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[#25d366]">הודעה חדשה</div>
          <div className="truncate text-[15px] font-semibold">{toast.title}</div>
          <div className="mt-0.5 line-clamp-2 text-sm text-[#d1d7db]">{toast.body || " "}</div>
        </div>
      </button>
      <button
        type="button"
        aria-label="סגור"
        className="absolute left-2 top-2 rounded-full p-1.5 text-[#8696a0] hover:bg-white/10"
        onClick={(e) => {
          e.stopPropagation()
          onDismiss(toast.id)
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
