"use client"

import { useEffect, useState } from "react"
import { Modal } from "./modal"
import { Avatar } from "./avatar"
import { createGroupConversation, fetchContacts, findUserByEmail } from "@/lib/chat-actions"
import type { Profile } from "@/lib/types"
import { Check, Search, ArrowLeft, X, Mail, AlertCircle } from "lucide-react"

type Props = {
  open: boolean
  currentUserId: string
  onClose: () => void
  onCreated: (conversationId: string) => void
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function NewGroupDialog({ open, currentUserId, onClose, onCreated }: Props) {
  const [users, setUsers] = useState<Profile[]>([])
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Profile[]>([])
  const [step, setStep] = useState<"members" | "name">("members")
  const [groupName, setGroupName] = useState("")
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      fetchContacts(currentUserId).then((res) => setUsers(res.users))
      setQuery("")
      setSelected([])
      setStep("members")
      setGroupName("")
      setActionError(null)
    }
  }, [open, currentUserId])

  const filtered = users.filter((u) =>
    (u.display_name ?? u.email ?? "").toLowerCase().includes(query.toLowerCase()),
  )

  const showEmailAdd =
    looksLikeEmail(query) &&
    !filtered.some((u) => (u.email ?? "").toLowerCase() === query.trim().toLowerCase()) &&
    !selected.some((u) => (u.email ?? "").toLowerCase() === query.trim().toLowerCase())

  const toggle = (u: Profile) => {
    setSelected((prev) => (prev.some((p) => p.id === u.id) ? prev.filter((p) => p.id !== u.id) : [...prev, u]))
  }

  const handleAddByEmail = async () => {
    if (busy || !looksLikeEmail(query)) return
    setBusy(true)
    setActionError(null)
    try {
      const profile = await findUserByEmail(query)
      if (!profile) {
        setActionError("לא נמצא משתמש עם המייל הזה. ודא שהמייל מעודכן ונכון.")
        return
      }
      if (profile.id === currentUserId) {
        setActionError("אי אפשר להוסיף את עצמך לקבוצה כחבר נוסף.")
        return
      }
      setSelected((prev) => (prev.some((p) => p.id === profile.id) ? prev : [...prev, profile]))
      setQuery("")
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "נכשל בחיפוש לפי מייל")
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = async () => {
    if (!groupName.trim() || selected.length === 0 || busy) return
    setBusy(true)
    setActionError(null)
    try {
      const convId = await createGroupConversation(
        currentUserId,
        groupName.trim(),
        selected.map((s) => s.id),
      )
      onCreated(convId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "נכשל ביצירת קבוצה")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={step === "members" ? "הוספת חברים לקבוצה" : "קבוצה חדשה"}>
      {step === "members" ? (
        <>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-[#e9edef] p-3">
              {selected.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggle(u)}
                  className="flex items-center gap-1.5 rounded-full bg-[#f0f2f5] py-1 pl-2 pr-1 text-sm"
                >
                  <Avatar name={u.display_name} url={u.avatar_url} size={24} />
                  <span className="text-[#111b21]">{u.display_name ?? u.email}</span>
                  <X className="h-3.5 w-3.5 text-[#667781]" />
                </button>
              ))}
            </div>
          )}
          <div className="p-3">
            <div className="flex items-center gap-3 rounded-lg bg-[#f0f2f5] px-4 py-2">
              <Search className="h-4 w-4 text-[#54656f]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && showEmailAdd) {
                    e.preventDefault()
                    void handleAddByEmail()
                  }
                }}
                placeholder="חיפוש אנשי קשר או הזנת מייל"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#667781]"
              />
            </div>
            <p className="mt-2 px-1 text-xs leading-relaxed text-[#667781]">
              אפשר לבחור מאנשי קשר קיימים, או להוסיף מישהו חדש לפי המייל שלו.
            </p>
          </div>

          {actionError && (
            <div className="mx-4 mb-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {showEmailAdd && (
            <button
              onClick={() => void handleAddByEmail()}
              disabled={busy}
              className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[#f5f6f6] disabled:opacity-60"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e7fce3] text-[#008069]">
                <Mail className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1 text-right">
                <div className="font-medium text-[#111b21]">הוסף לפי מייל</div>
                <div className="truncate text-sm text-[#667781]">{query.trim()}</div>
              </div>
            </button>
          )}

          {filtered.map((u) => {
            const isSel = selected.some((p) => p.id === u.id)
            return (
              <button
                key={u.id}
                onClick={() => toggle(u)}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-[#f5f6f6]"
              >
                <div className="relative">
                  <Avatar name={u.display_name} url={u.avatar_url} size={48} />
                  {isSel && (
                    <span className="absolute -bottom-0.5 -left-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#00a884]">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 border-b border-[#e9edef] pb-2.5 text-right">
                  <div className="truncate text-[#111b21]">{u.display_name ?? u.email}</div>
                  <div className="truncate text-sm text-[#667781]">{u.about ?? "זמין"}</div>
                </div>
              </button>
            )
          })}

          {!busy && filtered.length === 0 && !showEmailAdd && (
            <div className="p-6 text-center text-sm text-[#667781]">
              {query ? "לא נמצאו אנשי קשר תואמים" : "אין אנשי קשר עדיין — הוסף חברים לפי מייל"}
            </div>
          )}

          {selected.length > 0 && (
            <div className="sticky bottom-0 flex justify-start bg-white p-4">
              <button
                onClick={() => setStep("name")}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white shadow-lg transition hover:bg-[#008069]"
                aria-label="המשך"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="p-6">
          <button
            onClick={() => setStep("members")}
            className="mb-4 flex items-center gap-2 text-sm text-[#008069]"
          >
            <ArrowLeft className="h-4 w-4 rotate-180" />
            חזרה לבחירת חברים
          </button>
          <div className="mb-6 flex flex-col items-center">
            <Avatar name={groupName || "?"} isGroup size={80} />
          </div>
          <label className="mb-1.5 block text-sm font-medium text-[#3b4a54]">שם הקבוצה</label>
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="הזן שם קבוצה"
            autoFocus
            className="w-full border-b-2 border-[#00a884] bg-transparent py-2 text-[#111b21] outline-none"
          />
          <div className="mt-2 text-sm text-[#667781]">{selected.length} חברים נבחרו</div>
          {actionError && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {actionError}
            </div>
          )}
          <button
            onClick={handleCreate}
            disabled={!groupName.trim() || busy}
            className="mt-8 w-full rounded-full bg-[#00a884] py-2.5 font-medium text-white transition hover:bg-[#008069] disabled:opacity-60"
          >
            {busy ? "יוצר..." : "צור קבוצה"}
          </button>
        </div>
      )}
    </Modal>
  )
}
