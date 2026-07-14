"use client"

import { useEffect, useMemo, useState } from "react"
import type { Conversation, Message, Profile } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"
import {
  blockUser,
  createConversationInvite,
  leaveConversation,
} from "@/lib/chat-actions"
import { Avatar } from "./avatar"
import { convAvatarUrl, convDisplayName, isSelfConversation, otherParticipantId } from "@/lib/conversation-display"
import { mediaItemsFromMessages, type GalleryItem } from "./media-gallery"
import { X, Bell, BellOff, Ban, Trash2, Users, Archive, Star, ImageIcon, Pin, Link2, Check, Play } from "lucide-react"

type Props = {
  conversation: Conversation
  currentUser: Profile
  onClose: () => void
  onToggleArchive?: () => void
  onToggleFavorite?: () => void
  onToggleMute?: () => void
  onTogglePinned?: () => void
  isArchived?: boolean
  isFavorite?: boolean
  isMuted?: boolean
  isPinned?: boolean
  onOpenMedia?: (messageId: string) => void
  onLeftOrDeleted?: () => void
}

export function ConversationInfo({
  conversation,
  currentUser,
  onClose,
  onToggleArchive,
  onToggleFavorite,
  onToggleMute,
  onTogglePinned,
  isArchived,
  isFavorite,
  isMuted,
  isPinned,
  onOpenMedia,
  onLeftOrDeleted,
}: Props) {
  const [mediaTab, setMediaTab] = useState<"all" | "image" | "video" | "file">("all")
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])

  // One-shot media load — do NOT reuse useMessages (same realtime channel as the open chat).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversation.id)
          .not("file_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(120)
        if (!cancelled) setMessages((data ?? []) as Message[])
      } catch {
        if (!cancelled) setMessages([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [conversation.id])

  const isSelf = isSelfConversation(conversation, currentUser.id)
  const name = convDisplayName(conversation, currentUser.id)
  const avatar = convAvatarUrl(conversation, currentUser.id)
  const others = (conversation.participants ?? []).filter((p) => p.user_id !== currentUser.id)
  const other = others[0]?.profile

  const mediaItems = useMemo(() => mediaItemsFromMessages(messages), [messages])
  const filteredMedia = useMemo(() => {
    if (mediaTab === "all") return mediaItems
    return mediaItems.filter((m) => m.type === mediaTab)
  }, [mediaItems, mediaTab])

  const handleLeaveOrDelete = async () => {
    if (busy || isSelf) return
    const label = conversation.is_group ? "לצאת מהקבוצה" : "למחוק את הצ'אט"
    if (!window.confirm(`האם אתה בטוח שברצונך ${label}?`)) return
    setBusy(true)
    setActionError(null)
    try {
      await leaveConversation(conversation.id, currentUser.id)
      onLeftOrDeleted?.()
      onClose()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "הפעולה נכשלה")
    } finally {
      setBusy(false)
    }
  }

  const handleBlock = async () => {
    if (busy || conversation.is_group || isSelf) return
    const otherId = otherParticipantId(conversation, currentUser.id)
    if (!otherId) return
    if (!window.confirm("לחסום את איש הקשר ולהסיר את השיחה?")) return
    setBusy(true)
    setActionError(null)
    try {
      await blockUser(currentUser.id, otherId)
      await leaveConversation(conversation.id, currentUser.id)
      onLeftOrDeleted?.()
      onClose()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "החסימה נכשלה")
    } finally {
      setBusy(false)
    }
  }

  const handleInvite = async () => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      const token = await createConversationInvite(conversation.id, currentUser.id)
      const url = `${window.location.origin}/invite/${token}`
      await navigator.clipboard.writeText(url)
      setInviteCopied(true)
      window.setTimeout(() => setInviteCopied(false), 2500)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "יצירת הקישור נכשלה")
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="flex h-full min-h-0 w-full max-w-md shrink-0 flex-col border-r border-[var(--wa-border)] bg-[var(--wa-panel)] lg:w-[360px]">
      <header className="flex h-16 shrink-0 items-center gap-4 bg-[#00a884] px-4 text-white">
        <button type="button" onClick={onClose} aria-label="סגור" className="rounded-full p-1 transition hover:bg-white/10">
          <X className="h-6 w-6" />
        </button>
        <h2 className="text-lg font-medium">
          {isSelf ? "פרטי השיחה" : conversation.is_group ? "פרטי קבוצה" : "פרטי איש קשר"}
        </h2>
      </header>

      <div className="wa-scroll min-h-0 flex-1 overflow-y-auto bg-[var(--wa-header)]">
        <div className="flex flex-col items-center bg-[var(--wa-panel)] px-6 py-8 shadow-sm">
          <Avatar name={name} url={avatar} isGroup={conversation.is_group} isSelf={isSelf} size={200} />
          <h3 className="mt-4 text-2xl font-light text-[var(--wa-text)]">{name}</h3>
          {isSelf && <p className="mt-1 text-sm text-[var(--wa-text-secondary)]">הודעות שמורות בשבילך בלבד</p>}
          {!conversation.is_group && !isSelf && other?.email && (
            <p className="mt-1 text-sm text-[var(--wa-text-secondary)]" dir="ltr">
              {other.email}
            </p>
          )}
          {conversation.is_group && (
            <p className="mt-1 text-sm text-[var(--wa-text-secondary)]">
              קבוצה · {(conversation.participants ?? []).length} משתתפים
            </p>
          )}
        </div>

        {!conversation.is_group && !isSelf && (
          <div className="mt-2 bg-[var(--wa-panel)] px-6 py-4 shadow-sm">
            <div className="text-sm text-[#008069]">מידע</div>
            <p className="mt-1 text-[var(--wa-text)]">{other?.about ?? "זמין"}</p>
          </div>
        )}

        {conversation.is_group && (
          <div className="mt-2 bg-[var(--wa-panel)] shadow-sm">
            <div className="flex items-center gap-2 px-6 py-3 text-sm text-[#008069]">
              <Users className="h-4 w-4" />
              {(conversation.participants ?? []).length} משתתפים
            </div>
            {(conversation.participants ?? []).map((p) => {
              const profile = p.profile
              const label =
                p.user_id === currentUser.id
                  ? "אתה"
                  : (profile?.display_name ?? profile?.email ?? "משתמש")
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar name={profile?.display_name} url={profile?.avatar_url} size={40} />
                  <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[var(--wa-text)]">{label}</span>
                      {p.is_admin && (
                        <span className="shrink-0 rounded bg-[var(--wa-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[#008069]">
                          מנהל/ת
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm text-[var(--wa-text-secondary)]">{profile?.about ?? "זמין"}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-2 bg-[var(--wa-panel)] shadow-sm">
          <div className="flex items-center gap-2 px-6 py-3 text-sm text-[#008069]">
            <ImageIcon className="h-4 w-4" />
            מדיה, קישורים ומסמכים
            <span className="mr-auto text-[var(--wa-text-secondary)]">{mediaItems.length}</span>
          </div>
          <div className="flex gap-1 px-4 pb-2">
            {(
              [
                ["all", "הכל"],
                ["image", "תמונות"],
                ["video", "סרטונים"],
                ["file", "קבצים"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMediaTab(id)}
                className={`rounded-full px-3 py-1 text-xs ${
                  mediaTab === id ? "bg-[var(--wa-accent-soft)] text-[#008069]" : "bg-[var(--wa-header)] text-[var(--wa-text-secondary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {filteredMedia.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-[var(--wa-text-secondary)]">אין מדיה עדיין</p>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 px-0.5 pb-2">
              {filteredMedia.slice(0, 24).map((item: GalleryItem) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onOpenMedia?.(item.id)
                    onClose()
                  }}
                  className="relative aspect-square overflow-hidden bg-[#e9edef]"
                >
                  {item.type === "image" ? (
                    <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : item.type === "video" ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#111b21] text-white">
                      <Play className="h-6 w-6 fill-white" />
                      <span className="text-[10px] text-white/70">סרטון</span>
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-[var(--wa-text-secondary)]">
                      קובץ
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 bg-[var(--wa-panel)] shadow-sm">
          {!isSelf && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleInvite()}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)] disabled:opacity-50"
            >
              {inviteCopied ? <Check className="h-5 w-5 text-[#00a884]" /> : <Link2 className="h-5 w-5 text-[var(--wa-text-secondary)]" />}
              {inviteCopied ? "הקישור הועתק" : "העתק קישור הזמנה"}
            </button>
          )}
          {!isSelf && onTogglePinned && (
            <button
              type="button"
              onClick={onTogglePinned}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
            >
              <Pin className={`h-5 w-5 ${isPinned ? "text-[#00a884]" : "text-[var(--wa-text-secondary)]"}`} />
              {isPinned ? "בטל נעיצה" : "נעץ צ'אט"}
            </button>
          )}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
            >
              <Star className={`h-5 w-5 ${isFavorite ? "fill-[#25d366] text-[#25d366]" : "text-[var(--wa-text-secondary)]"}`} />
              {isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
            </button>
          )}
          {onToggleArchive && (
            <button
              type="button"
              onClick={onToggleArchive}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
            >
              <Archive className="h-5 w-5 text-[var(--wa-text-secondary)]" />
              {isArchived ? "הוצא מארכיון" : "העבר לארכיון"}
            </button>
          )}
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
            >
              {isMuted ? (
                <BellOff className="h-5 w-5 text-[var(--wa-text-secondary)]" />
              ) : (
                <Bell className="h-5 w-5 text-[var(--wa-text-secondary)]" />
              )}
              {isMuted ? "ביטול השתקת התראות" : "השתקת התראות"}
            </button>
          )}
          {!isSelf && !conversation.is_group && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleBlock()}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[#ea0038] transition hover:bg-[var(--wa-hover)] disabled:opacity-50"
            >
              <Ban className="h-5 w-5" />
              חסימת איש קשר
            </button>
          )}
          {!isSelf && conversation.is_group && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLeaveOrDelete()}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[#ea0038] transition hover:bg-[var(--wa-hover)] disabled:opacity-50"
            >
              <Ban className="h-5 w-5" />
              יציאה מהקבוצה
            </button>
          )}
          {!isSelf && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLeaveOrDelete()}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[#ea0038] transition hover:bg-[var(--wa-hover)] disabled:opacity-50"
            >
              <Trash2 className="h-5 w-5" />
              מחיקת הצ&apos;אט
            </button>
          )}
          {actionError && (
            <p className="px-6 py-3 text-sm text-[#ea0038]">{actionError}</p>
          )}
        </div>
      </div>
    </aside>
  )
}
