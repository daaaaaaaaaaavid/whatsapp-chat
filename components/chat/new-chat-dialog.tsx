"use client"

import { useEffect, useMemo, useState } from "react"
import { Modal } from "./modal"
import { Avatar } from "./avatar"
import {
  fetchContacts,
  getOrCreateDirectConversation,
  startChatByEmail,
} from "@/lib/chat-actions"
import {
  contactMatchScore,
  contactMatchesQuery,
  fetchGoogleContacts,
  syncGoogleContactsOrConnect,
} from "@/lib/google-contacts-client"
import type { GoogleContact, Profile } from "@/lib/types"
import { isValidEmail } from "@/lib/validation"
import { Search, Users, AlertCircle, Mail, RefreshCw, MessageCircle } from "lucide-react"

type Props = {
  open: boolean
  currentUserId: string
  onClose: () => void
  onCreated: (conversationId: string) => void
  onNewGroup: () => void
  autoSyncGoogle?: boolean
  onAutoSyncGoogleConsumed?: () => void
}

function looksLikeEmail(value: string) {
  return isValidEmail(value)
}

type Suggestion =
  | { kind: "matched"; profile: Profile; score: number }
  | { kind: "unmatched"; contact: GoogleContact; score: number }

export function NewChatDialog({
  open,
  currentUserId,
  onClose,
  onCreated,
  onNewGroup,
  autoSyncGoogle = false,
  onAutoSyncGoogleConsumed,
}: Props) {
  const [users, setUsers] = useState<Profile[]>([])
  const [googleMatched, setGoogleMatched] = useState<Profile[]>([])
  const [googleUnmatched, setGoogleUnmatched] = useState<GoogleContact[]>([])
  const [hasSyncedGoogle, setHasSyncedGoogle] = useState(false)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)

  const loadLists = async () => {
    setLoading(true)
    setError(null)
    setGoogleError(null)
    const [contactsRes, googleRes] = await Promise.all([
      fetchContacts(currentUserId),
      fetchGoogleContacts(),
    ])
    setUsers(contactsRes.users)
    setError(contactsRes.error)
    setGoogleMatched(googleRes.matched)
    setGoogleUnmatched(googleRes.unmatched)
    setHasSyncedGoogle(
      Boolean(googleRes.syncedAt) ||
        googleRes.matched.length > 0 ||
        googleRes.unmatched.length > 0,
    )
    if (googleRes.error) setGoogleError(googleRes.error)
    setLoading(false)
  }

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
      if (contactsRes.error) setError(contactsRes.error)
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "נכשל בסנכרון מגוגל")
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setQuery("")
    setActionError(null)
    void loadLists()
  }, [open, currentUserId])

  useEffect(() => {
    if (!open || !autoSyncGoogle) return
    onAutoSyncGoogleConsumed?.()
    void handleSyncGoogle()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when flagged
  }, [open, autoSyncGoogle])

  const knownIds = useMemo(() => new Set(users.map((u) => u.id)), [users])
  const q = query.trim()
  const isSearching = q.length > 0

  const googleSuggestions = useMemo((): Suggestion[] => {
    if (!isSearching) return []
    const out: Suggestion[] = []

    for (const u of googleMatched) {
      if (knownIds.has(u.id)) continue
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
      // WhaChat matches first, then by score, then name
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
  }, [googleMatched, googleUnmatched, knownIds, isSearching, q])

  const filteredKnown = useMemo(() => {
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

  /** Google-matched profiles not already in the contacts list. */
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

  const onWhachatCount = filteredKnown.length + browseGoogleMatched.length

  const showEmailStart =
    looksLikeEmail(query) &&
    filteredKnown.length === 0 &&
    !googleSuggestions.some(
      (s) =>
        s.kind === "matched" &&
        (s.profile.email ?? "").toLowerCase() === q.toLowerCase(),
    )

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

  const handleSelfChat = async () => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      const convId = await getOrCreateDirectConversation(currentUserId, currentUserId)
      onCreated(convId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "נכשל בפתיחת השיחה עם עצמך")
    } finally {
      setBusy(false)
    }
  }

  const handleStartByEmail = async (email?: string) => {
    const target = (email ?? query).trim()
    if (busy || !looksLikeEmail(target)) return
    setBusy(true)
    setActionError(null)
    try {
      const convId = await startChatByEmail(currentUserId, target)
      onCreated(convId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "נכשל בפתיחת שיחה")
    } finally {
      setBusy(false)
    }
  }

  const empty =
    !loading &&
    filteredKnown.length === 0 &&
    googleSuggestions.length === 0 &&
    browseGoogleMatched.length === 0 &&
    browseGoogleUnmatched.length === 0

  return (
    <Modal open={open} onClose={onClose} title="צ'אט חדש">
      <div className="p-3">
        <div className="flex items-center gap-3 rounded-lg bg-[var(--wa-header)] px-4 py-2">
          <Search className="h-4 w-4 text-[var(--wa-text-secondary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                const top = googleSuggestions[0]
                if (top?.kind === "matched") {
                  void handleSelect(top.profile.id)
                } else if (top?.kind === "unmatched" && top.contact.email) {
                  void handleStartByEmail(top.contact.email)
                } else if (showEmailStart) {
                  void handleStartByEmail()
                } else if (filteredKnown[0]) {
                  void handleSelect(filteredKnown[0].id)
                }
              }
            }}
            placeholder="הקלד שם או מייל — יציע מאנשי הקשר בגוגל"
            autoFocus
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

      <button
        type="button"
        onClick={() => void handleSelfChat()}
        disabled={busy}
        className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white">
          <MessageCircle className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <div className="font-medium text-[var(--wa-text)]">הודעה לעצמי</div>
          <div className="text-sm text-[var(--wa-text-secondary)]">
            שליחת הודעות ושמירת דברים לעצמך
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={onNewGroup}
        className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[var(--wa-hover)]"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white">
          <Users className="h-6 w-6" />
        </div>
        <span className="font-medium text-[var(--wa-text)]">קבוצה חדשה</span>
      </button>

      {showEmailStart && (
        <button
          type="button"
          onClick={() => void handleStartByEmail()}
          disabled={busy}
          className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--wa-accent-soft)] text-[#008069]">
            <Mail className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <div className="font-medium text-[var(--wa-text)]">התחל שיחה עם מייל</div>
            <div className="truncate text-sm text-[var(--wa-text-secondary)]">{q}</div>
          </div>
        </button>
      )}

      {error && (
        <div className="mx-4 mb-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {googleError && (
        <div className="mx-4 mb-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{googleError}</span>
        </div>
      )}

      {actionError && (
        <div className="mx-4 mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-sm text-[var(--wa-text-secondary)]">טוען אנשי קשר...</div>
      ) : (
        <>
          {/* WhaChat contacts first */}
          {onWhachatCount > 0 && (
            <div className="px-5 py-2 text-xs font-medium text-[#008069]">
              {isSearching ? "ב-WhaChat" : "אנשי קשר ב-WhaChat"}
            </div>
          )}

          {filteredKnown.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => void handleSelect(u.id)}
              disabled={busy}
              className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
            >
              <Avatar name={u.display_name} url={u.avatar_url} size={48} />
              <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-2.5">
                <div className="truncate text-[var(--wa-text)]">{u.display_name ?? u.email}</div>
                <div className="truncate text-sm text-[var(--wa-text-secondary)]">{u.about ?? u.email ?? "זמין"}</div>
              </div>
            </button>
          ))}

          {!isSearching &&
            browseGoogleMatched.map((u) => (
              <button
                key={`g-${u.id}`}
                type="button"
                onClick={() => void handleSelect(u.id)}
                disabled={busy}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
              >
                <Avatar name={u.display_name} url={u.avatar_url} size={48} />
                <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-2.5">
                  <div className="truncate text-[var(--wa-text)]">{u.display_name ?? u.email}</div>
                  <div className="truncate text-sm text-[var(--wa-text-secondary)]">
                    {u.email ? `${u.email} · ב-WhaChat` : "ב-WhaChat"}
                  </div>
                </div>
              </button>
            ))}

          {isSearching && googleSuggestions.length > 0 && (
            <>
              <div className="px-5 py-2 text-xs font-medium text-[#1a73e8]">הצעות מגוגל</div>
              {googleSuggestions.map((s) =>
                s.kind === "matched" ? (
                  <button
                    key={`gs-${s.profile.id}`}
                    type="button"
                    onClick={() => void handleSelect(s.profile.id)}
                    disabled={busy}
                    className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
                  >
                    <Avatar
                      name={s.profile.display_name}
                      url={s.profile.avatar_url}
                      size={48}
                    />
                    <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-2.5">
                      <div className="truncate text-[var(--wa-text)]">
                        {s.profile.display_name ?? s.profile.email}
                      </div>
                      <div className="truncate text-sm text-[var(--wa-text-secondary)]">
                        {s.profile.email ?? "ב-WhaChat"} · ב-WhaChat
                      </div>
                    </div>
                  </button>
                ) : (
                  <button
                    key={`gu-${s.contact.id}`}
                    type="button"
                    onClick={() => {
                      if (s.contact.email) void handleStartByEmail(s.contact.email)
                    }}
                    disabled={busy || !s.contact.email}
                    className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
                  >
                    <Avatar
                      name={s.contact.display_name ?? s.contact.email}
                      url={s.contact.photo_url}
                      size={48}
                    />
                    <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-2.5">
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
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    if (c.email) void handleStartByEmail(c.email)
                  }}
                  disabled={busy || !c.email}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-right opacity-80 transition hover:bg-[var(--wa-hover)] disabled:opacity-50"
                >
                  <Avatar name={c.display_name ?? c.email} url={c.photo_url} size={48} />
                  <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-2.5">
                    <div className="truncate text-[var(--wa-text)]">{c.display_name ?? c.email}</div>
                    <div className="truncate text-sm text-[var(--wa-text-secondary)]">
                      {c.email ? `${c.email} · לא ב-WhaChat` : "לא ב-WhaChat"}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {empty && (
            <div className="space-y-2 p-6 text-center text-sm text-[var(--wa-text-secondary)]">
              <p>
                {isSearching
                  ? showEmailStart
                    ? "לחץ למעלה כדי לפתוח שיחה עם המייל הזה"
                    : hasSyncedGoogle
                      ? "לא נמצאו הצעות תואמות באנשי הקשר"
                      : "אין עדיין אנשי קשר מסונכרנים מגוגל"
                  : "אין אנשי קשר עדיין"}
              </p>
              {!isSearching && !hasSyncedGoogle && (
                <p className="text-xs leading-relaxed">
                  לחץ על &quot;סנכרן אנשי קשר מגוגל&quot; למעלה — אחר כך הקלדה תציע שמות ומיילים אוטומטית.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
