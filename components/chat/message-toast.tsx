"use client"

import { useEffect } from "react"
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
  if (!toasts.length) return null

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[90] flex flex-col gap-2 md:left-auto md:right-4 md:w-[360px]">
      {toasts.map((t) => (
        <MessageToastCard key={t.id} toast={t} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </div>
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
    const id = window.setTimeout(() => onDismiss(toast.id), 6000)
    return () => window.clearTimeout(id)
  }, [toast.id, onDismiss])

  return (
    <div className="pointer-events-auto relative animate-[toast-in_0.25s_ease-out] overflow-hidden rounded-xl border border-[#e9edef] bg-white shadow-[0_8px_24px_rgba(11,20,26,0.18)]">
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 pl-10 text-right"
        onClick={() => {
          onOpen(toast.conversationId)
          onDismiss(toast.id)
        }}
      >
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-sm font-semibold text-white">
          {toast.title.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[#111b21]">{toast.title}</div>
          <div className="mt-0.5 line-clamp-2 text-sm text-[#667781]">{toast.body}</div>
        </div>
      </button>
      <button
        type="button"
        aria-label="סגור"
        className="absolute left-2 top-2 rounded-full p-1 text-[#667781] hover:bg-[#f0f2f5]"
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
