"use client"

import { useEffect, useMemo, useState } from "react"
import { Briefcase, Hash, Link2, Plus, UsersRound, Check } from "lucide-react"
import type { Conversation, Profile, WorkSpace } from "@/lib/types"
import { Avatar } from "./avatar"
import { createWorkSpaceInvite, updateWorkSpaceGoogleChatForward } from "@/lib/space-actions"
import { cn } from "@/lib/utils"

type Props = {
  spaces: WorkSpace[]
  conversations: Conversation[]
  currentUser: Profile
  selectedSpaceId: string | null
  loading?: boolean
  error?: string | null
  onSelectSpace: (spaceId: string | null) => void
  onSelectChannel: (conversation: Conversation) => void
  onCreateSpace: () => void
  onCreateChannel: (spaceId: string) => void
  onSpacesChanged?: () => void
}

export function SpacesPanel({
  spaces,
  conversations,
  currentUser,
  selectedSpaceId,
  loading,
  error,
  onSelectSpace,
  onSelectChannel,
  onCreateSpace,
  onCreateChannel,
  onSpacesChanged,
}: Props) {
  const [inviteCopied, setInviteCopied] = useState<string | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [forwardEnabled, setForwardEnabled] = useState(false)
  const [gchatBusy, setGchatBusy] = useState(false)
  const [gchatError, setGchatError] = useState<string | null>(null)
  const [gchatSaved, setGchatSaved] = useState(false)

  const selected = useMemo(
    () => spaces.find((s) => s.id === selectedSpaceId) ?? null,
    [spaces, selectedSpaceId],
  )

  const isAdmin = selected?.role === "admin"

  useEffect(() => {
    if (!selected) {
      setWebhookUrl("")
      setForwardEnabled(false)
      setGchatError(null)
      setGchatSaved(false)
      return
    }
    setWebhookUrl(selected.google_chat_webhook_url ?? "")
    setForwardEnabled(Boolean(selected.google_chat_forward_enabled))
    setGchatError(null)
    setGchatSaved(false)
  }, [selected])

  const channels = useMemo(() => {
    if (!selectedSpaceId) return []
    return conversations
      .filter((c) => c.is_group && c.work_space_id === selectedSpaceId)
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "he"))
  }, [conversations, selectedSpaceId])

  const copyInvite = async (spaceId: string) => {
    setInviteBusy(true)
    setInviteError(null)
    try {
      const token = await createWorkSpaceInvite(spaceId, currentUser.id)
      const url = `${window.location.origin}/invite/${token}`
      await navigator.clipboard.writeText(url)
      setInviteCopied(spaceId)
      window.setTimeout(() => setInviteCopied(null), 2000)
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "העתקת הזמנה נכשלה")
    } finally {
      setInviteBusy(false)
    }
  }

  const saveGoogleChat = async () => {
    if (!selected || !isAdmin) return
    setGchatBusy(true)
    setGchatError(null)
    setGchatSaved(false)
    try {
      await updateWorkSpaceGoogleChatForward({
        spaceId: selected.id,
        enabled: forwardEnabled,
        webhookUrl: webhookUrl.trim() || null,
      })
      setGchatSaved(true)
      onSpacesChanged?.()
      window.setTimeout(() => setGchatSaved(false), 2000)
    } catch (err) {
      setGchatError(err instanceof Error ? err.message : "שמירה נכשלה")
    } finally {
      setGchatBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--wa-panel)]" dir="rtl">
      <header className="flex h-[59px] shrink-0 items-center justify-between border-b border-[var(--wa-border)] px-4">
        <h2 className="text-[19px] font-medium text-[var(--wa-text)]">Spaces</h2>
        <button
          type="button"
          onClick={onCreateSpace}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#1a73e8] transition hover:bg-[#1a73e8]/10"
          aria-label="Space חדש"
          title="Space חדש"
        >
          <Plus className="h-5 w-5" />
        </button>
      </header>

      {error && (
        <p className="border-b border-[var(--wa-border)] px-4 py-3 text-xs text-[#ea0038]">{error}</p>
      )}

      {loading && spaces.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--wa-text-secondary)]">טוען Spaces...</p>
      ) : spaces.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#1a73e8]/10">
            <Briefcase className="h-12 w-12 text-[#1a73e8]" strokeWidth={1.25} />
          </div>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-[var(--wa-text-secondary)]">
            Spaces הם מרחבי צוות עם ערוצים. צור Space ראשון או הצטרף דרך קישור הזמנה.
          </p>
          <button
            type="button"
            onClick={onCreateSpace}
            className="mt-6 rounded-lg bg-[#1a73e8] px-4 py-2 text-sm font-medium text-white"
          >
            צור Space
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="wa-scroll w-[42%] shrink-0 overflow-y-auto border-l border-[var(--wa-border)]">
            <ul>
              {spaces.map((space) => {
                const active = space.id === selectedSpaceId
                return (
                  <li key={space.id}>
                    <button
                      type="button"
                      onClick={() => onSelectSpace(space.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-3 text-right transition",
                        active ? "bg-[#1a73e8]/10" : "hover:bg-[var(--wa-hover)]",
                      )}
                    >
                      <Avatar name={space.name} url={space.avatar_url} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] text-[var(--wa-text)]">{space.name}</div>
                        <div className="truncate text-xs text-[var(--wa-text-secondary)]">
                          {space.member_count ?? 0} חברים · {space.channel_count ?? 0} ערוצים
                          {space.google_chat_forward_enabled ? " · Google Chat" : ""}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="wa-scroll min-w-0 flex-1 overflow-y-auto">
            {selected ? (
              <>
                <div className="border-b border-[var(--wa-border)] px-4 py-3">
                  <div className="text-[17px] font-medium text-[var(--wa-text)]">{selected.name}</div>
                  {selected.description && (
                    <p className="mt-1 text-xs text-[var(--wa-text-secondary)]">{selected.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onCreateChannel(selected.id)}
                      className="flex items-center gap-1.5 rounded-full bg-[#1a73e8]/10 px-3 py-1.5 text-xs font-medium text-[#1a73e8]"
                    >
                      <Hash className="h-3.5 w-3.5" />
                      ערוץ חדש
                    </button>
                    <button
                      type="button"
                      disabled={inviteBusy}
                      onClick={() => void copyInvite(selected.id)}
                      className="flex items-center gap-1.5 rounded-full bg-[var(--wa-header)] px-3 py-1.5 text-xs text-[var(--wa-text)] disabled:opacity-50"
                    >
                      {inviteCopied === selected.id ? (
                        <Check className="h-3.5 w-3.5 text-[#00a884]" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5" />
                      )}
                      {inviteCopied === selected.id ? "הועתק" : "הזמנת חברים"}
                    </button>
                  </div>
                  {inviteError && <p className="mt-2 text-xs text-[#ea0038]">{inviteError}</p>}
                </div>

                {isAdmin && (
                  <div className="border-b border-[var(--wa-border)] px-4 py-4">
                    <div className="text-sm font-medium text-[var(--wa-text)]">Google Chat</div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--wa-text-secondary)]">
                      שליחה חד־כיוונית בלבד: הודעות מערוצי ה־Space יופיעו ב־Google Chat. האתר לא קורא
                      את הצ׳אטים שלך בגוגל. צור Incoming webhook ב־Google Chat (Space → Apps &amp;
                      integrations → Webhooks) והדבק כאן.
                    </p>
                    <label className="mt-3 flex items-center gap-2 text-sm text-[var(--wa-text)]">
                      <input
                        type="checkbox"
                        checked={forwardEnabled}
                        onChange={(e) => setForwardEnabled(e.target.checked)}
                        className="h-4 w-4 accent-[#1a73e8]"
                      />
                      העבר הודעות ל־Google Chat
                    </label>
                    <input
                      type="url"
                      dir="ltr"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://chat.googleapis.com/v1/spaces/..."
                      className="mt-2 w-full rounded-md border border-[var(--wa-border)] bg-transparent px-3 py-2 text-xs text-[var(--wa-text)] outline-none focus:border-[#1a73e8]"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={gchatBusy}
                        onClick={() => void saveGoogleChat()}
                        className="rounded-lg bg-[#1a73e8] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {gchatBusy ? "שומר..." : "שמור"}
                      </button>
                      {gchatSaved && (
                        <span className="text-xs text-[#00a884]">נשמר</span>
                      )}
                    </div>
                    {gchatError && <p className="mt-2 text-xs text-[#ea0038]">{gchatError}</p>}
                  </div>
                )}

                {!isAdmin && selected.google_chat_forward_enabled && (
                  <p className="border-b border-[var(--wa-border)] px-4 py-3 text-xs text-[var(--wa-text-secondary)]">
                    הודעות מערוץ זה מועברות גם ל־Google Chat (הוגדר על ידי מנהל ה־Space).
                  </p>
                )}

                {channels.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-[var(--wa-text-secondary)]">אין ערוצים עדיין</p>
                ) : (
                  <ul>
                    {channels.map((ch) => (
                      <li key={ch.id}>
                        <button
                          type="button"
                          onClick={() => onSelectChannel(ch)}
                          className="wa-interactive-row flex w-full items-center gap-3 px-4 py-3 text-right hover:bg-[var(--wa-hover)]"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1a73e8]/10 text-[#1a73e8]">
                            <Hash className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-3">
                            <div className="truncate text-[16px] text-[var(--wa-text)]">
                              #{ch.name || "ערוץ"}
                            </div>
                            <div className="truncate text-sm text-[var(--wa-text-secondary)]">
                              {(ch.unread_count ?? 0) > 0
                                ? `${ch.unread_count} חדשות`
                                : `${(ch.participants ?? []).length} משתתפים`}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <UsersRound className="h-10 w-10 text-[var(--wa-text-secondary)]" strokeWidth={1.25} />
                <p className="mt-3 text-sm text-[var(--wa-text-secondary)]">בחר Space מהרשימה</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
