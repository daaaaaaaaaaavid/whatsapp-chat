"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Conversation, Message, Profile } from "@/lib/types"
import { useMessages } from "@/lib/use-messages"
import { createClient } from "@/lib/supabase/client"
import { Avatar } from "./avatar"
import { MessageBubble } from "./message-bubble"
import { MessageInput } from "./message-input"
import { MediaGallery, mediaItemsFromMessages } from "./media-gallery"
import { convAvatarUrl, convDisplayName } from "@/lib/conversation-display"
import { formatDateDivider, formatChatListTime } from "@/lib/format"
import { ArrowRight, Search, MoreVertical, Lock, X, Phone, Video } from "lucide-react"

type Props = {
  conversation: Conversation
  currentUser: Profile
  onBack: () => void
  onOpenInfo: () => void
  onStartCall: (video: boolean) => void
  onToggleArchive: () => void
  onToggleFavorite: () => void
  isArchived: boolean
  isFavorite: boolean
}

function isOnline(lastSeen: string | null | undefined) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000
}

export function ConversationView({
  conversation,
  currentUser,
  onBack,
  onOpenInfo,
  onStartCall,
  onToggleArchive,
  onToggleFavorite,
  isArchived,
  isFavorite,
}: Props) {
  const { messages, loading, reload, setMessages } = useMessages(conversation.id, currentUser.id)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadAnchorId, setUnreadAnchorId] = useState<string | null>(null)
  const [unreadCountAtOpen, setUnreadCountAtOpen] = useState(0)
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const markedRef = useRef<string | null>(null)

  const otherParticipants = (conversation.participants ?? []).filter((p) => p.user_id !== currentUser.id)
  const totalOthers = otherParticipants.length

  const name = convDisplayName(conversation, currentUser.id)
  const avatar = convAvatarUrl(conversation, currentUser.id)

  const other = otherParticipants[0]?.profile
  const online = !conversation.is_group && isOnline(other?.last_seen)
  const subtitle = conversation.is_group
    ? (conversation.participants ?? [])
        .map((p) => (p.user_id === currentUser.id ? "אתה" : p.profile?.display_name ?? "משתמש"))
        .join(", ")
    : online
      ? "מחובר/ת"
      : other?.last_seen
        ? `נראה לאחרונה ${formatChatListTime(other.last_seen)}`
        : (other?.about ?? "זמין")

  useEffect(() => {
    if (loading) return
    const el = scrollRef.current
    if (!el) return
    // Jump to latest message whenever the conversation finishes loading or gains messages
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
    })
  }, [conversation.id, loading, messages.length])

  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery("")
    setMenuOpen(false)
    markedRef.current = null
    setUnreadAnchorId(null)
    setUnreadCountAtOpen(0)
    setGalleryIndex(null)
    setReplyTo(null)
  }, [conversation.id])

  useEffect(() => {
    if (markedRef.current === conversation.id || loading || messages.length === 0) return
    const unread = messages.filter(
      (m) => m.sender_id !== currentUser.id && !(m.reads ?? []).some((r) => r.user_id === currentUser.id),
    )
    if (unread.length > 0) {
      setUnreadAnchorId(unread[0].id)
      setUnreadCountAtOpen(unread.length)
    }
    markedRef.current = conversation.id

    if (unread.length === 0) return
    const supabase = createClient()
    supabase
      .from("message_reads")
      .upsert(
        unread.map((m) => ({ message_id: m.id, user_id: currentUser.id })),
        { onConflict: "message_id,user_id" },
      )
      .then(() => {})
  }, [messages, currentUser.id, conversation.id, loading])

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return messages
    return messages.filter(
      (m) =>
        !m.deleted_at &&
        ((m.content ?? "").toLowerCase().includes(q) || (m.file_name ?? "").toLowerCase().includes(q)),
    )
  }, [messages, searchQuery])

  const grouped = useMemo(() => {
    let lastDate = ""
    let lastSender = ""
    return filteredMessages.map((m) => {
      const dateKey = new Date(m.created_at).toDateString()
      const showDivider = dateKey !== lastDate
      lastDate = dateKey
      const showSenderName =
        m.type !== "system" && (m.sender_id !== lastSender || showDivider)
      if (m.type !== "system") lastSender = m.sender_id
      return { message: m, showDivider, showSenderName }
    })
  }, [filteredMessages])

  const mediaItems = useMemo(() => mediaItemsFromMessages(messages), [messages])

  const openMedia = (messageId: string) => {
    const idx = mediaItems.findIndex((item) => item.id === messageId)
    if (idx >= 0) {
      setGalleryIndex(idx)
      return
    }
    // Fallback: rebuild from current messages in case list was stale
    const rebuilt = mediaItemsFromMessages(messages)
    const fallback = rebuilt.findIndex((item) => item.id === messageId)
    if (fallback >= 0) setGalleryIndex(fallback)
  }

  const handleDelete = async (messageId: string) => {
    const supabase = createClient()
    const deletedAt = new Date().toISOString()
    const { error } = await supabase
      .from("messages")
      .update({ deleted_at: deletedAt, content: null, file_url: null })
      .eq("id", messageId)
      .eq("sender_id", currentUser.id)
    if (error) {
      // Column may not exist yet — fall back to clearing content only
      await supabase
        .from("messages")
        .update({ content: "‎" })
        .eq("id", messageId)
        .eq("sender_id", currentUser.id)
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, deleted_at: deletedAt, content: null, file_url: null, type: "text" as const }
          : m,
      ),
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 items-center gap-3 bg-[#f0f2f5] px-4">
        <button onClick={onBack} className="text-[#54656f] md:hidden" aria-label="חזרה">
          <ArrowRight className="h-6 w-6" />
        </button>
        <button onClick={onOpenInfo} className="flex min-w-0 flex-1 items-center gap-3 text-right">
          <Avatar name={name} url={avatar} isGroup={conversation.is_group} size={40} />
          <div className="min-w-0">
            <div className="truncate font-medium text-[#111b21]">{name}</div>
            <div className={`truncate text-xs ${online ? "text-[#00a884]" : "text-[#667781]"}`}>
              {subtitle}
            </div>
          </div>
        </button>
        <div className="relative flex items-center gap-0.5 text-[#54656f]">
          <button
            onClick={() => onStartCall(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
            aria-label="שיחת וידאו"
          >
            <Video className="h-5 w-5" />
          </button>
          <button
            onClick={() => onStartCall(false)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
            aria-label="שיחה קולית"
          >
            <Phone className="h-5 w-5" />
          </button>
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
            aria-label="חיפוש"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
            aria-label="תפריט"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-20"
                aria-label="סגור"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute left-0 top-11 z-30 w-52 overflow-hidden rounded-md bg-white py-2 shadow-lg ring-1 ring-black/5">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenInfo()
                  }}
                  className="block w-full px-5 py-2.5 text-right text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"
                >
                  פרטי איש קשר
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onToggleFavorite()
                  }}
                  className="block w-full px-5 py-2.5 text-right text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"
                >
                  {isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onToggleArchive()
                  }}
                  className="block w-full px-5 py-2.5 text-right text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"
                >
                  {isArchived ? "הוצא מארכיון" : "העבר לארכיון"}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-[#e9edef] bg-white px-4 py-2">
          <Search className="h-4 w-4 shrink-0 text-[#54656f]" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש בהודעות"
            className="flex-1 bg-transparent py-1.5 text-sm text-[#111b21] outline-none placeholder:text-[#667781]"
          />
          <button
            onClick={() => {
              setSearchQuery("")
              setSearchOpen(false)
            }}
            aria-label="סגור חיפוש"
            className="text-[#54656f]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div ref={scrollRef} className="wa-chat-bg wa-scroll flex-1 overflow-y-auto px-[5%] py-4">
        <div className="mx-auto flex max-w-3xl flex-col">
          <div className="mx-auto mb-4 flex items-center gap-1.5 rounded-lg bg-[#fdf4c5] px-3 py-1.5 text-center text-xs text-[#54656f] shadow-sm">
            <Lock className="h-3 w-3" />
            ההודעות מוצפנות מקצה לקצה
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-[#667781]">טוען הודעות...</div>
          ) : filteredMessages.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#667781]">
              {searchQuery
                ? "לא נמצאו הודעות התואמות לחיפוש"
                : "אין הודעות עדיין. שלח את ההודעה הראשונה!"}
            </div>
          ) : (
            grouped.map(({ message, showDivider, showSenderName }) => (
              <div key={message.id} data-message-id={message.id}>
                {showDivider && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-lg bg-white/90 px-3 py-1 text-xs text-[#54656f] shadow-sm">
                      {formatDateDivider(message.created_at)}
                    </span>
                  </div>
                )}
                {unreadAnchorId === message.id && unreadCountAtOpen > 0 && (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[#e9edef]" />
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#00a884] shadow-sm">
                      {unreadCountAtOpen} הודעות שלא נקראו
                    </span>
                    <div className="h-px flex-1 bg-[#e9edef]" />
                  </div>
                )}
                <MessageBubble
                  message={message}
                  isMine={message.sender_id === currentUser.id}
                  isGroup={conversation.is_group}
                  showSenderName={showSenderName}
                  participants={conversation.participants ?? []}
                  totalOthers={totalOthers}
                  onDelete={
                    message.type !== "system" && message.sender_id === currentUser.id
                      ? () => handleDelete(message.id)
                      : undefined
                  }
                  onReply={() => setReplyTo(message)}
                  onOpenMedia={openMedia}
                  currentUserAvatarUrl={currentUser.avatar_url}
                  currentUserName={currentUser.display_name}
                />
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {!searchOpen && (
        <MessageInput
          conversationId={conversation.id}
          currentUserId={currentUser.id}
          onSent={reload}
          replyTo={replyTo}
          replyAuthor={
            replyTo
              ? replyTo.sender_id === currentUser.id
                ? "אתה"
                : (conversation.participants ?? []).find((p) => p.user_id === replyTo.sender_id)?.profile
                    ?.display_name ?? "משתמש"
              : null
          }
          onCancelReply={() => setReplyTo(null)}
        />
      )}

      {galleryIndex != null && mediaItems[galleryIndex] && (
        <MediaGallery
          items={mediaItems}
          index={galleryIndex}
          onIndexChange={setGalleryIndex}
          onClose={() => setGalleryIndex(null)}
          currentUser={currentUser}
          participants={conversation.participants ?? []}
          onGoToMessage={(messageId) => {
            setGalleryIndex(null)
            requestAnimationFrame(() => {
              const node = document.querySelector(`[data-message-id="${messageId}"]`)
              node?.scrollIntoView({ behavior: "smooth", block: "center" })
            })
          }}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
