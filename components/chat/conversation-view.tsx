"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import {
  buildMessageMap,
  filterMainStreamMessages,
  getThreadRootId,
  threadReplyPreview,
} from "@/lib/message-thread"
import { Avatar } from "./avatar"
import { MessageBubble } from "./message-bubble"
import { MessageInput, type MessageInputHandle } from "./message-input"
import { ChatThreadHeader } from "./chat-thread-header"
import { ThreadPanel } from "./thread-panel"
import { MediaGallery, mediaItemsFromMessages } from "./media-gallery"
import { ForwardDialog } from "./forward-dialog"
import { convAvatarUrl, convDisplayName, isSelfConversation } from "@/lib/conversation-display"
import { formatDateDivider, formatChatListTime } from "@/lib/format"
import { parseCallSystemPayload } from "@/lib/call-system-message"
import { parsePollPayload } from "@/lib/poll"
import {
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Search,
  MoreVertical,
  X,
  Phone,
  Video,
  ImagePlus,
  Trash2,
  Forward,
  Reply,
} from "lucide-react"

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
  onMoveToSpace?: (space: "personal" | "work") => void
  onMessageActivity?: (message: Message) => void
  onConversationOpened?: (conversationId: string) => void
  isArchived: boolean
  isFavorite: boolean
  isPinned: boolean
  initialGalleryMessageId?: string | null
  onGalleryOpened?: () => void
  onStartChatByEmail?: (email: string) => Promise<void>
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
  onMoveToSpace,
  onMessageActivity,
  onConversationOpened,
  isArchived,
  isFavorite,
  isPinned,
  initialGalleryMessageId,
  onGalleryOpened,
  onStartChatByEmail,
}: Props) {
  const {
    messages,
    loading,
    loadingOlder,
    hasMore,
    loadOlder,
    setMessages,
    addOptimistic,
    confirmOptimistic,
    failOptimistic,
  } = useMessages(conversation.id, currentUser.id)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messageInputRef = useRef<MessageInputHandle>(null)
  const dragDepthRef = useRef(0)
  const typingChannelRef = useRef<RealtimeChannel | null>(null)
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchHit, setSearchHit] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadAnchorId, setUnreadAnchorId] = useState<string | null>(null)
  const [unreadCountAtOpen, setUnreadCountAtOpen] = useState(0)
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [forwardMessages, setForwardMessages] = useState<Message[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({})
  const [threadRootId, setThreadRootId] = useState<string | null>(null)
  const markedRef = useRef<string | null>(null)

  const isSelf = isSelfConversation(conversation, currentUser.id)
  const threadsEnabled = conversation.is_group
  const otherParticipants = (conversation.participants ?? []).filter((p) => p.user_id !== currentUser.id)
  const totalOthers = otherParticipants.length

  const name = convDisplayName(conversation, currentUser.id)
  const avatar = convAvatarUrl(conversation, currentUser.id)

  const other = otherParticipants[0]?.profile
  const online = !conversation.is_group && !isSelf && isOnline(other?.last_seen)

  const typingNames = otherParticipants
    .filter((p) => typingUsers[p.user_id] != null)
    .map((p) => (p.user_id === currentUser.id ? "אתה" : p.profile?.display_name ?? "משתמש"))

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

  const messageById = useMemo(() => buildMessageMap(messages), [messages])

  const visibleMessages = useMemo(() => {
    const unhidden = messages.filter((m) => !prefs.hiddenMessages.includes(m.id))
    return filterMainStreamMessages(unhidden, threadsEnabled)
  }, [messages, prefs.hiddenMessages, threadsEnabled])

  const threadRoot = useMemo(() => {
    if (!threadRootId) return null
    return messageById.get(threadRootId) ?? null
  }, [threadRootId, messageById])

  const openThread = useCallback(
    (message: Message) => {
      if (!threadsEnabled) return
      const rootId = getThreadRootId(message, messageById)
      setThreadRootId(rootId)
      setReplyTo(null)
      setEditingMessage(null)
      setSelectionMode(false)
      setSelectedIds([])
    },
    [threadsEnabled, messageById],
  )

  const closeThread = useCallback(() => setThreadRootId(null), [])

  const threadReplyStats = useMemo(() => {
    if (!threadsEnabled) return new Map<string, { count: number; preview: string | null }>()
    const map = new Map<string, { count: number; preview: string | null }>()
    for (const m of messages) {
      if (!m.reply_to_id || prefs.hiddenMessages.includes(m.id)) continue
      const rootId = getThreadRootId(m, messageById)
      if (rootId === m.id) continue
      const prev = map.get(rootId) ?? { count: 0, preview: null }
      const nextPreview = m.deleted_at ? prev.preview : threadReplyPreview(m)
      map.set(rootId, {
        count: prev.count + 1,
        preview: nextPreview ?? prev.preview,
      })
    }
    return map
  }, [threadsEnabled, messages, messageById, prefs.hiddenMessages])

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return [] as string[]
    const pool = threadsEnabled
      ? messages.filter((m) => !prefs.hiddenMessages.includes(m.id))
      : visibleMessages
    return pool
      .filter(
        (m) =>
          !m.deleted_at &&
          !parseCallSystemPayload(m.content) &&
          ((m.content ?? "").toLowerCase().includes(q) || (m.file_name ?? "").toLowerCase().includes(q)),
      )
      .map((m) => m.id)
  }, [visibleMessages, messages, searchQuery, threadsEnabled, prefs.hiddenMessages])

  useEffect(() => {
    setSearchHit(0)
  }, [searchQuery, conversation.id])

  useEffect(() => {
    if (!searchOpen || !searchMatches.length) return
    const id = searchMatches[Math.min(searchHit, searchMatches.length - 1)]
    const msg = messageById.get(id)
    if (threadsEnabled && msg?.reply_to_id) {
      openThread(msg)
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-thread-message-id="${id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      })
      return
    }
    const node = document.querySelector(`[data-message-id="${id}"]`)
    node?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [searchHit, searchMatches, searchOpen, threadsEnabled, messageById, openThread])

  const stickToBottomRef = useRef(true)
  const prevConvIdRef = useRef(conversation.id)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottomRef.current = distanceFromBottom < 120
      if (el.scrollTop < 80 && hasMore && !loadingOlder) {
        const prevHeight = el.scrollHeight
        void loadOlder().then(() => {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight + el.scrollTop
            }
          })
        })
      }
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [conversation.id, hasMore, loadingOlder, loadOlder])

  useEffect(() => {
    if (loading || searchOpen) return
    const el = scrollRef.current
    if (!el) return
    const switched = prevConvIdRef.current !== conversation.id
    prevConvIdRef.current = conversation.id
    if (switched) stickToBottomRef.current = true
    if (!switched && !stickToBottomRef.current) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
    })
  }, [conversation.id, loading, messages.length, searchOpen])

  useEffect(() => {
    if (!selectionMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectionMode(false)
        setSelectedIds([])
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectionMode])

  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery("")
    setMenuOpen(false)
    markedRef.current = null
    setUnreadAnchorId(null)
    setUnreadCountAtOpen(0)
    setGalleryIndex(null)
    setReplyTo(null)
    setEditingMessage(null)
    setForwardMessages([])
    setSelectionMode(false)
    setSelectedIds([])
    setTypingUsers({})
    setThreadRootId(null)
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
    onConversationOpened?.(conversation.id)

    if (unread.length === 0) return
    const supabase = createClient()
    void supabase
      .from("message_reads")
      .upsert(
        unread.map((m) => ({ message_id: m.id, user_id: currentUser.id })),
        { onConflict: "message_id,user_id" },
      )
      .then(({ error }) => {
        if (error) console.error("mark read failed", error.message)
      })
  }, [messages, currentUser.id, conversation.id, loading, onConversationOpened])

  const mediaItems = useMemo(
    () =>
      mediaItemsFromMessages(
        messages.filter((m) => !prefs.hiddenMessages.includes(m.id)),
      ),
    [messages, prefs.hiddenMessages],
  )

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
      console.error("delete for everyone failed", error.message)
      return
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, deleted_at: deletedAt, content: null, file_url: null, type: "text" as const }
          : m,
      ),
    )
  }

  const handleTyping = useCallback((typing: boolean) => {
    void broadcastTyping(typingChannelRef.current, currentUser.id, typing)
    if (typingClearRef.current) clearTimeout(typingClearRef.current)
    if (typing) {
      typingClearRef.current = setTimeout(() => {
        void broadcastTyping(typingChannelRef.current, currentUser.id, false)
      }, 2500)
    }
  }, [currentUser.id])

  const handleForward = async (conversationIds: string[]) => {
    if (!forwardMessages.length) return
    const supabase = createClient()
    for (const src of forwardMessages) {
      for (const cid of conversationIds) {
        const { data, error } = await supabase
          .from("messages")
          .insert({
            conversation_id: cid,
            sender_id: currentUser.id,
            type: src.type === "system" ? "text" : src.type,
            content: src.type === "text" || src.type === "system" ? (src.content ?? messagePreview(src)) : src.content,
            file_url: src.file_url,
            file_name: src.file_name,
            file_size: src.file_size,
            reply_to_id: null,
            is_forwarded: true,
          })
          .select("*")
          .single()
        if (error) {
          console.error("forward failed", error.message)
          continue
        }
        const { error: touchError } = await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", cid)
        if (touchError) console.error("forward touch failed", touchError.message)
        if (data) onMessageActivity?.(data as Message)
      }
    }
  }

  const selectedMessages = useMemo(
    () => visibleMessages.filter((m) => selectedIds.includes(m.id)),
    [visibleMessages, selectedIds],
  )

  const exitSelection = () => {
    setSelectionMode(false)
    setSelectedIds([])
  }

  const toggleSelect = (messageId: string) => {
    setSelectedIds((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId],
    )
  }

  const startSelect = (messageId: string) => {
    setEditingMessage(null)
    setReplyTo(null)
    setSelectionMode(true)
    setSelectedIds([messageId])
  }

  const handleBulkDeleteForMe = () => {
    let next = prefs
    for (const id of selectedIds) {
      next = hideMessageForMe(next, id)
    }
    onPrefsChange(next)
    exitSelection()
  }

  const handleBulkDeleteForEveryone = async () => {
    const mine = selectedMessages.filter(
      (m) => m.sender_id === currentUser.id && m.type !== "system" && !parseCallSystemPayload(m.content),
    )
    for (const m of mine) {
      await handleDeleteForEveryone(m.id)
    }
    const others = selectedIds.filter((id) => !mine.some((m) => m.id === id))
    if (others.length) {
      let next = prefs
      for (const id of others) {
        next = hideMessageForMe(next, id)
      }
      onPrefsChange(next)
    }
    exitSelection()
  }

  const handleBulkReply = () => {
    const target = selectedMessages[selectedMessages.length - 1]
    if (!target) return
    exitSelection()
    setEditingMessage(null)
    if (threadsEnabled) {
      openThread(target)
      return
    }
    setReplyTo(target)
  }

  const handleBulkForward = () => {
    const msgs = selectedMessages.filter((m) => !m.deleted_at)
    if (!msgs.length) return
    setForwardMessages(msgs)
    exitSelection()
  }

  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files") || searchOpen) return
    e.preventDefault()
    dragDepthRef.current += 1
    setDragOver(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragOver(false)
  }

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files") || searchOpen) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepthRef.current = 0
    setDragOver(false)
    if (searchOpen) return
    const files = e.dataTransfer.files
    if (files?.length) messageInputRef.current?.stageFiles(files)
  }

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden">
    <div
      className={`relative flex h-full min-w-0 flex-col ${threadRoot ? "hidden lg:flex lg:flex-1" : "flex flex-1"}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragOver && !searchOpen && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[#00a884]/15 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--wa-panel)] px-10 py-8 shadow-xl ring-1 ring-black/5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#00a884]/15 text-[#00a884]">
              <ImagePlus className="h-8 w-8" />
            </div>
            <div className="text-lg font-medium text-[var(--wa-text)]">גרור לכאן כדי לצרף</div>
            <div className="text-sm text-[var(--wa-text-secondary)]">תמונות, סרטונים ומסמכים</div>
          </div>
        </div>
      )}

      <header className="flex h-16 items-center gap-3 bg-[var(--wa-header)] px-4">
        {selectionMode ? (
          <>
            <button
              type="button"
              onClick={exitSelection}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-black/5"
              aria-label="ביטול בחירה"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1 text-right font-medium text-[var(--wa-text)]">
              {selectedIds.length} נבחרו
            </div>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={handleBulkReply}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-black/5 disabled:opacity-30"
              aria-label="תגובה"
              title="תגובה"
            >
              <Reply className="h-5 w-5" />
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={handleBulkForward}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-black/5 disabled:opacity-30"
              aria-label="העברה"
              title="העברה"
            >
              <Forward className="h-5 w-5" />
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => {
                const hasMine = selectedMessages.some(
                  (m) => m.sender_id === currentUser.id && m.type !== "system",
                )
                if (hasMine) {
                  if (window.confirm("למחוק לכולם את ההודעות שלך שנבחרו? (השאר יוסתרו אצלך בלבד)")) {
                    void handleBulkDeleteForEveryone()
                  } else {
                    handleBulkDeleteForMe()
                  }
                } else {
                  handleBulkDeleteForMe()
                }
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-black/5 disabled:opacity-30"
              aria-label="מחיקה"
              title="מחיקה"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </>
        ) : (
          <>
        <button onClick={onBack} className="text-[var(--wa-text-secondary)] md:hidden" aria-label="חזרה">
          <ArrowRight className="h-6 w-6" />
        </button>
        <button onClick={onOpenInfo} className="flex min-w-0 flex-1 items-center gap-3 text-right">
          <Avatar name={name} url={avatar} isGroup={conversation.is_group} isSelf={isSelf} size={40} />
          <div className="min-w-0">
            <div className="truncate font-medium text-[var(--wa-text)]">{name}</div>
            <div
              className={`truncate text-xs ${
                typingNames.length || online ? "text-[#00a884]" : "text-[var(--wa-text-secondary)]"
              }`}
            >
              {subtitle}
            </div>
          </div>
        </button>
        <div className="relative flex items-center gap-0.5 text-[var(--wa-text-secondary)]">
          {!isSelf && !conversation.is_group && (
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
              <div className="absolute left-0 top-11 z-30 w-52 overflow-hidden rounded-md bg-[var(--wa-panel)] py-2 shadow-lg ring-1 ring-black/5">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenInfo()
                  }}
                  className="block w-full px-5 py-2.5 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
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
                    className="block w-full px-5 py-2.5 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
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
                  className="block w-full px-5 py-2.5 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                >
                  {prefs.muted.includes(conversation.id) ? "ביטול השתקה" : "השתקת התראות"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onToggleFavorite()
                  }}
                  className="block w-full px-5 py-2.5 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                >
                  {isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onToggleArchive()
                  }}
                  className="block w-full px-5 py-2.5 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                >
                  {isArchived ? "הוצא מארכיון" : "העבר לארכיון"}
                </button>
                {onMoveToSpace && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      const next = prefs.workConversations.includes(conversation.id)
                        ? "personal"
                        : "work"
                      onMoveToSpace(next)
                    }}
                    className="block w-full px-5 py-2.5 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                  >
                    {prefs.workConversations.includes(conversation.id)
                      ? "העבר לאישי"
                      : "העבר לעבודה"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
          </>
        )}
      </header>

      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-[var(--wa-border)] bg-[var(--wa-panel)] px-4 py-2">
          <Search className="h-4 w-4 shrink-0 text-[var(--wa-text-secondary)]" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש בהודעות"
            className="flex-1 bg-transparent py-1.5 text-sm text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-secondary)]"
          />
          {searchQuery.trim() && (
            <span className="shrink-0 text-xs text-[var(--wa-text-secondary)]" dir="ltr">
              {searchMatches.length ? `${Math.min(searchHit + 1, searchMatches.length)}/${searchMatches.length}` : "0"}
            </span>
          )}
          <button
            type="button"
            disabled={!searchMatches.length}
            onClick={() => setSearchHit((h) => (h - 1 + searchMatches.length) % searchMatches.length)}
            className="text-[var(--wa-text-secondary)] disabled:opacity-30"
            aria-label="הקודם"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            disabled={!searchMatches.length}
            onClick={() => setSearchHit((h) => (h + 1) % searchMatches.length)}
            className="text-[var(--wa-text-secondary)] disabled:opacity-30"
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
            className="text-[var(--wa-text-secondary)]"
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
          className="flex items-center gap-2 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-4 py-2 text-right text-sm text-[var(--wa-text-secondary)]"
        >
          <span className="truncate">
            מוצמד: {messagePreview(pinnedInChat[pinnedInChat.length - 1])}
          </span>
        </button>
      )}

      <div ref={scrollRef} className="wa-chat-bg wa-scroll flex-1 overflow-y-auto px-[5%] py-4">
        <div className="mx-auto flex max-w-3xl flex-col">
          <ChatThreadHeader
            hasMore={hasMore}
            loadingOlder={loadingOlder}
            onLoadOlder={() => void loadOlder()}
          />

          {loading ? (
            <div className="py-8 text-center text-sm text-[var(--wa-text-secondary)]">טוען הודעות...</div>
          ) : visibleMessages.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--wa-text-secondary)]">אין הודעות עדיין. שלח את ההודעה הראשונה!</div>
          ) : (
            grouped.map(({ message, showDivider, showSenderName }) => (
              <div key={message.id} data-message-id={message.id}>
                {showDivider && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-lg bg-white/90 px-3 py-1 text-xs text-[var(--wa-text-secondary)] shadow-sm">
                      {formatDateDivider(message.created_at)}
                    </span>
                  </div>
                )}
                {unreadAnchorId === message.id && unreadCountAtOpen > 0 && (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-[#e9edef]" />
                    <span className="rounded-full bg-[var(--wa-panel)] px-3 py-1 text-xs font-medium text-[#00a884] shadow-sm">
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
                  onReply={
                    threadsEnabled
                      ? undefined
                      : () => {
                          setEditingMessage(null)
                          setReplyTo(message)
                        }
                  }
                  onReplyInThread={
                    threadsEnabled && message.type !== "system" && !message.deleted_at
                      ? () => openThread(message)
                      : undefined
                  }
                  onOpenThread={
                    threadsEnabled && (threadReplyStats.get(message.id)?.count ?? 0) > 0
                      ? () => openThread(message)
                      : undefined
                  }
                  threadReplyCount={threadReplyStats.get(message.id)?.count ?? 0}
                  threadPreview={threadReplyStats.get(message.id)?.preview ?? null}
                  onForward={() => setForwardMessages([message])}
                  onEdit={
                    message.sender_id === currentUser.id &&
                    message.type !== "system" &&
                    message.type !== "poll" &&
                    !parsePollPayload(message.content) &&
                    !message.deleted_at
                      ? () => {
                          setReplyTo(null)
                          setEditingMessage(message)
                        }
                      : undefined
                  }
                  onToggleStar={() => onPrefsChange(toggleStarredMessage(prefs, message.id))}
                  onTogglePin={() => onPrefsChange(togglePinnedMessage(prefs, message.id))}
                  onReaction={(emoji) => onPrefsChange(setMessageReaction(prefs, message.id, emoji))}
                  onOpenMedia={openMedia}
                  onStartSelect={() => startSelect(message.id)}
                  onToggleSelect={() => toggleSelect(message.id)}
                  selectionMode={selectionMode}
                  isSelected={selectedIds.includes(message.id)}
                  currentUserAvatarUrl={currentUser.avatar_url}
                  currentUserName={currentUser.display_name}
                  currentUserId={currentUser.id}
                  reaction={prefs.reactions[message.id] ?? null}
                  isStarred={prefs.starredMessages.includes(message.id)}
                  isPinned={prefs.pinnedMessages.includes(message.id)}
                  searchQuery={searchOpen ? searchQuery : ""}
                  onStartChatByEmail={onStartChatByEmail}
                />
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {!searchOpen && !selectionMode && (
        <MessageInput
          ref={messageInputRef}
          conversationId={conversation.id}
          currentUserId={currentUser.id}
          onOptimistic={(msg) => {
            addOptimistic(msg)
            onMessageActivity?.(msg)
          }}
          onSent={(msg, tempId) => {
            confirmOptimistic(tempId, msg)
            onMessageActivity?.(msg)
          }}
          onSendFailed={failOptimistic}
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
          editingMessage={editingMessage}
          onCancelEdit={() => setEditingMessage(null)}
          onEdited={(msg) => {
            setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)))
            onMessageActivity?.(msg)
          }}
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
        open={forwardMessages.length > 0}
        messages={forwardMessages}
        conversations={conversations}
        currentUser={currentUser}
        onClose={() => setForwardMessages([])}
        onForward={handleForward}
      />
    </div>

    {threadRoot && (
      <div
        className={`z-30 flex h-full shrink-0 ${
          threadRoot ? "absolute inset-0 lg:static lg:inset-auto" : ""
        }`}
      >
        <ThreadPanel
          root={threadRoot}
          messages={messages.filter((m) => !prefs.hiddenMessages.includes(m.id))}
          conversation={conversation}
          currentUser={currentUser}
          prefs={prefs}
          onPrefsChange={onPrefsChange}
          onClose={closeThread}
          onDeleteForEveryone={handleDeleteForEveryone}
          onOpenMedia={openMedia}
          onOptimistic={(msg) => {
            addOptimistic(msg)
            onMessageActivity?.(msg)
          }}
          onSent={(msg, tempId) => {
            confirmOptimistic(tempId, msg)
            onMessageActivity?.(msg)
          }}
          onSendFailed={failOptimistic}
          onEdited={(msg) => {
            setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)))
            onMessageActivity?.(msg)
          }}
          onTyping={handleTyping}
          onForward={(message) => setForwardMessages([message])}
          onStartChatByEmail={onStartChatByEmail}
        />
      </div>
    )}
    </div>
  )
}
