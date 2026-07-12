"use client"

import { useEffect, useState } from "react"
import { Modal } from "./modal"
import { Avatar } from "./avatar"
import { fetchAllUsers, getOrCreateDirectConversation } from "@/lib/chat-actions"
import type { Profile } from "@/lib/types"
import { Search, Users } from "lucide-react"

type Props = {
  open: boolean
  currentUserId: string
  onClose: () => void
  onCreated: (conversationId: string) => void
  onNewGroup: () => void
}

export function NewChatDialog({ open, currentUserId, onClose, onCreated, onNewGroup }: Props) {
  const [users, setUsers] = useState<Profile[]>([])
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      fetchAllUsers(currentUserId).then((u) => setUsers(u as Profile[]))
      setQuery("")
    }
  }, [open, currentUserId])

  const filtered = users.filter((u) =>
    (u.display_name ?? u.email ?? "").toLowerCase().includes(query.toLowerCase()),
  )

  const handleSelect = async (userId: string) => {
    if (busy) return
    setBusy(true)
    try {
      const convId = await getOrCreateDirectConversation(currentUserId, userId)
      onCreated(convId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="צ'אט חדש">
      <div className="p-3">
        <div className="flex items-center gap-3 rounded-lg bg-[#f0f2f5] px-4 py-2">
          <Search className="h-4 w-4 text-[#54656f]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש שם או אימייל"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#667781]"
          />
        </div>
      </div>

      <button
        onClick={onNewGroup}
        className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[#f5f6f6]"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white">
          <Users className="h-6 w-6" />
        </div>
        <span className="font-medium text-[#111b21]">קבוצה חדשה</span>
      </button>

      <div className="px-5 py-2 text-xs font-medium text-[#008069]">אנשי קשר</div>

      {filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-[#667781]">לא נמצאו משתמשים</div>
      ) : (
        filtered.map((u) => (
          <button
            key={u.id}
            onClick={() => handleSelect(u.id)}
            disabled={busy}
            className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-[#f5f6f6] disabled:opacity-60"
          >
            <Avatar name={u.display_name} url={u.avatar_url} size={48} />
            <div className="min-w-0 flex-1 border-b border-[#e9edef] pb-2.5">
              <div className="truncate text-[#111b21]">{u.display_name ?? u.email}</div>
              <div className="truncate text-sm text-[#667781]">{u.about ?? "זמין"}</div>
            </div>
          </button>
        ))
      )}
    </Modal>
  )
}
