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
import { Archive, Laptop, Pin, Search, Star, X } from "lucide-react"
import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"

type FilterId = "all" | "unread" | "favorites" | "groups"

type Props = {
  conversations: Conversation[]
  loading: boolean
  currentUser: Profile
  activeId: string | null
  prefs: ChatPrefs
  onSelect: (conv: Conversation) => void
  onToggleArchive: (id: string) => void
  onToggleFavorite: (id: string) => void
  onTogglePinned: (id: string) => void
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
  onSelect,
  onToggleArchive,
  onToggleFavorite,
  onTogglePinned,
}: Props) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<FilterId>("all")
  const [showArchive, setShowArchive] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)

  const archivedSet = useMemo(() => new Set(prefs.archived), [prefs.archived])
  const favoriteSet = useMemo(() => new Set(prefs.favorites), [prefs.favorites])
  const pinnedSet = useMemo(() => new Set(prefs.pinned), [prefs.pinned])

  const archivedConvs = useMemo(
    () => conversations.filter((c) => archivedSet.has(c.id)),
    [conversations, archivedSet],
  )

  const filtered = useMemo(() => {
    let list = conversations.filter((c) =>
      showArchive ? archivedSet.has(c.id) : !archivedSet.has(c.id),
    )

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

  const archiveUnread = archivedConvs.reduce((sum, c) => sum + (c.unread_count ?? 0), 0)

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      <div className="px-3 pb-2">
        <div className="flex flex-1 items-center gap-3 rounded-lg bg-[#f0f2f5] px-4 py-1.5">
          <Search className="h-4 w-4 text-[#54656f]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש צ'אט קיים או התחלת צ'אט חדש"
            className="flex-1 bg-transparent py-1 text-sm text-[#111b21] outline-none placeholder:text-[#667781]"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="נקה">
              <X className="h-4 w-4 text-[#54656f]" />
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
                  ? "bg-[#e7fce3] font-medium text-[#008069]"
                  : "bg-[#f0f2f5] text-[#54656f] hover:bg-[#e9edef]",
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
            className="flex w-full items-center gap-4 px-4 py-3 text-right transition hover:bg-[#f5f6f6]"
          >
            <div className="flex h-12 w-12 items-center justify-center text-[#00a884]">
              <Archive className="h-5 w-5" />
            </div>
            <div className="flex flex-1 items-center justify-between border-b border-[#e9edef] pb-3">
              <span className="font-medium text-[#111b21]">ארכיון</span>
              {archiveUnread > 0 && (
                <span className="text-sm font-medium text-[#25d366]">{archiveUnread}</span>
              )}
              {archiveUnread === 0 && archivedConvs.length > 0 && (
                <span className="text-sm text-[#667781]">{archivedConvs.length}</span>
              )}
            </div>
          </button>
        )}

        {showArchive && (
          <button
            type="button"
            onClick={() => setShowArchive(false)}
            className="flex w-full items-center gap-2 border-b border-[#e9edef] px-4 py-3 text-sm text-[#00a884]"
          >
            ← חזרה לצ&apos;אטים
          </button>
        )}

        {loading ? (
          <div className="p-4 text-center text-sm text-[#667781]">טוען צ&apos;אטים...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#667781]">
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
                    "flex w-full items-center gap-3 px-3 py-3 text-right transition hover:bg-[#f5f6f6]",
                    isActive && "bg-[#f0f2f5]",
                  )}
                >
                  <Avatar
                    name={name}
                    url={convAvatarUrl(conv, currentUser.id)}
                    isGroup={conv.is_group}
                    isSelf={isSelf}
                    size={49}
                  />
                  <div className="flex min-w-0 flex-1 flex-col border-b border-[#e9edef] pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[#111b21]">{name}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        {isPinned && <Pin className="h-3 w-3 text-[#667781]" />}
                        {last && (
                          <span
                            className={cn(
                              "text-xs",
                              conv.unread_count ? "text-[#25d366]" : "text-[#667781]",
                            )}
                          >
                            {formatChatListTime(last.created_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1 truncate text-sm text-[#667781]">
                        {isMine && last && !last.deleted_at && <MessageTicks status="delivered" />}
                        <span className="truncate">
                          {last?.deleted_at ? "ההודעה נמחקה" : messagePreview(last)}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {isFav && <Star className="h-3.5 w-3.5 fill-[#25d366] text-[#25d366]" />}
                        {!!conv.unread_count && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-xs font-medium text-white">
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
                    <div className="absolute left-3 top-12 z-40 w-44 overflow-hidden rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5">
                      {!isSelf && (
                        <button
                          type="button"
                          className="block w-full px-4 py-2 text-right text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"
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
                        className="block w-full px-4 py-2 text-right text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"
                        onClick={() => {
                          onToggleFavorite(conv.id)
                          setMenuId(null)
                        }}
                      >
                        {isFav ? "הסר ממועדפים" : "הוסף למועדפים"}
                      </button>
                      <button
                        type="button"
                        className="block w-full px-4 py-2 text-right text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"
                        onClick={() => {
                          onToggleArchive(conv.id)
                          setMenuId(null)
                        }}
                      >
                        {archivedSet.has(conv.id) ? "הוצא מארכיון" : "העבר לארכיון"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-[#e9edef] bg-[#f0f2f5] px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
          <Laptop className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[#111b21]">הורד את WHACHAT ל-Windows</div>
          <div className="text-xs text-[#667781]">קבל התראות וגיבוי אוטומטי</div>
        </div>
        <span className="shrink-0 rounded-full bg-[#00a884] px-3 py-1.5 text-xs font-medium text-white">
          התחל
        </span>
      </div>
    </div>
  )
}
