"use client"

import { useEffect, useMemo, useState } from "react"
import { Modal } from "./modal"
import { Avatar } from "./avatar"
import { createGroupConversation, fetchContacts, findUserByEmail } from "@/lib/chat-actions"
import {
  contactMatchScore,
  contactMatchesQuery,
  fetchGoogleContacts,
  syncGoogleContactsOrConnect,
} from "@/lib/google-contacts-client"
import type { GoogleContact, Profile } from "@/lib/types"
import { isValidEmail } from "@/lib/validation"
import { Check, Search, ArrowLeft, X, Mail, AlertCircle, RefreshCw } from "lucide-react"

type Props = {
  open: boolean
  currentUserId: string
  onClose: () => void
  onCreated: (conversationId: string) => void
}

function looksLikeEmail(value: string) {
  return isValidEmail(value)
}

type Suggestion =
  | { kind: "matched"; profile: Profile; score: number }
  | { kind: "unmatched"; contact: GoogleContact; score: number }

export function NewGroupDialog({ open, currentUserId, onClose, onCreated }: Props) {
  const [users, setUsers] = useState<Profile[]>([])
  const [googleMatched, setGoogleMatched] = useState<Profile[]>([])
  const [googleUnmatched, setGoogleUnmatched] = useState<GoogleContact[]>([])
  const [hasSyncedGoogle, setHasSyncedGoogle] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Profile[]>([])
  const [step, setStep] = useState<"members" | "name">("members")
  const [groupName, setGroupName] = useState("")
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setSelected([])
    setStep("members")
    setGroupName("")
    setActionError(null)
    setGoogleError(null)
    void Promise.all([fetchContacts(currentUserId), fetchGoogleContacts()]).then(
      ([contactsRes, googleRes]) => {
        setUsers(contactsRes.users)
        setGoogleMatched(googleRes.matched)
        setGoogleUnmatched(googleRes.unmatched)
        setHasSyncedGoogle(
          Boolean(googleRes.syncedAt) ||
            googleRes.matched.length > 0 ||
            googleRes.unmatched.length > 0,
        )
        if (googleRes.error) setGoogleError(googleRes.error)
      },
    )
  }, [open, currentUserId])

  const knownIds = useMemo(() => new Set(users.map((u) => u.id)), [users])
  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected])
  const q = query.trim()
  const isSearching = q.length > 0

  const googleSuggestions = useMemo((): Suggestion[] => {
    if (!isSearching) return []
    const out: Suggestion[] = []

    for (const u of googleMatched) {
      if (knownIds.has(u.id) || selectedIds.has(u.id)) continue
      if (!contactMatchesQuery(u.display_name, u.email, q)) continue
      out.push({
        kind: "matched",
        profile: u,
        score: contactMatchScore(u.display_name, u.email, q),
      })
    }

    for (const c of googleUnmatched) {
      if (!contactMatchesQuery(c.display_name, c.email, q)) continue
      out.push({
        kind: "unmatched",
        contact: c,
        score: contactMatchScore(c.display_name, c.email, q),
      })
    }

    out.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "matched" ? -1 : 1
      if (a.score !== b.score) return a.score - b.score
      const an =
        a.kind === "matched"
          ? (a.profile.display_name ?? a.profile.email ?? "")
          : (a.contact.display_name ?? a.contact.email ?? "")
      const bn =
        b.kind === "matched"
          ? (b.profile.display_name ?? b.profile.email ?? "")
          : (b.contact.display_name ?? b.contact.email ?? "")
      return an.localeCompare(bn, "he")
    })
    return out.slice(0, 12)
  }, [googleMatched, googleUnmatched, knownIds, selectedIds, isSearching, q])

  const filtered = useMemo(() => {
    return users
      .filter((u) => contactMatchesQuery(u.display_name, u.email, q))
      .sort((a, b) => {
        if (isSearching) {
          return (
            contactMatchScore(a.display_name, a.email, q) -
            contactMatchScore(b.display_name, b.email, q)
          )
        }
        return (a.display_name ?? a.email ?? "").localeCompare(
          b.display_name ?? b.email ?? "",
          "he",
        )
      })
  }, [users, q, isSearching])

  const browseGoogleMatched = useMemo(() => {
    if (isSearching) return []
    return [...googleMatched]
      .filter((u) => !knownIds.has(u.id))
      .sort((a, b) =>
        (a.display_name ?? a.email ?? "").localeCompare(
          b.display_name ?? b.email ?? "",
          "he",
        ),
      )
  }, [googleMatched, knownIds, isSearching])

  const browseGoogleUnmatched = useMemo(() => {
    if (isSearching) return []
    return [...googleUnmatched].sort((a, b) =>
      (a.display_name ?? a.email ?? "").localeCompare(
        b.display_name ?? b.email ?? "",
        "he",
      ),
    )
  }, [googleUnmatched, isSearching])

  const onWhachatCount = filtered.length + browseGoogleMatched.length

  const showEmailAdd =
    looksLikeEmail(query) &&
    !filtered.some((u) => (u.email ?? "").toLowerCase() === q.toLowerCase()) &&
    !googleSuggestions.some(
      (s) =>
        s.kind === "matched" &&
        (s.profile.email ?? "").toLowerCase() === q.toLowerCase(),
    ) &&
    !selected.some((u) => (u.email ?? "").toLowerCase() === q.toLowerCase())

  const handleSyncGoogle = async () => {
    if (syncing) return
    setSyncing(true)
    setGoogleError(null)
    setActionError(null)
    try {
      const result = await syncGoogleContactsOrConnect()
      if (result === "redirecting") return
      setGoogleMatched(result.matched)
      setGoogleUnmatched(result.unmatched)
      setHasSyncedGoogle(true)
      const contactsRes = await fetchContacts(currentUserId)
      setUsers(contactsRes.users)
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "נכשל בסנכרון מגוגל")
    } finally {
      setSyncing(false)
    }
  }

  const toggle = (u: Profile) => {
    setSelected((prev) =>
      prev.some((p) => p.id === u.id) ? prev.filter((p) => p.id !== u.id) : [...prev, u],
    )
  }

  const handleAddByEmail = async (email?: string) => {
    const target = (email ?? query).trim()
    if (busy || !looksLikeEmail(target)) return
    setBusy(true)
    setActionError(null)
    try {
      const profile = await findUserByEmail(target)
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

  const renderToggleRow = (u: Profile, key: string) => {
    const isSel = selected.some((p) => p.id === u.id)
    return (
      <button
        key={key}
        type="button"
        onClick={() => toggle(u)}
        className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-[var(--wa-hover)]"
      >
        <div className="relative">
          <Avatar name={u.display_name} url={u.avatar_url} size={48} />
          {isSel && (
            <span className="absolute -bottom-0.5 -left-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#00a884]">
              <Check className="h-3 w-3 text-white" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-2.5 text-right">
          <div className="truncate text-[var(--wa-text)]">{u.display_name ?? u.email}</div>
          <div className="truncate text-sm text-[var(--wa-text-secondary)]">{u.email ?? u.about ?? "זמין"}</div>
        </div>
      </button>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={step === "members" ? "הוספת חברים לקבוצה" : "קבוצה חדשה"}>
      {step === "members" ? (
        <>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-[var(--wa-border)] p-3">
              {selected.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u)}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--wa-header)] py-1 pl-2 pr-1 text-sm"
                >
                  <Avatar name={u.display_name} url={u.avatar_url} size={24} />
                  <span className="text-[var(--wa-text)]">{u.display_name ?? u.email}</span>
                  <X className="h-3.5 w-3.5 text-[var(--wa-text-secondary)]" />
                </button>
              ))}
            </div>
          )}
          <div className="p-3">
            <div className="flex items-center gap-3 rounded-lg bg-[var(--wa-header)] px-4 py-2">
              <Search className="h-4 w-4 text-[var(--wa-text-secondary)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return
                  e.preventDefault()
                  const top = googleSuggestions[0]
                  if (top?.kind === "matched") toggle(top.profile)
                  else if (top?.kind === "unmatched" && top.contact.email) {
                    void handleAddByEmail(top.contact.email)
                  } else if (showEmailAdd) void handleAddByEmail()
                  else if (filtered[0]) toggle(filtered[0])
                }}
                placeholder="הקלד שם או מייל — יציע מאנשי הקשר בגוגל"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--wa-text-secondary)]"
              />
            </div>
            <p className="mt-2 px-1 text-xs leading-relaxed text-[var(--wa-text-secondary)]">
              {hasSyncedGoogle
                ? "בזמן ההקלדה מוצגות הצעות מאנשי הקשר שסנכרנת מגוגל."
                : "סנכרן פעם אחת מגוגל — ואז חיפוש לפי שם או מייל יציע אוטומטית."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleSyncGoogle()}
            disabled={syncing}
            className="flex w-full items-center gap-3 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-5 py-3.5 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--wa-panel)] text-[#1a73e8] shadow-sm">
              <RefreshCw className={`h-6 w-6 ${syncing ? "animate-spin" : ""}`} />
            </div>
            <div className="min-w-0 flex-1 text-right">
              <div className="font-medium text-[var(--wa-text)]">
                {syncing
                  ? "מסנכרן מגוגל..."
                  : hasSyncedGoogle
                    ? "סנכרן שוב מגוגל"
                    : "סנכרן אנשי קשר מגוגל"}
              </div>
              <div className="text-sm text-[var(--wa-text-secondary)]">
                {hasSyncedGoogle
                  ? `${googleMatched.length + googleUnmatched.length} אנשי קשר נשמרו · לחץ לעדכון`
                  : "חובה לסנכרן פעם אחת כדי לקבל הצעות אוטומטיות"}
              </div>
            </div>
          </button>

          {actionError && (
            <div className="mx-4 mb-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {googleError && (
            <div className="mx-4 mb-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{googleError}</span>
            </div>
          )}

          {showEmailAdd && (
            <button
              type="button"
              onClick={() => void handleAddByEmail()}
              disabled={busy}
              className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--wa-accent-soft)] text-[#008069]">
                <Mail className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1 text-right">
                <div className="font-medium text-[var(--wa-text)]">הוסף לפי מייל</div>
                <div className="truncate text-sm text-[var(--wa-text-secondary)]">{q}</div>
              </div>
            </button>
          )}

          {/* WhaChat contacts first */}
          {onWhachatCount > 0 && (
            <div className="px-5 py-2 text-xs font-medium text-[#008069]">
              {isSearching ? "ב-WhaChat" : "אנשי קשר ב-WhaChat"}
            </div>
          )}

          {filtered.map((u) => renderToggleRow(u, u.id))}

          {!isSearching &&
            browseGoogleMatched.map((u) => renderToggleRow(u, `g-${u.id}`))}

          {isSearching && googleSuggestions.length > 0 && (
            <>
              <div className="px-5 py-2 text-xs font-medium text-[#1a73e8]">הצעות מגוגל</div>
              {googleSuggestions.map((s) =>
                s.kind === "matched" ? (
                  renderToggleRow(s.profile, `gs-${s.profile.id}`)
                ) : (
                  <button
                    key={`gu-${s.contact.id}`}
                    type="button"
                    onClick={() => {
                      if (s.contact.email) void handleAddByEmail(s.contact.email)
                    }}
                    disabled={busy || !s.contact.email}
                    className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
                  >
                    <Avatar
                      name={s.contact.display_name ?? s.contact.email}
                      url={s.contact.photo_url}
                      size={48}
                    />
                    <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-2.5 text-right">
                      <div className="truncate text-[var(--wa-text)]">
                        {s.contact.display_name ?? s.contact.email}
                      </div>
                      <div className="truncate text-sm text-[var(--wa-text-secondary)]">
                        {s.contact.email
                          ? `${s.contact.email} · לא ב-WhaChat`
                          : "לא ב-WhaChat"}
                      </div>
                    </div>
                  </button>
                ),
              )}
            </>
          )}

          {!isSearching && browseGoogleUnmatched.length > 0 && (
            <>
              <div className="px-5 py-2 text-xs font-medium text-[var(--wa-text-secondary)]">לא ב-WhaChat</div>
              {browseGoogleUnmatched.map((c) => (
                <div
                  key={c.id}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-right opacity-70"
                >
                  <Avatar name={c.display_name ?? c.email} url={c.photo_url} size={48} />
                  <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-2.5 text-right">
                    <div className="truncate text-[var(--wa-text)]">{c.display_name ?? c.email}</div>
                    <div className="truncate text-sm text-[var(--wa-text-secondary)]">לא ב-WhaChat</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {!busy &&
            filtered.length === 0 &&
            googleSuggestions.length === 0 &&
            browseGoogleMatched.length === 0 &&
            browseGoogleUnmatched.length === 0 &&
            !showEmailAdd && (
              <div className="p-6 text-center text-sm text-[var(--wa-text-secondary)]">
                {isSearching
                  ? hasSyncedGoogle
                    ? "לא נמצאו הצעות תואמות"
                    : "אין עדיין אנשי קשר מסונכרנים מגוגל"
                  : "אין אנשי קשר עדיין — סנכרן מגוגל או הוסף לפי מייל"}
              </div>
            )}

          {selected.length > 0 && (
            <div className="sticky bottom-0 flex justify-start bg-[var(--wa-panel)] p-4">
              <button
                type="button"
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
            type="button"
            onClick={() => setStep("members")}
            className="mb-4 flex items-center gap-2 text-sm text-[#008069]"
          >
            <ArrowLeft className="h-4 w-4 rotate-180" />
            חזרה לבחירת חברים
          </button>
          <div className="mb-6 flex flex-col items-center">
            <Avatar name={groupName || "?"} isGroup size={80} />
          </div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--wa-text)]">שם הקבוצה</label>
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="הזן שם קבוצה"
            autoFocus
            className="w-full border-b-2 border-[#00a884] bg-transparent py-2 text-[var(--wa-text)] outline-none"
          />
          <div className="mt-2 text-sm text-[var(--wa-text-secondary)]">{selected.length} חברים נבחרו</div>
          {actionError && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {actionError}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleCreate()}
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
