"use client"

import { useEffect, useState } from "react"
import { Modal } from "./modal"
import { Avatar } from "./avatar"
import {
  fetchContacts,
  getOrCreateDirectConversation,
  startChatByEmail,
} from "@/lib/chat-actions"
import type { Profile } from "@/lib/types"
import { Search, Users, AlertCircle, Mail } from "lucide-react"

type Props = {
  open: boolean
  currentUserId: string
  onClose: () => void
  onCreated: (conversationId: string) => void
  onNewGroup: () => void
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function NewChatDialog({ open, currentUserId, onClose, onCreated, onNewGroup }: Props) {
  const [users, setUsers] = useState<Profile[]>([])
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setActionError(null)
    setLoading(true)
    setError(null)
    fetchContacts(currentUserId)
      .then((res) => {
        setUsers(res.users)
        setError(res.error)
      })
      .finally(() => setLoading(false))
  }, [open, currentUserId])

  const filtered = users.filter((u) =>
    (u.display_name ?? u.email ?? "").toLowerCase().includes(query.toLowerCase()),
  )

  const showEmailStart = looksLikeEmail(query) && filtered.length === 0

  const handleSelect = async (userId: string) => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      const convId = await getOrCreateDirectConversation(currentUserId, userId)
      onCreated(convId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "נכשל בפתיחת שיחה")
    } finally {
      setBusy(false)
    }
  }

  const handleStartByEmail = async () => {
    if (busy || !looksLikeEmail(query)) return
    setBusy(true)
    setActionError(null)
    try {
      const convId = await startChatByEmail(currentUserId, query)
      onCreated(convId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "נכשל בפתיחת שיחה")
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && showEmailStart) {
                e.preventDefault()
                void handleStartByEmail()
              }
            }}
            placeholder="חיפוש אנשי קשר או הזנת מייל"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#667781]"
          />
        </div>
        <p className="mt-2 px-1 text-xs leading-relaxed text-[#667781]">
          מוצגים רק אנשי קשר שיש איתם שיחה. לפתיחת שיחה עם מישהו חדש — הזן את המייל המעודכן שלו.
        </p>
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

      {showEmailStart && (
        <button
          onClick={() => void handleStartByEmail()}
          disabled={busy}
          className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[#f5f6f6] disabled:opacity-60"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e7fce3] text-[#008069]">
            <Mail className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <div className="font-medium text-[#111b21]">התחל שיחה עם מייל</div>
            <div className="truncate text-sm text-[#667781]">{query.trim()}</div>
          </div>
        </button>
      )}

      <div className="px-5 py-2 text-xs font-medium text-[#008069]">אנשי קשר</div>

      {error && (
        <div className="mx-4 mb-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionError && (
        <div className="mx-4 mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-sm text-[#667781]">טוען אנשי קשר...</div>
      ) : filtered.length === 0 ? (
        <div className="space-y-2 p-6 text-center text-sm text-[#667781]">
          <p>
            {query
              ? showEmailStart
                ? "לחץ למעלה כדי לפתוח שיחה עם המייל הזה"
                : "לא נמצאו אנשי קשר תואמים"
              : "אין אנשי קשר עדיין"}
          </p>
          {!query && !error && (
            <p className="text-xs leading-relaxed">
              כדי להתחיל שיחה עם מישהו חדש, הזן את כתובת המייל שלו בשורת החיפוש.
            </p>
          )}
        </div>
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
