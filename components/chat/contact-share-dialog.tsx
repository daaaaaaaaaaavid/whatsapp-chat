"use client"

import { useEffect, useMemo, useState } from "react"
import { Modal } from "./modal"
import { Avatar } from "./avatar"
import { fetchContacts } from "@/lib/chat-actions"
import {
  contactMatchScore,
  contactMatchesQuery,
  fetchGoogleContacts,
} from "@/lib/google-contacts-client"
import { buildContactPayload } from "@/lib/contact-message"
import type { ContactPayload, GoogleContact, Profile } from "@/lib/types"
import { Search, UserRound, LoaderCircle } from "lucide-react"

type Props = {
  open: boolean
  currentUserId: string
  onClose: () => void
  onSubmit: (payload: ContactPayload) => void | Promise<void>
}

type Row =
  | { key: string; kind: "profile"; profile: Profile; score: number }
  | { key: string; kind: "google"; contact: GoogleContact; score: number }

export function ContactShareDialog({ open, currentUserId, onClose, onSubmit }: Props) {
  const [users, setUsers] = useState<Profile[]>([])
  const [googleMatched, setGoogleMatched] = useState<Profile[]>([])
  const [googleUnmatched, setGoogleUnmatched] = useState<GoogleContact[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setError(null)
    setBusy(false)
    setLoading(true)
    void (async () => {
      const [contactsRes, googleRes] = await Promise.all([
        fetchContacts(currentUserId),
        fetchGoogleContacts(),
      ])
      setUsers(contactsRes.users)
      setGoogleMatched(googleRes.matched)
      setGoogleUnmatched(googleRes.unmatched)
      setLoading(false)
      if (contactsRes.error) setError(contactsRes.error)
    })()
  }, [open, currentUserId])

  const rows = useMemo(() => {
    const q = query.trim()
    const seen = new Set<string>()
    const list: Row[] = []

    const addProfile = (profile: Profile) => {
      if (profile.id === currentUserId || seen.has(profile.id)) return
      if (q && !contactMatchesQuery(profile.display_name, profile.email, q)) return
      seen.add(profile.id)
      list.push({
        key: `p-${profile.id}`,
        kind: "profile",
        profile,
        score: contactMatchScore(profile.display_name, profile.email, q),
      })
    }

    for (const profile of [...users, ...googleMatched]) {
      addProfile(profile)
    }

    for (const contact of googleUnmatched) {
      if (q && !contactMatchesQuery(contact.display_name, contact.email, q)) continue
      list.push({
        key: `g-${contact.id}`,
        kind: "google",
        contact,
        score: contactMatchScore(contact.display_name, contact.email, q),
      })
    }

    return list.sort((a, b) => a.score - b.score).slice(0, 80)
  }, [users, googleMatched, googleUnmatched, query, currentUserId])

  const send = async (payload: ContactPayload | null) => {
    if (!payload || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(payload)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "שליחת איש הקשר נכשלה")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="שיתוף איש קשר">
      <div className="flex flex-col gap-3 p-4" dir="rtl">
        <div className="flex items-start gap-3 rounded-xl bg-[var(--wa-header)] px-3 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#53bdeb]/20 text-[#53bdeb]">
            <UserRound className="h-5 w-5" />
          </div>
          <p className="text-sm leading-relaxed text-[var(--wa-text-secondary)]">
            בחר איש קשר מהרשימה כדי לשלוח כרטיס עם שם ופרטי יצירת קשר.
          </p>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--wa-text-secondary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש אנשי קשר…"
            className="w-full rounded-xl border border-black/10 bg-[var(--wa-panel)] py-2.5 pr-10 pl-3 text-sm text-[var(--wa-text)] outline-none ring-[#00a884]/40 focus:ring-2"
            autoFocus
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--wa-text-secondary)]">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              טוען אנשי קשר…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--wa-text-secondary)]">לא נמצאו אנשי קשר</p>
          ) : (
            rows.map((row) => {
              if (row.kind === "profile") {
                const { profile } = row
                const name = profile.display_name || profile.email || "משתמש"
                return (
                  <button
                    key={row.key}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void send(
                        buildContactPayload({
                          displayName: name,
                          email: profile.email,
                          photoUrl: profile.avatar_url,
                          matchedProfileId: profile.id,
                        }),
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
                  >
                    <Avatar url={profile.avatar_url} name={name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[var(--wa-text)]">{name}</div>
                      {profile.email && (
                        <div className="truncate text-xs text-[var(--wa-text-secondary)]">{profile.email}</div>
                      )}
                    </div>
                  </button>
                )
              }

              const { contact } = row
              const name = contact.display_name || contact.email || "איש קשר"
              return (
                <button
                  key={row.key}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void send(
                      buildContactPayload({
                        displayName: name,
                        email: contact.email,
                        photoUrl: contact.photo_url,
                        matchedProfileId: contact.matched_profile_id,
                      }),
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
                >
                  <Avatar url={contact.photo_url} name={name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[var(--wa-text)]">{name}</div>
                    {contact.email && (
                      <div className="truncate text-xs text-[var(--wa-text-secondary)]">{contact.email}</div>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}
