"use client"

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react"
import { createPortal } from "react-dom"
import type { Message, Participant } from "@/lib/types"
import { formatTime, formatFileSize, avatarColor } from "@/lib/format"
import { callSystemLabel, parseCallSystemPayload } from "@/lib/call-system-message"
import { extractUrls, parseReplyContent } from "@/lib/message-content"
import { plainMessageText } from "@/lib/message-formatting"
import { parsePollPayload, pollPreviewLabel } from "@/lib/poll"
import { parseContactPayload, contactPreviewLabel } from "@/lib/contact-message"
import { parseEventPayload, eventPreviewLabel } from "@/lib/event-message"
import { isStickerMessage, stickerPreviewLabel } from "@/lib/sticker-message"
import { messageTickStatus } from "@/lib/message-status"
import { parseWatchSystemPayload, watchSystemLabel } from "@/lib/watch-system-message"
import { parseMeetingSystemPayload, meetingSystemLabel } from "@/lib/meeting-system-message"
import { MessageTicks } from "./message-ticks"
import { VoiceMessage } from "./voice-message"
import { PollMessage } from "./poll-message"
import { ContactMessage } from "./contact-message"
import { EventMessage } from "./event-message"
import { resolveMediaKind } from "./media-gallery"
import { isExpiredChatMedia, MEDIA_EXPIRED_LABEL } from "@/lib/media-retention"
import { useSignedMediaUrlControls } from "@/lib/use-signed-media-url"
import { SystemCallMessage } from "./system-call-message"
import { SystemWatchMessage } from "./system-watch-message"
import { SystemMeetingMessage } from "./system-meeting-message"
import { LinkPreview, MessageText } from "./message-text"
import {
  Ban,
  FileText,
  Download,
  Trash2,
  Video,
  ImageOff,
  ChevronDown,
  Reply,
  MessagesSquare,
  Copy,
  SmilePlus,
  Forward,
  Pin,
  Star,
  ThumbsDown,
  Plus,
  EyeOff,
  Pencil,
  CheckSquare,
  Check,
  Eye,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  isViewOnceMessage,
  isViewOnceOpened,
  VIEW_ONCE_OPENED_LABEL,
  VIEW_ONCE_PHOTO_LABEL,
  VIEW_ONCE_VIDEO_LABEL,
} from "@/lib/view-once"

type MenuPlacement = {
  top?: number
  bottom?: number
  left?: number
  right?: number
  maxHeight: number
}

const QUICK_REACTIONS = ["🙏", "😢", "😲", "😂", "❤️", "👍"]

type Props = {
  message: Message
  isMine: boolean
  isGroup: boolean
  showSenderName: boolean
  participants: Participant[]
  totalOthers: number
  onDeleteForEveryone?: () => void
  onDeleteForMe?: () => void
  onReply?: () => void
  /** Google Chat–style: open / reply in side thread (groups). */
  onReplyInThread?: () => void
  onOpenThread?: () => void
  threadReplyCount?: number
  threadPreview?: string | null
  onForward?: () => void
  onEdit?: () => void
  onToggleStar?: () => void
  onTogglePin?: () => void
  onReaction?: (emoji: string | null) => void
  onOpenMedia?: (messageId: string) => void
  onOpenViewOnce?: (messageId: string) => void
  onStartSelect?: () => void
  onToggleSelect?: () => void
  selectionMode?: boolean
  isSelected?: boolean
  currentUserAvatarUrl?: string | null
  currentUserName?: string | null
  currentUserId?: string
  reaction?: string | null
  isStarred?: boolean
  isPinned?: boolean
  searchQuery?: string
  onStartChatByEmail?: (email: string) => Promise<void>
  onJoinWatch?: (videoId: string) => void
  onStartWatchWithUrl?: (url: string) => void
  /** Video IDs whose watch session already ended in this chat */
  closedWatchVideoIds?: Set<string>
  onJoinMeeting?: (meetingId: string) => void
  /** Meeting IDs that already ended in this chat */
  closedMeetingIds?: Set<string>
  /** Narrower panel (thread side pane). */
  compact?: boolean
}

function replyPreviewText(message: Message) {
  if (message.deleted_at) return "הודעה שנמחקה"
  if (isViewOnceOpened(message)) return VIEW_ONCE_OPENED_LABEL
  if (isViewOnceMessage(message) && message.file_url) {
    return message.type === "video" ? VIEW_ONCE_VIDEO_LABEL : VIEW_ONCE_PHOTO_LABEL
  }
  if (isExpiredChatMedia(message)) return MEDIA_EXPIRED_LABEL
  if (isStickerMessage(message)) return stickerPreviewLabel()
  if (message.type === "image") return "תמונה"
  if (message.type === "video") return "סרטון"
  if (message.type === "audio") return "הודעה קולית"
  if (message.type === "file") return message.file_name ?? "קובץ"
  const poll = parsePollPayload(message.content)
  if (poll || message.type === "poll") return poll ? pollPreviewLabel(poll) : "📊 סקר"
  const contact = parseContactPayload(message.content)
  if (contact || message.type === "contact") return contact ? contactPreviewLabel(contact) : "👤 איש קשר"
  const event = parseEventPayload(message.content)
  if (event || message.type === "event") return event ? eventPreviewLabel(event) : "📅 אירוע"
  const call = parseCallSystemPayload(message.content)
  if (call) return callSystemLabel(call)
  const watch = parseWatchSystemPayload(message.content)
  if (watch) return watchSystemLabel(watch)
  const meeting = parseMeetingSystemPayload(message.content)
  if (meeting) return meetingSystemLabel(meeting)
  const legacy = parseReplyContent(message.content)
  if (legacy?.body) return plainMessageText(legacy.body)
  if (message.content) return plainMessageText(message.content)
  return "הודעה"
}

function copyMessageText(message: Message) {
  const poll = parsePollPayload(message.content)
  if (poll || message.type === "poll") {
    const lines = [poll?.question ?? "סקר", ...(poll?.options.map((o) => `• ${o.text}`) ?? [])]
    void navigator.clipboard.writeText(lines.filter(Boolean).join("\n"))
    return
  }
  const contact = parseContactPayload(message.content)
  if (contact || message.type === "contact") {
    void navigator.clipboard.writeText(
      [contact?.displayName, contact?.phone, contact?.email].filter(Boolean).join("\n"),
    )
    return
  }
  const event = parseEventPayload(message.content)
  if (event || message.type === "event") {
    void navigator.clipboard.writeText(
      [event?.title, event?.startsAt, event?.location, event?.description].filter(Boolean).join("\n"),
    )
    return
  }
  if (isStickerMessage(message)) {
    void navigator.clipboard.writeText(stickerPreviewLabel())
    return
  }
  const reply = parseReplyContent(message.content)
  const body = message.reply_to_id ? message.content : (reply?.body ?? message.content)
  const parts: string[] = []
  if (body) parts.push(plainMessageText(body))
  if (message.file_name) parts.push(message.file_name)
  if (message.file_url && !body && !message.file_name) parts.push(message.file_url)
  const text = parts.join("\n").trim()
  if (!text) return
  void navigator.clipboard.writeText(text)
}

export function MessageBubble({
  message,
  isMine,
  isGroup,
  showSenderName,
  participants,
  totalOthers,
  onDeleteForEveryone,
  onDeleteForMe,
  onReply,
  onReplyInThread,
  onOpenThread,
  threadReplyCount = 0,
  threadPreview,
  onForward,
  onEdit,
  onToggleStar,
  onTogglePin,
  onReaction,
  onOpenMedia,
  onOpenViewOnce,
  onStartSelect,
  onToggleSelect,
  selectionMode,
  isSelected,
  currentUserAvatarUrl,
  currentUserName,
  currentUserId,
  reaction: reactionProp,
  isStarred,
  isPinned,
  searchQuery,
  onStartChatByEmail,
  onJoinWatch,
  onStartWatchWithUrl,
  closedWatchVideoIds,
  onJoinMeeting,
  closedMeetingIds,
  compact,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showMoreEmoji, setShowMoreEmoji] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [menuPlacement, setMenuPlacement] = useState<MenuPlacement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const {
    url: displayFileUrl,
    loading: mediaUrlLoading,
    refresh: refreshMediaUrl,
  } = useSignedMediaUrlControls(message.view_once ? null : message.file_url)
  const senderProfile = participants.find((p) => p.user_id === message.sender_id)?.profile
  const senderName = senderProfile?.display_name ?? senderProfile?.email ?? "משתמש"

  const reaction = reactionProp ?? null
  const callPayload = parseCallSystemPayload(message.content)
  const watchPayload = parseWatchSystemPayload(message.content)
  const meetingPayload = parseMeetingSystemPayload(message.content)
  const pollPayload = parsePollPayload(message.content)
  const isPoll = message.type === "poll" || Boolean(pollPayload)
  const contactPayload = parseContactPayload(message.content)
  const isContact = message.type === "contact" || Boolean(contactPayload)
  const eventPayload = parseEventPayload(message.content)
  const isEvent = message.type === "event" || Boolean(eventPayload)
  const isSticker = isStickerMessage(message)

  const readCount = (message.reads ?? []).filter((r) => r.user_id !== message.sender_id).length
  const status = messageTickStatus(message, totalOthers)

  const updateMenuPlacement = () => {
    const el = bubbleRef.current
    if (!el || typeof window === "undefined") return
    const rect = el.getBoundingClientRect()
    const margin = 8
    const estimatedHeight = showMoreEmoji ? 520 : 420
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const placeAbove = spaceBelow < Math.min(estimatedHeight, 280) && spaceAbove > spaceBelow
    const maxHeight = Math.max(160, placeAbove ? spaceAbove : spaceBelow)
    const next: MenuPlacement = {
      maxHeight,
      ...(placeAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
      ...(isMine
        ? { left: Math.min(Math.max(margin, rect.left), window.innerWidth - 240) }
        : { right: Math.min(Math.max(margin, window.innerWidth - rect.right), window.innerWidth - 240) }),
    }
    setMenuPlacement(next)
  }

  const closeMenu = () => {
    setMenuOpen(false)
    setShowMoreEmoji(false)
    setConfirmDelete(false)
    setMenuPlacement(null)
  }

  const openMenu = () => {
    if (selectionMode) return
    setShowMoreEmoji(false)
    setConfirmDelete(false)
    setMenuOpen(true)
  }

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPlacement(null)
      return
    }
    updateMenuPlacement()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu()
    }
    const onReposition = () => updateMenuPlacement()
    window.addEventListener("keydown", onKey)
    window.addEventListener("resize", onReposition)
    window.addEventListener("scroll", onReposition, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onReposition)
      window.removeEventListener("scroll", onReposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, showMoreEmoji, isMine, selectionMode])

  useEffect(() => {
    return () => {
      if (longPressRef.current) clearTimeout(longPressRef.current)
    }
  }, [])

  if (watchPayload) {
    const joinBlocked =
      watchPayload.event === "started" &&
      Boolean(closedWatchVideoIds?.has(watchPayload.videoId))
    return (
      <SystemWatchMessage message={message} onJoin={onJoinWatch} joinBlocked={joinBlocked} />
    )
  }

  if (meetingPayload) {
    const joinBlocked =
      meetingPayload.event === "started" &&
      Boolean(closedMeetingIds?.has(meetingPayload.meetingId))
    return (
      <SystemMeetingMessage
        message={message}
        onJoin={onJoinMeeting}
        joinBlocked={joinBlocked}
        isGroup={isGroup}
      />
    )
  }

  if (message.type === "system" || callPayload) {
    return <SystemCallMessage message={message} />
  }

  if (message.deleted_at) {
    return (
      <div className={cn("flex px-2", isMine ? "justify-start" : "justify-end")} dir="ltr">
        <div
          className={cn(
            "relative my-0.5 max-w-[65%] rounded-lg px-2.5 py-1.5 shadow-sm",
            isMine ? "bubble-tail-out rounded-tl-none bg-[var(--wa-bubble-out)]" : "bubble-tail-in rounded-tr-none bg-[var(--wa-panel)]",
          )}
          dir="rtl"
        >
          <span className="flex items-center gap-1.5 italic text-[14px] text-[var(--wa-text-secondary)]">
            <Ban className="h-3.5 w-3.5 shrink-0" />
            ההודעה נמחקה
          </span>
          <span className="float-right ml-2 mt-1 flex items-center gap-1 text-[11px] text-[var(--wa-text-secondary)]" dir="ltr">
            {formatTime(message.created_at)}
            {isMine && <MessageTicks status={status} isGroup={isGroup} viewCount={readCount} />}
          </span>
        </div>
      </div>
    )
  }

  const openMedia = (e?: MouseEvent) => {
    e?.stopPropagation()
    e?.preventDefault()
    if (selectionMode) {
      onToggleSelect?.()
      return
    }
    if (isViewOnceMessage(message) && message.file_url) {
      onOpenViewOnce?.(message.id)
      return
    }
    if (onOpenMedia && message.file_url) onOpenMedia(message.id)
  }

  const mediaKind = message.file_url
    ? resolveMediaKind(message.type, message.file_name, message.file_url)
    : null
  const viewOnce = isViewOnceMessage(message)
  const viewOnceOpened = isViewOnceOpened(message)
  const mediaExpired = isExpiredChatMedia(message) && !viewOnce

  const legacyReply = parseReplyContent(message.content)
  const structuredTarget = message.reply_to
  const structuredAuthor = structuredTarget
    ? (participants.find((p) => p.user_id === structuredTarget.sender_id)?.profile?.display_name ??
        participants.find((p) => p.user_id === structuredTarget.sender_id)?.profile?.email ??
        "משתמש")
    : null
  const reply = structuredTarget
    ? {
        author: structuredAuthor ?? "משתמש",
        preview: replyPreviewText(structuredTarget),
        body: message.content ?? "",
      }
    : legacyReply
  const bodyText = structuredTarget ? message.content : (legacyReply?.body ?? message.content)
  const pollBody = isPoll ? pollPayload : null
  const contactBody = isContact ? contactPayload : null
  const eventBody = isEvent ? eventPayload : null
  const hideStructuredBody = Boolean(pollBody || contactBody || eventBody || isSticker)
  const displayBodyText = hideStructuredBody ? null : bodyText
  const urls = displayBodyText ? extractUrls(plainMessageText(displayBodyText)) : []
  const canEdit =
    isMine &&
    Boolean(onEdit) &&
    !message.pending &&
    !message.id.startsWith("temp-") &&
    !isPoll &&
    !isContact &&
    !isEvent &&
    !isSticker &&
    (message.type === "text" || Boolean(bodyText?.trim()))

  const pickReaction = (emoji: string) => {
    const next = reaction === emoji ? null : emoji
    onReaction?.(next)
    closeMenu()
  }

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  const onPointerDownSelect = () => {
    if (selectionMode || !onStartSelect) return
    clearLongPress()
    longPressRef.current = setTimeout(() => {
      onStartSelect()
    }, 450)
  }

  const menuItems = [
    ...(onReply
      ? [
          {
            id: "reply" as const,
            label: "תשובה",
            icon: Reply,
            onClick: () => {
              closeMenu()
              onReply()
            },
          },
        ]
      : []),
    ...(onReplyInThread
      ? [
          {
            id: "thread" as const,
            label: "תשובה בשרשור",
            icon: MessagesSquare,
            onClick: () => {
              closeMenu()
              onReplyInThread()
            },
          },
        ]
      : []),
    ...(canEdit
      ? [
          {
            id: "edit" as const,
            label: "עריכה",
            icon: Pencil,
            onClick: () => {
              closeMenu()
              onEdit?.()
            },
          },
        ]
      : []),
    {
      id: "copy",
      label: "העתקה",
      icon: Copy,
      onClick: () => {
        copyMessageText(message)
        closeMenu()
      },
    },
    {
      id: "emoji",
      label: "הוספת אימוג'י",
      icon: SmilePlus,
      onClick: () => setShowMoreEmoji(true),
    },
    ...(onForward && !viewOnce
      ? [
          {
            id: "forward" as const,
            label: "העברה",
            icon: Forward,
            onClick: () => {
              closeMenu()
              onForward()
            },
          },
        ]
      : []),
    ...(onStartSelect
      ? [
          {
            id: "select" as const,
            label: "בחירה",
            icon: CheckSquare,
            onClick: () => {
              closeMenu()
              onStartSelect()
            },
          },
        ]
      : []),
    {
      id: "pin",
      label: isPinned ? "ביטול הצמדה" : "הצמדה",
      icon: Pin,
      onClick: () => {
        closeMenu()
        onTogglePin?.()
      },
    },
    {
      id: "star",
      label: isStarred ? "הסר כוכב" : "סימון בכוכב",
      icon: Star,
      onClick: () => {
        closeMenu()
        onToggleStar?.()
      },
    },
  ]

  const replyCountLabel =
    threadReplyCount === 1 ? "תגובה אחת" : `${threadReplyCount} תגובות`

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1 px-2",
        isMine ? "items-start" : "items-end",
        selectionMode && isSelected && "rounded-lg bg-[#00a884]/10",
      )}
      dir="ltr"
      onClick={() => {
        if (selectionMode) onToggleSelect?.()
      }}
    >
      <div
        className={cn(
          "flex w-full items-center gap-2",
          isMine ? "justify-start" : "justify-end",
        )}
      >
      {selectionMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect?.()
          }}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition",
            isSelected ? "border-[#00a884] bg-[#00a884] text-white" : "border-[#8696a0] bg-[var(--wa-panel)]",
            isMine ? "order-first" : "order-last",
          )}
          aria-label={isSelected ? "בטל בחירה" : "בחר הודעה"}
          aria-pressed={isSelected}
        >
          {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
      )}

      <div
        ref={bubbleRef}
        className={cn(
          "relative my-0.5 rounded-lg px-2.5 py-1.5 shadow-sm",
          compact ? "max-w-[95%]" : "max-w-[65%]",
          isMine ? "bubble-tail-out rounded-tl-none bg-[var(--wa-bubble-out)]" : "bubble-tail-in rounded-tr-none bg-[var(--wa-panel)]",
          menuOpen && "z-20",
          isPinned && "ring-1 ring-[#00a884]/40",
        )}
        dir="rtl"
        onContextMenu={(e) => {
          e.preventDefault()
          if (selectionMode) {
            onToggleSelect?.()
            return
          }
          openMenu()
        }}
        onPointerDown={onPointerDownSelect}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
      >
        {isGroup && !isMine && showSenderName && (
          <div className="mb-0.5 text-xs font-medium" style={{ color: avatarColor(senderName) }}>
            {senderName}
          </div>
        )}

        {message.is_forwarded && (
          <div className="mb-0.5 flex items-center gap-1 text-[11px] italic text-[var(--wa-text-secondary)]">
            <Forward className="h-3 w-3 shrink-0" />
            הועבר
          </div>
        )}

        {reply && (
          <div className="mb-1 rounded-md border-r-4 border-[#06cf9c] bg-black/[0.06] px-2 py-1.5 text-right">
            <div className="truncate text-xs font-medium text-[#06cf9c]">{reply.author}</div>
            <div className="truncate text-[12px] text-[var(--wa-text-secondary)]">{reply.preview || "הודעה"}</div>
          </div>
        )}

        {viewOnceOpened && (
          <div className="mb-1 flex max-w-xs items-center gap-2 rounded-md bg-black/5 px-3 py-3 text-[13px] text-[var(--wa-text-secondary)]">
            <EyeOff className="h-5 w-5 shrink-0 opacity-50" />
            <span>{VIEW_ONCE_OPENED_LABEL}</span>
          </div>
        )}

        {mediaExpired && (
          <div className="mb-1 flex max-w-xs items-center gap-2 rounded-md bg-black/5 px-3 py-3 text-[13px] text-[var(--wa-text-secondary)]">
            {message.type === "video" ? (
              <Video className="h-5 w-5 shrink-0 opacity-50" />
            ) : (
              <ImageOff className="h-5 w-5 shrink-0 opacity-50" />
            )}
            <span>{MEDIA_EXPIRED_LABEL}</span>
          </div>
        )}

        {viewOnce && message.file_url && (
          <button
            type="button"
            onClick={openMedia}
            className="mb-1 flex w-full max-w-xs flex-col items-center gap-2 rounded-md bg-gradient-to-b from-[#1f2c34] to-[#0b141a] px-4 py-6 text-center text-white transition hover:brightness-110"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-2 ring-[#25d366]/50">
              <Eye className="h-7 w-7 text-[#25d366]" />
            </span>
            <span className="text-sm font-medium">
              {message.type === "video" ? VIEW_ONCE_VIDEO_LABEL : VIEW_ONCE_PHOTO_LABEL}
            </span>
            <span className="text-[11px] text-white/55">
              {isMine ? "הנמען יצפה פעם אחת" : "הקש לצפייה חד־פעמית"}
            </span>
          </button>
        )}

        {!viewOnce && !isSticker && mediaKind === "image" && message.file_url && displayFileUrl && (
          <button
            type="button"
            onClick={openMedia}
            className="mb-1 block w-full max-w-xs overflow-hidden rounded-md text-right"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayFileUrl}
              alt="תמונה"
              className="max-h-80 w-full cursor-pointer object-cover transition hover:brightness-95"
            />
          </button>
        )}

        {!viewOnce && !isSticker && mediaKind === "image" && message.file_url && !displayFileUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              refreshMediaUrl()
            }}
            className="mb-1 flex max-w-xs items-center gap-2 rounded-md bg-black/5 px-3 py-3 text-[13px] text-[var(--wa-text-secondary)]"
          >
            <ImageOff className="h-5 w-5 shrink-0 opacity-50" />
            <span>{mediaUrlLoading ? "טוען תמונה…" : "לא ניתן להציג — לחץ לניסיון חוזר"}</span>
          </button>
        )}

        {!viewOnce && mediaKind === "video" && message.file_url && displayFileUrl && (
          <button
            type="button"
            onClick={openMedia}
            className="relative mb-1 block w-full max-w-xs overflow-hidden rounded-md text-right"
          >
            <video
              src={displayFileUrl}
              className="max-h-80 w-full cursor-pointer object-cover"
              muted
              playsInline
              preload="metadata"
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white">
                <Video className="h-6 w-6" />
              </span>
            </span>
          </button>
        )}

        {!viewOnce && mediaKind === "video" && message.file_url && !displayFileUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              refreshMediaUrl()
            }}
            className="mb-1 flex max-w-xs items-center gap-2 rounded-md bg-black/5 px-3 py-3 text-[13px] text-[var(--wa-text-secondary)]"
          >
            <Video className="h-5 w-5 shrink-0 opacity-50" />
            <span>{mediaUrlLoading ? "טוען סרטון…" : "לא ניתן להציג — לחץ לניסיון חוזר"}</span>
          </button>
        )}

        {message.type === "audio" && message.file_url && (
          <VoiceMessage
            fileUrl={message.file_url}
            messageId={message.id}
            isMine={isMine}
            timeLabel={formatTime(message.created_at)}
            status={status}
            isGroup={isGroup}
            viewCount={readCount}
            avatarUrl={isMine ? currentUserAvatarUrl : senderProfile?.avatar_url}
            avatarName={isMine ? currentUserName : senderName}
          />
        )}

        {pollBody && currentUserId && (
          <PollMessage
            messageId={message.id}
            payload={pollBody}
            currentUserId={currentUserId}
            pending={message.pending}
          />
        )}

        {contactBody && (
          <ContactMessage payload={contactBody} onStartChatByEmail={onStartChatByEmail} />
        )}

        {eventBody && <EventMessage payload={eventBody} />}

        {isSticker && message.file_url && displayFileUrl && (
          <button
            type="button"
            onClick={openMedia}
            className="mb-1 block max-w-[180px] bg-transparent p-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayFileUrl}
              alt="מדבקה"
              className="max-h-40 max-w-full object-contain"
              draggable={false}
            />
          </button>
        )}

        {isSticker && message.file_url && !displayFileUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              refreshMediaUrl()
            }}
            className="mb-1 flex max-w-xs items-center gap-2 rounded-md bg-black/5 px-3 py-3 text-[13px] text-[var(--wa-text-secondary)]"
          >
            <span>{mediaUrlLoading ? "טוען מדבקה…" : "לא ניתן להציג — לחץ לניסיון חוזר"}</span>
          </button>
        )}

        {isSticker && !message.file_url && (
          <div className="mb-1 text-sm text-[var(--wa-text-secondary)]">{stickerPreviewLabel()}</div>
        )}

        {mediaKind === "file" && message.file_url && (
          <button
            type="button"
            onClick={openMedia}
            className="mb-1 flex w-full items-center gap-3 rounded-md bg-black/5 p-2.5 text-right transition hover:bg-black/10"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884]/15">
              <FileText className="h-5 w-5 text-[#00a884]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-[var(--wa-text)]">{message.file_name}</div>
              <div className="text-xs text-[var(--wa-text-secondary)]">
                {message.file_size ? formatFileSize(message.file_size) : ""}
              </div>
            </div>
            <Download className="h-4 w-4 shrink-0 text-[var(--wa-text-secondary)]" />
          </button>
        )}

        {displayBodyText && message.type !== "audio" && (
          <MessageText
            text={displayBodyText}
            searchQuery={searchQuery}
            onStartChatByEmail={onStartChatByEmail}
          />
        )}

        {urls[0] && message.type === "text" && !isPoll && (
          <LinkPreview url={urls[0]} onWatchTogether={onStartWatchWithUrl} />
        )}

        {message.type !== "audio" && (
          <span className="float-right ml-2 mt-1 flex items-center gap-1 text-[11px] text-[var(--wa-text-secondary)]" dir="ltr">
            {isStarred && <Star className="h-3 w-3 fill-[#eab308] text-[#eab308]" />}
            {isPinned && <Pin className="h-3 w-3 text-[#00a884]" />}
            {message.edited_at && <span className="text-[10px]">נערך</span>}
            {formatTime(message.created_at)}
            {isMine && <MessageTicks status={status} isGroup={isGroup} viewCount={readCount} />}
          </span>
        )}

        {!selectionMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (menuOpen) closeMenu()
              else openMenu()
            }}
            className={cn(
              "absolute top-0.5 rounded-bl-md rounded-tr-md bg-gradient-to-bl from-black/10 to-transparent p-0.5 text-[var(--wa-text-secondary)] transition",
              isMine ? "left-0.5" : "right-0.5",
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            aria-label="אפשרויות הודעה"
            aria-expanded={menuOpen}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}

        {reaction && (
          <span className="absolute -bottom-2 right-2 z-10 rounded-full bg-[var(--wa-panel)] px-1.5 py-0.5 text-sm shadow ring-1 ring-black/5">
            {reaction}
          </span>
        )}
      </div>

      {menuOpen &&
        !selectionMode &&
        menuPlacement &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[90] cursor-default"
              aria-label="סגור"
              onClick={closeMenu}
            />
            <div
              ref={menuRef}
              className="fixed z-[100] flex max-w-[min(92vw,280px)] flex-col items-stretch gap-1 overflow-y-auto"
              style={
                {
                  top: menuPlacement.top,
                  bottom: menuPlacement.bottom,
                  left: menuPlacement.left,
                  right: menuPlacement.right,
                  maxHeight: menuPlacement.maxHeight,
                } satisfies CSSProperties
              }
              dir="rtl"
            >
              <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--wa-panel)] px-1.5 py-1 shadow-lg ring-1 ring-black/5">
                <button
                  type="button"
                  onClick={() => setShowMoreEmoji((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-[var(--wa-header)]"
                  aria-label="עוד תגובות"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => pickReaction(emoji)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-lg transition hover:scale-110 hover:bg-[var(--wa-header)]",
                      reaction === emoji && "bg-[var(--wa-accent-soft)]",
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {showMoreEmoji && (
                <div className="grid shrink-0 grid-cols-6 gap-0.5 rounded-2xl bg-[var(--wa-panel)] p-2 shadow-lg ring-1 ring-black/5">
                  {["😀", "😍", "🥰", "😎", "🤔", "😡", "🔥", "🎉", "💯", "😴", "🤗", "👏", "😮", "🤣", "💔", "✨", "👀", "💪"].map(
                    (emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => pickReaction(emoji)}
                        className="rounded-lg p-1.5 text-lg transition hover:bg-[var(--wa-header)]"
                      >
                        {emoji}
                      </button>
                    ),
                  )}
                </div>
              )}

              <div className="min-w-[220px] overflow-hidden rounded-xl bg-[var(--wa-panel)] py-1.5 shadow-lg ring-1 ring-black/5">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
                    onClick={item.onClick}
                  >
                    <span>{item.label}</span>
                    <item.icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 text-[var(--wa-text-secondary)]",
                        item.id === "star" && isStarred && "fill-[#eab308] text-[#eab308]",
                        item.id === "pin" && isPinned && "text-[#00a884]",
                      )}
                      strokeWidth={1.75}
                    />
                  </button>
                ))}

                <div className="my-1 border-t border-[var(--wa-border)]" />

                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
                  onClick={closeMenu}
                >
                  <span>דיווח</span>
                  <ThumbsDown className="h-[18px] w-[18px] shrink-0 text-[var(--wa-text-secondary)]" strokeWidth={1.75} />
                </button>

                {onDeleteForMe && (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
                    onClick={() => {
                      closeMenu()
                      onDeleteForMe()
                    }}
                  >
                    <span>מחק אצלי</span>
                    <EyeOff className="h-[18px] w-[18px] shrink-0 text-[var(--wa-text-secondary)]" strokeWidth={1.75} />
                  </button>
                )}

                {onDeleteForEveryone &&
                  (confirmDelete ? (
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[#ea0038] transition hover:bg-[var(--wa-hover)]"
                      onClick={() => {
                        closeMenu()
                        onDeleteForEveryone()
                      }}
                    >
                      <span>אשר מחיקה לכולם</span>
                      <Trash2 className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <span>מחק לכולם</span>
                      <Trash2 className="h-[18px] w-[18px] shrink-0 text-[var(--wa-text-secondary)]" strokeWidth={1.75} />
                    </button>
                  ))}
              </div>
            </div>
          </>,
          document.body,
        )}
      </div>

      {onOpenThread && threadReplyCount > 0 && !selectionMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenThread()
          }}
          className={cn(
            "mb-1 flex max-w-[min(100%,320px)] items-center gap-2 rounded-lg border border-[#d1d7db] bg-[var(--wa-panel)] px-3 py-1.5 text-right shadow-sm transition hover:bg-[var(--wa-header)]",
            isMine ? "self-start" : "self-end",
          )}
          dir="rtl"
        >
          <MessagesSquare className="h-4 w-4 shrink-0 text-[#00a884]" strokeWidth={1.75} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-[#00a884]">{replyCountLabel}</span>
            {threadPreview && (
              <span className="block truncate text-[12px] text-[var(--wa-text-secondary)]">{threadPreview}</span>
            )}
          </span>
        </button>
      )}
    </div>
  )
}
