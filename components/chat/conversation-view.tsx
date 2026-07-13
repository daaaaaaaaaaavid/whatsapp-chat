"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { Conversation, Message, Profile } from "@/lib/types"
import { useMessages } from "@/lib/use-messages"
import { createClient } from "@/lib/supabase/client"
import {
  hideMessageForMe,
  setMessageReaction,
  toggleMuted,
  togglePinnedMessage,
  toggleStarredMessage,
  type ChatPrefs,
} from "@/lib/chat-prefs"
import { broadcastTyping, subscribeTyping } from "@/lib/typing"
import { messagePreview } from "@/lib/conversation-display"
import { Avatar } from "./avatar"
import { MessageBubble } from "./message-bubble"
import { MessageInput } from "./message-input"
import { MediaGallery, mediaItemsFromMessages } from "./media-gallery"
import { ForwardDialog } from "./forward-dialog"
import { convAvatarUrl, convDisplayName, isSelfConversation } from "@/lib/conversation-display"
import { formatDateDivider, formatChatListTime } from "@/lib/format"
import { parseCallSystemPayload } from "@/lib/call-system-message"
import { ChevronDown, ChevronUp, ArrowRight, Search, MoreVertical, Lock, X, Phone, Video } from "lucide-react"

type Props = {
  conversation: Conversation
  currentUser: Profile
  conversations: Conversation[]
  prefs: ChatPrefs
  onPrefsChange: (next: ChatPrefs) => void
  onBack: () => void
  onOpenInfo: () => void
  onStartCall: (video: boolean) => void
  onToggleArchive: () => void
  onToggleFavorite: () => void
  onTogglePinned: () => void
  isArchived: boolean
  isFavorite: boolean
  isPinned: boolean
  initialGalleryMessageId?: string | null
  onGalleryOpened?: () => void
}

function isOnline(lastSeen: string | null | undefined) {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000
}

export function ConversationView({
  conversation,
  currentUser,
  conversations,
  prefs,
  onPrefsChange,
  onBack,
  onOpenInfo,
  onStartCall,
  onToggleArchive,
  onToggleFavorite,
  onTogglePinned,
  isArchived,
  isFavorite,
  isPinned,
  initialGalleryMessageId,
  onGalleryOpened,
}: Props) {
  const { messages, loading, reload, setMessages } = useMessages(conversation.id, currentUser.id)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingChannelRef = useRef<RealtimeChannel | null>(null)
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchHit, setSearchHit] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadAnchorId, setUnreadAnchorId] = useState<string | null>(null)
  const [unreadCountAtOpen, setUnreadCountAtOpen] = useState(0)
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null)
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({})
  const markedRef = useRef<string | null>(null)

  const isSelf = isSelfConversation(conversation, currentUser.id)
  const otherParticipants = (conversation.participants ?? []).filter((p) => p.user_id !== currentUser.id)
  const totalOthers = otherParticipants.length

  const name = convDisplayName(conversation, currentUser.id)
  const avatar = convAvatarUrl(conversation, currentUser.id)

  const other = otherParticipants[0]?.profile
  const online = !conversation.is_group && !isSelf && isOnline(other?.last_seen)

  const typingNames = useMemo(() => {
    const now = Date.now()
    return otherParticipants
      .filter((p) => (typingUsers[p.user_id] ?? 0) > now)
      .map((p) => (p.user_id === currentUser.id ? "אתה" : p.profile?.display_name ?? "משתמש"))
  }, [typingUsers, otherParticipants, currentUser.id])

  const subtitle = isSelf
    ? "הודעות שמורות"
    : typingNames.length
      ? typingNames.length === 1
        ? `${typingNames[0]} מקליד/ה...`
        : "מקלידים..."
      : conversation.is_group
        ? (conversation.participants ?? [])
            .map((p) => (p.user_id === currentUser.id ? "אתה" : p.profile?.display_name ?? "משתמש"))
            .join(", ")
        : online
          ? "מחובר/ת"
          : other?.last_seen
            ? `נראה לאחרונה ${formatChatListTime(other.last_seen)}`
            : (other?.about ?? "זמין")

  const visibleMessages = useMemo(
    () => messages.filter((m) => !prefs.hiddenMessages.includes(m.id)),
    [messages, prefs.hiddenMessages],
  )

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return [] as string[]
    return visibleMessages
      .filter(
        (m) =>
          !m.deleted_at &&
          !parseCallSystemPayload(m.content) &&
          ((m.content ?? "").toLowerCase().includes(q) || (m.file_name ?? "").toLowerCase().includes(q)),
      )
      .map((m) => m.id)
  }, [visibleMessages, searchQuery])

  useEffect(() => {
    setSearchHit(0)
  }, [searchQuery, conversation.id])

  useEffect(() => {
    if (!searchOpen || !searchMatches.length) return
    const id = searchMatches[Math.min(searchHit, searchMatches.length - 1)]
    const node = document.querySelector(`[data-message-id="${id}"]`)
    node?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [searchHit, searchMatches, searchOpen])

  useEffect(() => {
    if (loading || searchOpen) return
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
    })
  }, [conversation.id, loading, messages.length, searchOpen])

  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery("")
    setMenuOpen(false)
    markedRef.current = null
    setUnreadAnchorId(null)
    setUnreadCountAtOpen(0)
    setGalleryIndex(null)
    setReplyTo(null)
    setForwardMessage(null)
    setTypingUsers({})
  }, [conversation.id])

  useEffect(() => {
    const channel = subscribeTyping(conversation.id, currentUser.id, {
      onTyping: (userId, typing) => {
        setTypingUsers((prev) => {
          const next = { ...prev }
          if (typing) next[userId] = Date.now() + 3000
          else delete next[userId]
          return next
        })
      },
    })
    typingChannelRef.current = channel
    return () => {
      void broadcastTyping(channel, currentUser.id, false)
      const supabase = createClient()
      supabase.removeChannel(channel)
      typingChannelRef.current = null
    }
  }, [conversation.id, currentUser.id])

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      setTypingUsers((prev) => {
        let changed = false
        const next = { ...prev }
        for (const [uid, exp] of Object.entries(next)) {
          if (exp <= now) {
            delete next[uid]
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

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

  const mediaItems = useMemo(() => mediaItemsFromMessages(visibleMessages), [visibleMessages])

  useEffect(() => {
    if (!initialGalleryMessageId || loading) return
    const idx = mediaItems.findIndex((item) => item.id === initialGalleryMessageId)
    if (idx >= 0) {
      setGalleryIndex(idx)
      onGalleryOpened?.()
    }
  }, [initialGalleryMessageId, mediaItems, loading, onGalleryOpened])

  const pinnedInChat = useMemo(
    () => visibleMessages.filter((m) => prefs.pinnedMessages.includes(m.id) && !m.deleted_at),
    [visibleMessages, prefs.pinnedMessages],
  )

  const grouped = useMemo(() => {
    let lastDate = ""
    let lastSender = ""
    return visibleMessages.map((m) => {
      const dateKey = new Date(m.created_at).toDateString()
      const showDivider = dateKey !== lastDate
      lastDate = dateKey
      const isSystem = m.type === "system" || Boolean(parseCallSystemPayload(m.content))
      const showSenderName = !isSystem && (m.sender_id !== lastSender || showDivider)
      if (!isSystem) lastSender = m.sender_id
      return { message: m, showDivider, showSenderName }
    })
  }, [visibleMessages])

  const openMedia = (messageId: string) => {
    const idx = mediaItems.findIndex((item) => item.id === messageId)
    if (idx >= 0) setGalleryIndex(idx)
  }

  const handleDeleteForEveryone = async (messageId: string) => {
    const supabase = createClient()
    const deletedAt = new Date().toISOString()
    const { error } = await supabase
      .from("messages")
      .update({ deleted_at: deletedAt, content: null, file_url: null })
      .eq("id", messageId)
      .eq("sender_id", currentUser.id)
    if (error) {
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

  const handleTyping = (typing: boolean) => {
    void broadcastTyping(typingChannelRef.current, currentUser.id, typing)
    if (typingClearRef.current) clearTimeout(typingClearRef.current)
    if (typing) {
      typingClearRef.current = setTimeout(() => {
        void broadcastTyping(typingChannelRef.current, currentUser.id, false)
      }, 2500)
    }
  }

  const handleForward = async (conversationIds: string[]) => {
    if (!forwardMessage) return
    const supabase = createClient()
    const src = forwardMessage
    for (const cid of conversationIds) {
      await supabase.from("messages").insert({
        conversation_id: cid,
        sender_id: currentUser.id,
        type: src.type === "system" ? "text" : src.type,
        content: src.type === "text" || src.type === "system" ? (src.content ?? messagePreview(src)) : src.content,
        file_url: src.file_url,
        file_name: src.file_name,
        file_size: src.file_size,
      })
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid)
    }
    if (conversationIds.includes(conversation.id)) await reload()
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 items-center gap-3 bg-[#f0f2f5] px-4">
        <button onClick={onBack} className="text-[#54656f] md:hidden" aria-label="חזרה">
          <ArrowRight className="h-6 w-6" />
        </button>
        <button onClick={onOpenInfo} className="flex min-w-0 flex-1 items-center gap-3 text-right">
          <Avatar name={name} url={avatar} isGroup={conversation.is_group} isSelf={isSelf} size={40} />
          <div className="min-w-0">
            <div className="truncate font-medium text-[#111b21]">{name}</div>
            <div
              className={`truncate text-xs ${
                typingNames.length || online ? "text-[#00a884]" : "text-[#667781]"
              }`}
            >
              {subtitle}
            </div>
          </div>
        </button>
        <div className="relative flex items-center gap-0.5 text-[#54656f]">
          {!isSelf && (
            <>
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
            </>
          )}
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
              <button type="button" className="fixed inset-0 z-20" aria-label="סגור" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 top-11 z-30 w-52 overflow-hidden rounded-md bg-white py-2 shadow-lg ring-1 ring-black/5">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenInfo()
                  }}
                  className="block w-full px-5 py-2.5 text-right text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"
                >
                  {isSelf ? "פרטי השיחה" : conversation.is_group ? "פרטי קבוצה" : "פרטי איש קשר"}
                </button>
                {!isSelf && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      onTogglePinned()
                    }}
                    className="block w-full px-5 py-2.5 text-right text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"
                  >
                    {isPinned ? "בטל נעיצה" : "נעץ צ'אט"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onPrefsChange(toggleMuted(prefs, conversation.id))
                  }}
                  className="block w-full px-5 py-2.5 text-right text-sm text-[#3b4a54] hover:bg-[#f5f6f6]"
                >
                  {prefs.muted.includes(conversation.id) ? "ביטול השתקה" : "השתקת התראות"}
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
          {searchQuery.trim() && (
            <span className="shrink-0 text-xs text-[#667781]" dir="ltr">
              {searchMatches.length ? `${Math.min(searchHit + 1, searchMatches.length)}/${searchMatches.length}` : "0"}
            </span>
          )}
          <button
            type="button"
            disabled={!searchMatches.length}
            onClick={() => setSearchHit((h) => (h - 1 + searchMatches.length) % searchMatches.length)}
            className="text-[#54656f] disabled:opacity-30"
            aria-label="הקודם"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            disabled={!searchMatches.length}
            onClick={() => setSearchHit((h) => (h + 1) % searchMatches.length)}
            className="text-[#54656f] disabled:opacity-30"
            aria-label="הבא"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
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

      {pinnedInChat.length > 0 && !searchOpen && (
        <button
          type="button"
          onClick={() => {
            const id = pinnedInChat[pinnedInChat.length - 1]?.id
            if (!id) return
            document.querySelector(`[data-message-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })
          }}
          className="flex items-center gap-2 border-b border-[#e9edef] bg-[#f0f2f5] px-4 py-2 text-right text-sm text-[#54656f]"
        >
          <span className="truncate">
            מוצמד: {messagePreview(pinnedInChat[pinnedInChat.length - 1])}
          </span>
        </button>
      )}

      <div ref={scrollRef} className="wa-chat-bg wa-scroll flex-1 overflow-y-auto px-[5%] py-4">
        <div className="mx-auto flex max-w-3xl flex-col">
          <div className="mx-auto mb-4 flex items-center gap-1.5 rounded-lg bg-[#fdf4c5] px-3 py-1.5 text-center text-xs text-[#54656f] shadow-sm">
            <Lock className="h-3 w-3" />
            ההודעות מוצפנות מקצה לקצה
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-[#667781]">טוען הודעות...</div>
          ) : visibleMessages.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#667781]">אין הודעות עדיין. שלח את ההודעה הראשונה!</div>
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
                  onDeleteForEveryone={
                    message.sender_id === currentUser.id && message.type !== "system"
                      ? () => handleDeleteForEveryone(message.id)
                      : undefined
                  }
                  onDeleteForMe={() => onPrefsChange(hideMessageForMe(prefs, message.id))}
                  onReply={() => setReplyTo(message)}
                  onForward={() => setForwardMessage(message)}
                  onToggleStar={() => onPrefsChange(toggleStarredMessage(prefs, message.id))}
                  onTogglePin={() => onPrefsChange(togglePinnedMessage(prefs, message.id))}
                  onReaction={(emoji) => onPrefsChange(setMessageReaction(prefs, message.id, emoji))}
                  onOpenMedia={openMedia}
                  currentUserAvatarUrl={currentUser.avatar_url}
                  currentUserName={currentUser.display_name}
                  reaction={prefs.reactions[message.id] ?? null}
                  isStarred={prefs.starredMessages.includes(message.id)}
                  isPinned={prefs.pinnedMessages.includes(message.id)}
                  searchQuery={searchOpen ? searchQuery : ""}
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
          onTyping={handleTyping}
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
              document
                .querySelector(`[data-message-id="${messageId}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            })
          }}
          onDelete={handleDeleteForEveryone}
        />
      )}

      <ForwardDialog
        open={Boolean(forwardMessage)}
        message={forwardMessage}
        conversations={conversations}
        currentUser={currentUser}
        onClose={() => setForwardMessage(null)}
        onForward={handleForward}
      />
    </div>
  )
}
