"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { Message, Participant, Profile } from "@/lib/types"
import { formatFileSize, formatCallDuration } from "@/lib/format"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  MessageSquare,
  Trash2,
  User,
  Video,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar } from "./avatar"

export type GalleryItem = {
  id: string
  type: "image" | "video" | "file"
  url: string
  name: string | null
  size: number | null
  createdAt: string
  senderId: string
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|heic|avif)(\?|$)/i
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mkv|3gp)(\?|$)/i

/** Resolve display kind from message type + filename/url. */
export function resolveMediaKind(
  type: string,
  fileName?: string | null,
  fileUrl?: string | null,
): "image" | "video" | "file" | null {
  if (type === "image") return "image"
  if (type === "video") return "video"
  if (type === "audio" || type === "system" || type === "text") return null
  const probe = `${fileName ?? ""} ${fileUrl ?? ""}`
  if (IMAGE_EXT.test(probe)) return "image"
  if (VIDEO_EXT.test(probe)) return "video"
  if (type === "file" && fileUrl) return "file"
  return null
}

export function mediaItemsFromMessages(messages: Message[]): GalleryItem[] {
  const items: GalleryItem[] = []
  for (const m of messages) {
    if (m.deleted_at || !m.file_url) continue
    const kind = resolveMediaKind(m.type, m.file_name, m.file_url)
    if (!kind) continue
    items.push({
      id: m.id,
      type: kind,
      url: m.file_url,
      name: m.file_name,
      size: m.file_size,
      createdAt: m.created_at,
      senderId: m.sender_id,
    })
  }
  return items
}

function formatGalleryDate(date: string) {
  const d = new Date(date)
  const datePart = d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  })
  const timePart = d.toLocaleTimeString("he-IL", { hour: "numeric", minute: "2-digit" })
  return `${datePart} בשעה ${timePart}`
}

type Props = {
  items: GalleryItem[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  currentUser: Profile
  participants: Participant[]
  onGoToMessage?: (messageId: string) => void
  onDelete?: (messageId: string) => void
}

export function MediaGallery({
  items,
  index,
  onIndexChange,
  onClose,
  currentUser,
  participants,
  onGoToMessage,
  onDelete,
}: Props) {
  const item = items[index]
  const touchStartX = useRef<number | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({})

  useEffect(() => setMounted(true), [])

  const goPrev = useCallback(() => {
    onIndexChange(Math.max(0, index - 1))
  }, [index, onIndexChange])

  const goNext = useCallback(() => {
    onIndexChange(Math.min(items.length - 1, index + 1))
  }, [index, items.length, onIndexChange])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        goNext()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        goPrev()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goNext, goPrev, onClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-thumb="${index}"]`)
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
  }, [index])

  useEffect(() => {
    for (const it of items) {
      if (it.type !== "video" || videoDurations[it.id] != null) continue
      const v = document.createElement("video")
      v.preload = "metadata"
      v.src = it.url
      v.onloadedmetadata = () => {
        if (Number.isFinite(v.duration)) {
          setVideoDurations((prev) => (prev[it.id] != null ? prev : { ...prev, [it.id]: v.duration }))
        }
      }
    }
  }, [items, videoDurations])

  if (!mounted || !item) return null

  const isMine = item.senderId === currentUser.id
  const sender = participants.find((p) => p.user_id === item.senderId)?.profile
  const senderName = isMine ? "אתה" : (sender?.display_name ?? sender?.email ?? "משתמש")
  const canPrev = index > 0
  const canNext = index < items.length - 1

  const ui = (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-[#111b21]/92"
      role="dialog"
      aria-modal="true"
      aria-label="גלריית מדיה"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current == null) return
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
        touchStartX.current = null
        if (Math.abs(dx) < 40) return
        if (dx > 0) goPrev()
        else goNext()
      }}
    >
      <header
        className="flex h-14 shrink-0 items-center gap-2 bg-[#202c33] px-2 text-[#aebac1]"
        dir="rtl"
      >
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
          aria-label="סגור"
        >
          <X className="h-6 w-6" />
        </button>

        {onGoToMessage && (
          <button
            type="button"
            onClick={() => {
              onGoToMessage(item.id)
              onClose()
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
            aria-label="עבור להודעה"
          >
            <MessageSquare className="h-5 w-5" />
          </button>
        )}

        {onDelete && isMine && (
          <button
            type="button"
            onClick={() => {
              onDelete(item.id)
              onClose()
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
            aria-label="מחק"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}

        <a
          href={item.url}
          download={item.name ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
          aria-label="הורדה"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="h-5 w-5" />
        </a>

        <div className="mr-auto flex min-w-0 items-center gap-3 pl-2">
          <div className="min-w-0 text-right">
            <div className="truncate text-sm font-medium text-white">{senderName}</div>
            <div className="truncate text-xs text-[#8696a0]">
              {formatGalleryDate(item.createdAt)}
              {items.length > 1 ? ` · ${index + 1}/${items.length}` : ""}
            </div>
          </div>
          {isMine ? (
            <Avatar name={currentUser.display_name} url={currentUser.avatar_url} size={40} />
          ) : sender ? (
            <Avatar name={senderName} url={sender.avatar_url} size={40} />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2a3942]">
              <User className="h-5 w-5 text-[#8696a0]" />
            </div>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-3 md:px-16">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canPrev}
          className={cn(
            "absolute right-2 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-[#3b4a54] text-white shadow-lg transition md:right-6",
            canPrev ? "opacity-90 hover:opacity-100" : "pointer-events-none opacity-25",
          )}
          aria-label="הקודם"
        >
          <ChevronRight className="h-8 w-8" />
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={!canNext}
          className={cn(
            "absolute left-2 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-[#3b4a54] text-white shadow-lg transition md:left-6",
            canNext ? "opacity-90 hover:opacity-100" : "pointer-events-none opacity-25",
          )}
          aria-label="הבא"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>

        <div
          className="flex max-h-full max-w-full items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {item.type === "image" && (
            <img
              src={item.url}
              alt={item.name ?? "תמונה"}
              className="max-h-[calc(100svh-10.5rem)] max-w-[min(100vw-2rem,960px)] object-contain select-none"
              draggable={false}
            />
          )}
          {item.type === "video" && (
            <video
              key={item.id}
              src={item.url}
              controls
              autoPlay
              playsInline
              className="max-h-[calc(100svh-10.5rem)] max-w-[min(100vw-2rem,960px)] rounded-sm bg-black shadow-2xl"
            />
          )}
          {item.type === "file" && (
            <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-[#202c33] px-8 py-10 text-center text-white">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#00a884]/20">
                <FileText className="h-10 w-10 text-[#00a884]" />
              </div>
              <div className="w-full">
                <div className="truncate text-base font-medium">{item.name ?? "קובץ"}</div>
                {item.size != null && (
                  <div className="mt-1 text-sm text-[#8696a0]">{formatFileSize(item.size)}</div>
                )}
              </div>
              <a
                href={item.url}
                download={item.name ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 rounded-full bg-[#00a884] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#029e7a]"
              >
                הורד קובץ
              </a>
            </div>
          )}
        </div>
      </div>

      <div
        ref={stripRef}
        className="flex shrink-0 gap-1.5 overflow-x-auto bg-[#111b21] px-4 py-3"
        dir="ltr"
      >
        {items.map((thumb, i) => (
          <button
            key={thumb.id}
            type="button"
            data-thumb={i}
            onClick={() => onIndexChange(i)}
            className={cn(
              "relative h-16 w-16 shrink-0 overflow-hidden rounded-md transition",
              i === index ? "ring-[3px] ring-[#00a884] ring-offset-1 ring-offset-[#111b21]" : "opacity-70 hover:opacity-100",
            )}
            aria-label={`מדיה ${i + 1}`}
            aria-current={i === index}
          >
            {thumb.type === "image" ? (
              <img src={thumb.url} alt="" className="h-full w-full object-cover" />
            ) : thumb.type === "video" ? (
              <>
                <video
                  src={thumb.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white">
                  <Video className="h-2.5 w-2.5" />
                  {videoDurations[thumb.id] != null
                    ? formatCallDuration(Math.round(videoDurations[thumb.id]))
                    : "—"}
                </span>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#2a3942]">
                <Download className="h-6 w-6 text-[#8696a0]" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )

  return createPortal(ui, document.body)
}
