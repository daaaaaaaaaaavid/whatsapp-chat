"use client"

import type { Conversation, Profile } from "@/lib/types"
import type { ChatPrefs } from "@/lib/chat-prefs"
import { Avatar } from "./avatar"
import {
  convAvatarUrl,
  convDisplayName,
  isSelfConversation,
  messagePreview,
} from "@/lib/conversation-display"
import { formatChatListTime } from "@/lib/format"
import { MessageTicks } from "./message-ticks"
import { messageTickStatus } from "@/lib/message-status"
import { Archive, Download, Mail, Pin, Search, Star, X, Briefcase, User } from "lucide-react"
import { chatRequestView } from "@/lib/chat-request"
import { isValidEmail } from "@/lib/validation"
import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import type { ChatSpace } from "@/lib/chat-space"
import { usePwaInstall } from "@/lib/use-pwa-install"

type FilterId = "all" | "unread" | "favorites" | "groups"

type Props = {
  conversations: Conversation[]
  loading: boolean
  currentUser: Profile
  activeId: string | null
  prefs: ChatPrefs
  activeSpace: ChatSpace
  onSelect: (conv: Conversation) => void
  onToggleArchive: (id: string) => void
  onToggleFavorite: (id: string) => void
  onTogglePinned: (id: string) => void
  onMoveToSpace?: (id: string, space: ChatSpace) => void
  onStartByEmail?: (email: string) => Promise<void>
}

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "unread", label: "לא נקראו" },
  { id: "favorites", label: "מועדפים" },
  { id: "groups", label: "קבוצות" },
]

export function ChatList({
  conversations,
  loading,
  currentUser,
  activeId,
  prefs,
  activeSpace,
  onSelect,
  onToggleArchive,
  onToggleFavorite,
  onTogglePinned,
  onMoveToSpace,
  onStartByEmail,
}: Props) {
  const { showBanner, install, canInstall, iosHint } = usePwaInstall()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<FilterId>("all")
  const [showArchive, setShowArchive] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [startingEmail, setStartingEmail] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const archivedSet = useMemo(() => new Set(prefs.archived), [prefs.archived])
  const favoriteSet = useMemo(() => new Set(prefs.favorites), [prefs.favorites])
  const pinnedSet = useMemo(() => new Set(prefs.pinned), [prefs.pinned])

  const archivedConvs = useMemo(
    () => conversations.filter((c) => archivedSet.has(c.id)),
    [conversations, archivedSet],
  )

  const incomingRequests = useMemo(() => {
    if (showArchive) return []
    const q = query.trim().toLowerCase()
    return conversations.filter((c) => {
      if (archivedSet.has(c.id)) return false
      if (chatRequestView(c, currentUser.id) !== "incoming") return false
      if (!q) return true
      return convDisplayName(c, currentUser.id).toLowerCase().includes(q)
    })
  }, [archivedSet, conversations, currentUser.id, query, showArchive])

  const emailQuery = isValidEmail(query.trim()) ? query.trim() : ""

  const filtered = useMemo(() => {
    let list = conversations.filter((c) => {
      const view = chatRequestView(c, currentUser.id)
      if (view === "hidden" || view === "incoming") return false
      return showArchive ? archivedSet.has(c.id) : !archivedSet.has(c.id)
    })

    if (filter === "unread") list = list.filter((c) => (c.unread_count ?? 0) > 0)
    if (filter === "favorites") list = list.filter((c) => favoriteSet.has(c.id))
    if (filter === "groups") list = list.filter((c) => c.is_group)

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((c) => convDisplayName(c, currentUser.id).toLowerCase().includes(q))
    }

    return [...list].sort((a, b) => {
      const aSelf = isSelfConversation(a, currentUser.id) ? 1 : 0
      const bSelf = isSelfConversation(b, currentUser.id) ? 1 : 0
      if (aSelf !== bSelf) return bSelf - aSelf
      const ap = pinnedSet.has(a.id) || aSelf ? 1 : 0
      const bp = pinnedSet.has(b.id) || bSelf ? 1 : 0
      if (ap !== bp) return bp - ap
      const at = a.last_message?.created_at ?? a.updated_at
      const bt = b.last_message?.created_at ?? b.updated_at
      return new Date(bt).getTime() - new Date(at).getTime()
    })
  }, [
    conversations,
    showArchive,
    archivedSet,
    filter,
    favoriteSet,
    query,
    currentUser.id,
    pinnedSet,
  ])

  const startByEmail = async () => {
    if (!onStartByEmail || !emailQuery || startingEmail) return
    setStartingEmail(true)
    setStartError(null)
    try {
      await onStartByEmail(emailQuery)
      setQuery("")
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "נכשל בפתיחת שיחה")
    } finally {
      setStartingEmail(false)
    }
  }

  const archiveUnread = archivedConvs.reduce((sum, c) => sum + (c.unread_count ?? 0), 0)

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--wa-panel)]">
      <div className="px-3 pb-2">
        <div className="wa-search flex flex-1 items-center gap-3 rounded-full px-4 py-2">
          <Search className="h-4 w-4 text-[var(--wa-text-secondary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש צ'אט קיים או התחלת צ'אט חדש"
            className="flex-1 bg-transparent py-1 text-sm text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-secondary)]"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="נקה">
              <X className="h-4 w-4 text-[var(--wa-text-secondary)]" />
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id)
                setShowArchive(false)
              }}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition",
                filter === f.id && !showArchive
                  ? "wa-chip-active font-medium"
                  : "bg-[var(--wa-header)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-active)] hover:text-[var(--wa-text)]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="wa-scroll flex-1 overflow-y-auto">
        {!showArchive && (
          <button
            type="button"
            onClick={() => setShowArchive(true)}
            className="flex w-full items-center gap-4 px-4 py-3 text-right transition hover:bg-[var(--wa-hover)]"
          >
            <div className="flex h-12 w-12 items-center justify-center text-[#00a884]">
              <Archive className="h-5 w-5" />
            </div>
            <div className="flex flex-1 items-center justify-between border-b border-[var(--wa-border)] pb-3">
              <span className="font-medium text-[var(--wa-text)]">ארכיון</span>
              {archiveUnread > 0 && (
                <span className="text-sm font-medium text-[#25d366]">{archiveUnread}</span>
              )}
              {archiveUnread === 0 && archivedConvs.length > 0 && (
                <span className="text-sm text-[var(--wa-text-secondary)]">{archivedConvs.length}</span>
              )}
            </div>
          </button>
        )}

        {showArchive && (
          <button
            type="button"
            onClick={() => setShowArchive(false)}
            className="flex w-full items-center gap-2 border-b border-[var(--wa-border)] px-4 py-3 text-sm text-[#00a884]"
          >
            ← חזרה לצ&apos;אטים
          </button>
        )}

        {emailQuery && onStartByEmail && (
          <button
            type="button"
            disabled={startingEmail}
            onClick={() => void startByEmail()}
            className="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-right transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white">
              <Mail className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 text-right">
              <div className="truncate font-medium text-[var(--wa-text)]">שיחה חדשה</div>
              <div className="truncate text-sm text-[var(--wa-text-secondary)]">
                {startingEmail ? "פותח..." : `${emailQuery} · הצ'אט ייפתח, והוא יוכל לענות או לסגור`}
              </div>
            </div>
          </button>
        )}

        {startError && (
          <p className="px-4 pb-2 text-center text-xs text-red-600 dark:text-red-300">{startError}</p>
        )}

        {!showArchive && incomingRequests.length > 0 && (
          <div className="pb-1">
            <div className="px-4 pb-1 pt-2 text-xs font-medium text-[var(--wa-teal-dark)]">שיחות חדשות</div>
            {incomingRequests.map((conv) => {
              const name = convDisplayName(conv, currentUser.id)
              const last = conv.last_message
              const isActive = conv.id === activeId
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => onSelect(conv)}
                  className={cn(
                    "wa-interactive-row mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-right hover:bg-[var(--wa-hover)]",
                    isActive && "bg-[var(--wa-active)]",
                  )}
                >
                  <Avatar name={name} url={convAvatarUrl(conv, currentUser.id)} size={49} />
                  <div className="min-w-0 flex-1 text-right">
                    <div className="truncate text-[var(--wa-text)]">{name}</div>
                    <div className="truncate text-sm text-[var(--wa-teal-dark)]">
                          {last && !last.deleted_at ? messagePreview(last) : "שלח לך הודעה"}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {loading ? (
          <ChatListSkeleton />
        ) : filtered.length === 0 && incomingRequests.length === 0 && !emailQuery ? (
          <div className="p-8 text-center text-sm text-[var(--wa-text-secondary)]">
            {query
              ? "לא נמצאו תוצאות"
              : showArchive
                ? "אין צ'אטים בארכיון"
                : "אין צ'אטים עדיין. התחל שיחה חדשה!"}
          </div>
        ) : (
          filtered.map((conv) => {
            const name = convDisplayName(conv, currentUser.id)
            const last = conv.last_message
            const isMine = last?.sender_id === currentUser.id
            const isActive = conv.id === activeId
            const isSelf = isSelfConversation(conv, currentUser.id)
            const isPinned = isSelf || pinnedSet.has(conv.id)
            const isFav = favoriteSet.has(conv.id)
            const requestView = chatRequestView(conv, currentUser.id)
            const othersCount = (conv.participants ?? []).filter((p) => p.user_id !== currentUser.id).length
            const tickStatus = isMine && last ? messageTickStatus(last, othersCount) : null
            const lastViewCount = (last?.reads ?? []).filter((r) => r.user_id !== last?.sender_id).length
            return (
              <div key={conv.id} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(conv)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenuId(conv.id)
                  }}
                  className={cn(
                    "wa-interactive-row mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-right hover:bg-[var(--wa-hover)]",
                    isActive && "bg-[var(--wa-active)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--wa-teal)_32%,transparent)] hover:bg-[var(--wa-active)]",
                  )}
                >
                  <Avatar
                    name={name}
                    url={convAvatarUrl(conv, currentUser.id)}
                    isGroup={conv.is_group}
                    isSelf={isSelf}
                    size={49}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[var(--wa-text)]">{name}</span>
                        {requestView === "outgoing" && (
                          <span className="shrink-0 rounded-full bg-[var(--wa-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--wa-teal-dark)]">
                            ממתין
                          </span>
                        )}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {isPinned && <Pin className="h-3 w-3 text-[var(--wa-text-secondary)]" />}
                        {last && (
                          <span
                            className={cn(
                              "text-xs",
                              conv.unread_count ? "font-medium text-[var(--wa-teal-dark)]" : "text-[var(--wa-text-secondary)]",
                            )}
                          >
                            {formatChatListTime(last.created_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1 truncate text-sm text-[var(--wa-text-secondary)]">
                        {tickStatus && last && !last.deleted_at && (
                          <MessageTicks status={tickStatus} isGroup={conv.is_group} viewCount={lastViewCount} />
                        )}
                        <span className="truncate">
                          {requestView === "declined"
                            ? "הצ'אט נסגר"
                              : requestView === "outgoing" && !last
                              ? "ממתין לתשובה"
                              : last?.deleted_at
                                ? "ההודעה נמחקה"
                                : messagePreview(last)}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {isFav && <Star className="h-3.5 w-3.5 fill-[#25d366] text-[#25d366]" />}
                        {!!conv.unread_count && (
                          <span className="wa-badge flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                {menuId === conv.id && (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-30"
                      aria-label="סגור תפריט"
                      onClick={() => setMenuId(null)}
                    />
                    <div className="wa-menu absolute left-3 top-12 z-40 w-44 py-1">
                      {!isSelf && (
                        <button
                          type="button"
                          className="block w-full px-4 py-2 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                          onClick={() => {
                            onTogglePinned(conv.id)
                            setMenuId(null)
                          }}
                        >
                          {pinnedSet.has(conv.id) ? "בטל נעיצה" : "נעץ צ'אט"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="block w-full px-4 py-2 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                        onClick={() => {
                          onToggleFavorite(conv.id)
                          setMenuId(null)
                        }}
                      >
                        {isFav ? "הסר ממועדפים" : "הוסף למועדפים"}
                      </button>
                      <button
                        type="button"
                        className="block w-full px-4 py-2 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                        onClick={() => {
                          onToggleArchive(conv.id)
                          setMenuId(null)
                        }}
                      >
                        {archivedSet.has(conv.id) ? "הוצא מארכיון" : "העבר לארכיון"}
                      </button>
                      {onMoveToSpace && (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-4 py-2 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                          onClick={() => {
                            onMoveToSpace(conv.id, activeSpace === "work" ? "personal" : "work")
                            setMenuId(null)
                          }}
                        >
                          {activeSpace === "work" ? (
                            <>
                              <User className="h-4 w-4 text-[var(--wa-text-secondary)]" />
                              העבר לאישי
                            </>
                          ) : (
                            <>
                              <Briefcase className="h-4 w-4 text-[var(--wa-text-secondary)]" />
                              העבר לעבודה
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      {showBanner && (
        <div className="flex items-center gap-3 border-t border-[var(--wa-border)] bg-[var(--wa-header)] px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
            <Download className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--wa-text)]">התקן את WhaChat כאפליקציה</div>
            <div className="text-xs text-[var(--wa-text-secondary)]">
              {iosHint
                ? "הוסף למסך הבית לגישה מהירה"
                : canInstall
                  ? "פתח בחלון נפרד עם גישה מהירה"
                  : "זמין ב־Chrome / Edge · או מתפריט הדפדפן"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void install()}
            className="shrink-0 rounded-full bg-[#00a884] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#06cf9c]"
          >
            התקן
          </button>
        </div>
      )}
    </div>
  )
}

const SKELETON_ROWS = [72, 56, 64, 48, 68, 52, 60]

function ChatListSkeleton() {
  return (
    <div aria-busy="true" aria-label="טוען צ'אטים">
      {SKELETON_ROWS.map((width, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="wa-skeleton h-[49px] w-[49px] shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 border-b border-[var(--wa-border)] pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="wa-skeleton h-3.5 rounded-full" style={{ width: `${width / 1.6}%` }} />
              <div className="wa-skeleton h-2.5 w-8 rounded-full" />
            </div>
            <div className="wa-skeleton h-3 rounded-full" style={{ width: `${width}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
