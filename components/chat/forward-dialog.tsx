"use client"

import { useEffect, useMemo, useState } from "react"
import type { Conversation, Message, Profile } from "@/lib/types"
import { convDisplayName, messagePreview } from "@/lib/conversation-display"
import { Avatar } from "./avatar"
import { Search, X } from "lucide-react"

type Props = {
  open: boolean
  messages: Message[]
  conversations: Conversation[]
  currentUser: Profile
  onClose: () => void
  onForward: (conversationIds: string[]) => Promise<void>
}

export function ForwardDialog({
  open,
  messages,
  conversations,
  currentUser,
  onClose,
  onForward,
}: Props) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setSelected([])
      setSending(false)
    }
  }, [open])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return conversations.filter((c) => {
      if (!q) return true
      return convDisplayName(c, currentUser.id).toLowerCase().includes(q)
    })
  }, [conversations, currentUser.id, query])

  if (!open || messages.length === 0) return null

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const submit = async () => {
    if (!selected.length || sending) return
    setSending(true)
    try {
      await onForward(selected)
      onClose()
    } finally {
      setSending(false)
    }
  }

  const preview =
    messages.length === 1
      ? messagePreview(messages[0])
      : `${messages.length} הודעות`

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4" role="dialog">
      <div className="flex max-h-[80svh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-[var(--wa-panel)] shadow-2xl" dir="rtl">
        <header className="flex items-center gap-3 border-b border-[var(--wa-border)] px-4 py-3">
          <button type="button" onClick={onClose} aria-label="סגור" className="text-[var(--wa-text-secondary)]">
            <X className="h-5 w-5" />
          </button>
          <h2 className="flex-1 text-base font-medium text-[var(--wa-text)]">
            {messages.length > 1 ? "העברת הודעות" : "העברת הודעה"}
          </h2>
          <button
            type="button"
            disabled={!selected.length || sending}
            onClick={() => void submit()}
            className="rounded-full bg-[#00a884] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {sending ? "שולח..." : "שלח"}
          </button>
        </header>

        <div className="border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-4 py-2 text-sm text-[var(--wa-text-secondary)]">
          {preview}
        </div>

        <div className="flex items-center gap-2 border-b border-[var(--wa-border)] px-4 py-2">
          <Search className="h-4 w-4 text-[var(--wa-text-secondary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש צ'אט"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>

        <div className="wa-scroll flex-1 overflow-y-auto">
          {list.map((c) => {
            const name = convDisplayName(c, currentUser.id)
            const checked = selected.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className="wa-interactive-row flex w-full items-center gap-3 px-4 py-3 text-right hover:bg-[var(--wa-hover)]"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    checked ? "border-[#00a884] bg-[#00a884] text-white" : "border-[#8696a0]"
                  }`}
                >
                  {checked ? "✓" : ""}
                </span>
                <Avatar
                  name={name}
                  url={
                    c.is_group
                      ? c.avatar_url
                      : c.participants?.find((p) => p.user_id !== currentUser.id)?.profile?.avatar_url
                  }
                  isGroup={c.is_group}
                  size={40}
                />
                <span className="truncate text-[var(--wa-text)]">{name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
