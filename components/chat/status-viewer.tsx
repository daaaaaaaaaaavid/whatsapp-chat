"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Avatar } from "./avatar"
import { createClient } from "@/lib/supabase/client"
import type { Profile, Status, StatusReply } from "@/lib/types"
import { formatStatusTime } from "@/lib/format"
import {
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  MoreVertical,
  Pause,
  Play,
  SendHorizontal,
  Smile,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { notifyStatusOwner } from "@/lib/push-client"
import { useSignedMediaUrl } from "@/lib/use-signed-media-url"

export type GroupedStatus = { profile: Profile; statuses: Status[] }

const IMAGE_DURATION_MS = 5000
const EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "🤔", "😢", "👍", "🙏", "❤️", "🔥", "🎉"]

function isImageUrl(url: string) {
  return /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|avif)(\?|#|$)/i.test(url)
}

/** Prefer video for ambiguous URLs so a 5s image timer never cuts a clip short. */
function isVideoUrl(url: string) {
  if (/#(?:whachat=)?video\b/i.test(url)) return true
  if (/#(?:whachat=)?image\b/i.test(url)) return false
  if (/\.(mp4|webm|ogg|mov|m4v|mkv|avi|3gp)(\?|#|$)/i.test(url)) return true
  if (isImageUrl(url)) return false
  return true
}

/** Split status text into a mid banner (title lines) and a free caption. */
function splitOverlayText(content: string | null) {
  if (!content?.trim()) return { bannerLines: [] as string[], caption: null as string | null }
  const lines = content
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return { bannerLines: [], caption: null }
  if (lines.length === 1) return { bannerLines: [], caption: lines[0] }
  if (lines.length === 2) return { bannerLines: lines, caption: null }
  return { bannerLines: lines.slice(0, -1), caption: lines[lines.length - 1] }
}

type Props = {
  group: GroupedStatus
  groups: GroupedStatus[]
  index: number
  currentUserId: string
  onIndexChange: (i: number) => void
  onGroupChange: (group: GroupedStatus, index: number) => void
  onClose: () => void
  onStatusDeleted?: (statusId: string) => void
}

export function StatusViewer({
  group,
  groups,
  index,
  currentUserId,
  onIndexChange,
  onGroupChange,
  onClose,
  onStatusDeleted,
}: Props) {
  const status = group.statuses[index]
  const groupIdx = groups.findIndex((g) => g.profile.id === group.profile.id)
  const isOwn = group.profile.id === currentUserId

  const [progress, setProgress] = useState(0)
  const [userPaused, setUserPaused] = useState(false)
  const [holding, setHolding] = useState(false)
  const [muted, setMuted] = useState(true)
  const [mediaLoading, setMediaLoading] = useState(true)
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [replySent, setReplySent] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [replies, setReplies] = useState<StatusReply[]>([])
  const [showReplies, setShowReplies] = useState(false)
  const [repliesLoading, setRepliesLoading] = useState(false)

  const hasMedia = Boolean(status?.media_url)
  const isVideo = hasMedia && status?.media_url ? isVideoUrl(status.media_url) : false
  const displayMediaUrl = useSignedMediaUrl(status?.media_url)
  const paused = userPaused || holding || Boolean(reply.trim()) || showEmoji || showReplies || Boolean(replyError)
  const progressRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const advancingRef = useRef(false)

  useEffect(() => {
    progressRef.current = 0
    advancingRef.current = false
    setProgress(0)
    setUserPaused(false)
    setHolding(false)
    setMediaLoading(Boolean(status?.media_url))
    setReply("")
    setShowEmoji(false)
    setMenuOpen(false)
    setReplySent(false)
    setReplyError(null)
    setDeleteError(null)
    setShowReplies(false)
    setReplies([])
  }, [status?.id])

  useEffect(() => {
    if (!status) return
    if (status.user_id !== currentUserId) {
      const supabase = createClient()
      void supabase
        .from("status_views")
        .upsert({ status_id: status.id, viewer_id: currentUserId }, { onConflict: "status_id,viewer_id" })
    }
  }, [status, currentUserId])

  const loadReplies = useCallback(async (statusId: string) => {
    setRepliesLoading(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from("status_replies")
        .select("*")
        .eq("status_id", statusId)
        .order("created_at", { ascending: true })
      if (!data) {
        setReplies([])
        return
      }
      const uids = Array.from(new Set(data.map((r) => r.user_id)))
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, about, last_seen, created_at")
        .in("id", uids)
      const pmap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]))
      setReplies(data.map((r) => ({ ...r, profile: pmap.get(r.user_id) })) as StatusReply[])
    } finally {
      setRepliesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!status || !isOwn) return
    void loadReplies(status.id)
  }, [status?.id, isOwn, loadReplies])

  useEffect(() => {
    if (!status || !isOwn) return
    const supabase = createClient()
    const channel = supabase
      .channel(`status-replies-${status.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "status_replies",
          filter: `status_id=eq.${status.id}`,
        },
        () => {
          void loadReplies(status.id)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [status?.id, isOwn, loadReplies])

  const goNext = useCallback(() => {
    if (advancingRef.current) return
    advancingRef.current = true
    if (index < group.statuses.length - 1) {
      onIndexChange(index + 1)
      return
    }
    if (groupIdx >= 0 && groupIdx < groups.length - 1) {
      onGroupChange(groups[groupIdx + 1], 0)
      return
    }
    onClose()
  }, [index, group.statuses.length, groupIdx, groups, onIndexChange, onGroupChange, onClose])

  const goPrev = useCallback(() => {
    advancingRef.current = false
    if (index > 0) {
      onIndexChange(index - 1)
      return
    }
    if (groupIdx > 0) {
      const prev = groups[groupIdx - 1]
      onGroupChange(prev, prev.statuses.length - 1)
    }
  }, [index, groupIdx, groups, onIndexChange, onGroupChange])

  // Images / text only — never runs while a video slide is active.
  useEffect(() => {
    if (!status || paused || isVideo) return
    if (hasMedia && mediaLoading) return
    let cancelled = false
    let raf = 0
    const startedAt = performance.now() - progressRef.current * IMAGE_DURATION_MS
    const tick = (now: number) => {
      if (cancelled) return
      // Guard against a stale RAF overlapping onto a video after navigation.
      if (videoRef.current) return
      const p = Math.min(1, (now - startedAt) / IMAGE_DURATION_MS)
      progressRef.current = p
      setProgress(p)
      if (p >= 1) goNext()
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [status?.id, paused, isVideo, hasMedia, mediaLoading, goNext])

  // Videos: progress + advance come only from the <video> element duration.
  useEffect(() => {
    if (!status || !isVideo || paused) return
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const v = videoRef.current
      if (v) {
        const duration = v.duration
        if (Number.isFinite(duration) && duration > 0) {
          const p = Math.min(1, v.currentTime / duration)
          if (Math.abs(p - progressRef.current) >= 0.002 || p >= 1) {
            progressRef.current = p
            setProgress(p)
          }
          if (v.ended || v.currentTime >= duration - 0.05) {
            goNext()
            return
          }
        }
        if (v.paused && !v.ended && v.readyState >= 2) {
          void v.play().catch(() => {})
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [status?.id, isVideo, paused, goNext])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showReplies) {
          setShowReplies(false)
          return
        }
        onClose()
      }
      if (e.key === "ArrowLeft") goNext()
      if (e.key === "ArrowRight") goPrev()
      if (e.key === " ") {
        e.preventDefault()
        setUserPaused((p) => !p)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goNext, goPrev, onClose, showReplies])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = muted
    if (paused) void v.pause()
    else void v.play().catch(() => {})
  }, [paused, muted, status?.id])

  const sendReply = async () => {
    const trimmed = reply.trim()
    if (!trimmed || sending || isOwn || !status) return
    setSending(true)
    setReplyError(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("status_replies")
        .insert({
          status_id: status.id,
          user_id: currentUserId,
          content: trimmed,
        })
        .select("id")
        .single()
      if (error) {
        setReplyError(error.message || "שליחת התגובה נכשלה")
        return
      }
      if (data?.id) {
        notifyStatusOwner({
          statusId: status.id,
          replyId: data.id,
        })
      }
      setReply("")
      setReplySent(true)
      setShowEmoji(false)
      setTimeout(() => setReplySent(false), 1500)
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "שליחת התגובה נכשלה")
    } finally {
      setSending(false)
    }
  }

  const deleteStatus = async () => {
    if (!status || !isOwn || deleting) return
    setDeleting(true)
    setDeleteError(null)
    setMenuOpen(false)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("statuses")
        .delete()
        .eq("id", status.id)
        .eq("user_id", currentUserId)
      if (error) {
        setDeleteError(error.message || "מחיקת הסטטוס נכשלה")
        return
      }
      onStatusDeleted?.(status.id)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "מחיקת הסטטוס נכשלה")
    } finally {
      setDeleting(false)
    }
  }

  if (!status) return null

  const { bannerLines, caption } = hasMedia
    ? splitOverlayText(status.content)
    : { bannerLines: [] as string[], caption: null }

  const canPrev = index > 0 || groupIdx > 0
  const canNext = index < group.statuses.length - 1 || (groupIdx >= 0 && groupIdx < groups.length - 1)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--wa-header)]"
      role="dialog"
      aria-modal="true"
      aria-label="צפייה בסטטוס"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 left-4 z-20 rounded-full p-2 text-[var(--wa-text-secondary)] transition hover:bg-black/5"
        aria-label="סגור"
      >
        <X className="h-7 w-7" strokeWidth={1.75} />
      </button>

      <button
        type="button"
        onClick={goPrev}
        disabled={!canPrev}
        className={cn(
          "absolute top-1/2 left-6 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[#667781]/90 text-white shadow-md transition hover:bg-[#54656f]",
          !canPrev && "pointer-events-none opacity-0",
        )}
        aria-label="הקודם"
      >
        <ChevronLeft className="h-7 w-7" />
      </button>

      <button
        type="button"
        onClick={goNext}
        disabled={!canNext}
        className={cn(
          "absolute top-1/2 right-6 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[#667781]/90 text-white shadow-md transition hover:bg-[#54656f]",
          !canNext && "pointer-events-none opacity-0",
        )}
        aria-label="הבא"
      >
        <ChevronRight className="h-7 w-7" />
      </button>

      {/* Vertical 9:16 story frame */}
      <div className="relative flex h-[min(96svh,860px)] w-[min(100vw-2rem,calc(min(96svh,860px)*9/16))] max-w-[420px] flex-col overflow-hidden rounded-sm bg-black shadow-2xl">
        {/* Progress */}
        <div className="absolute inset-x-0 top-0 z-30 flex gap-1 px-2 pt-2">
          {group.statuses.map((s, i) => (
            <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
              <div
                className="h-full rounded-full bg-[var(--wa-panel)] transition-none"
                style={{
                  width: i < index ? "100%" : i > index ? "0%" : `${progress * 100}%`,
                }}
              />
            </div>
          ))}
        </div>

        {/* Top chrome */}
        <div className="absolute inset-x-0 top-0 z-30 flex items-start gap-2 bg-gradient-to-b from-black/55 to-transparent px-3 pb-8 pt-5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 pt-0.5" dir="rtl">
            <Avatar name={group.profile.display_name} url={group.profile.avatar_url} size={36} />
            <div className="min-w-0 flex-1 text-right">
              <div className="truncate text-[15px] font-medium leading-tight text-white">
                {group.profile.display_name ?? group.profile.email}
              </div>
              <div className="text-[12px] leading-tight text-white/80">{formatStatusTime(status.created_at)}</div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 pt-0.5 text-white">
            {isVideo && (
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="rounded-full p-1.5 hover:bg-white/10"
                aria-label={muted ? "בטל השתקה" : "השתק"}
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              className="rounded-full p-1.5 hover:bg-white/10"
              aria-label={userPaused ? "המשך" : "השהה"}
            >
              {userPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="rounded-full p-1.5 hover:bg-white/10"
                aria-label="עוד"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {menuOpen && (
                <div className="absolute top-full left-0 mt-1 min-w-[140px] overflow-hidden rounded-md bg-[var(--wa-panel)] py-1 text-sm text-[var(--wa-text)] shadow-lg">
                  {isOwn && (
                    <button
                      type="button"
                      disabled={deleting}
                      className="block w-full px-4 py-2.5 text-right text-[#ea0038] hover:bg-[var(--wa-hover)] disabled:opacity-50"
                      onClick={() => void deleteStatus()}
                    >
                      {deleting ? "מוחק..." : "מחק סטטוס"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="block w-full px-4 py-2.5 text-right hover:bg-[var(--wa-hover)]"
                    onClick={() => {
                      setMenuOpen(false)
                      onClose()
                    }}
                  >
                    סגור
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          className="relative flex min-h-0 flex-1 select-none"
          onPointerDown={() => {
            holdTimer.current = setTimeout(() => setHolding(true), 150)
          }}
          onPointerUp={() => {
            if (holdTimer.current) clearTimeout(holdTimer.current)
            holdTimer.current = null
            setHolding(false)
          }}
          onPointerCancel={() => {
            if (holdTimer.current) clearTimeout(holdTimer.current)
            holdTimer.current = null
            setHolding(false)
          }}
          onPointerLeave={() => {
            if (holdTimer.current) clearTimeout(holdTimer.current)
            holdTimer.current = null
            setHolding(false)
          }}
        >
          {/* Tap zones */}
          <button
            type="button"
            className="absolute inset-y-0 right-0 z-20 w-1/3 cursor-pointer"
            aria-label="הקודם"
            onClick={(e) => {
              e.stopPropagation()
              goPrev()
            }}
          />
          <button
            type="button"
            className="absolute inset-y-0 left-0 z-20 w-1/3 cursor-pointer"
            aria-label="הבא"
            onClick={(e) => {
              e.stopPropagation()
              goNext()
            }}
          />

          {hasMedia && status.media_url && displayMediaUrl ? (
            <>
              {isVideo ? (
                <video
                  ref={videoRef}
                  key={status.id}
                  src={displayMediaUrl}
                  className="h-full w-full object-cover"
                  playsInline
                  autoPlay
                  preload="auto"
                  muted={muted}
                  onLoadedData={() => setMediaLoading(false)}
                  onCanPlay={() => setMediaLoading(false)}
                  onEnded={goNext}
                  onWaiting={() => setMediaLoading(true)}
                  onPlaying={() => setMediaLoading(false)}
                  onError={() => setMediaLoading(false)}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={status.id}
                  src={displayMediaUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onLoad={() => setMediaLoading(false)}
                  onError={() => setMediaLoading(false)}
                />
              )}

              {(bannerLines.length > 0 || caption) && (
                <div className="pointer-events-none absolute inset-x-0 bottom-[18%] z-10 flex flex-col items-center gap-3 px-5">
                  {bannerLines.length > 0 && (
                    <div className="w-[88%] rounded-sm bg-black/70 px-4 py-3 text-center text-white shadow-sm">
                      {bannerLines.map((line, i) => (
                        <div
                          key={i}
                          className={cn(
                            "font-bold leading-snug",
                            i === 0 ? "text-[1.35rem]" : "mt-0.5 text-[1.05rem] font-semibold",
                          )}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                  {caption && (
                    <p className="max-w-[90%] text-center text-[1.25rem] font-bold leading-snug text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                      {caption}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div
              className="flex h-full w-full items-center justify-center px-8 text-center"
              style={{ backgroundColor: status.background_color || "#075E54" }}
            >
              <p className="text-[1.75rem] font-medium leading-relaxed text-white whitespace-pre-wrap">
                {status.content}
              </p>
            </div>
          )}

          {mediaLoading && hasMedia && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
            </div>
          )}
        </div>

        {/* Own status: view replies */}
        {isOwn && (
          <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/70 to-transparent px-3 pb-4 pt-10">
            {deleteError && (
              <div className="mb-2 rounded-lg bg-[#fde8e8] px-3 py-2 text-center text-xs text-[#ea0038]">
                {deleteError}
                <button type="button" className="mr-2 underline" onClick={() => setDeleteError(null)}>
                  סגור
                </button>
              </div>
            )}
            {showReplies ? (
              <div className="max-h-56 overflow-y-auto rounded-xl bg-[#1f2c34]/95 p-3" dir="rtl">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-white">תגובות ({replies.length})</span>
                  <button
                    type="button"
                    onClick={() => setShowReplies(false)}
                    className="rounded-full p-1 text-white/80 hover:bg-white/10"
                    aria-label="סגור תגובות"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {repliesLoading ? (
                  <div className="py-4 text-center text-sm text-white/70">טוען...</div>
                ) : replies.length === 0 ? (
                  <div className="py-4 text-center text-sm text-white/70">אין תגובות עדיין</div>
                ) : (
                  <ul className="space-y-2.5">
                    {replies.map((r) => (
                      <li key={r.id} className="flex items-start gap-2">
                        <Avatar
                          name={r.profile?.display_name}
                          url={r.profile?.avatar_url}
                          size={28}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[#00a884]">
                            {r.profile?.display_name ?? r.profile?.email ?? "משתמש"}
                          </div>
                          <div className="text-sm text-white whitespace-pre-wrap">{r.content}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowReplies(true)
                  void loadReplies(status.id)
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-black/45 px-4 py-3 text-sm text-white transition hover:bg-black/55"
              >
                <MessageCircle className="h-4 w-4" />
                {replies.length > 0 ? `תגובות (${replies.length})` : "אין תגובות עדיין"}
              </button>
            )}
          </div>
        )}

        {/* Reply bar */}
        {!isOwn && (
          <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/70 to-transparent px-3 pb-4 pt-10">
            {replySent ? (
              <div className="rounded-full bg-black/45 px-4 py-3 text-center text-sm text-white">
                התגובה נוספה לסטטוס
              </div>
            ) : (
              <div className="relative flex flex-col gap-2">
                {(replyError || deleteError) && (
                  <div className="rounded-lg bg-[#fde8e8] px-3 py-2 text-center text-xs text-[#ea0038]">
                    {replyError || deleteError}
                    <button
                      type="button"
                      className="mr-2 underline"
                      onClick={() => {
                        setReplyError(null)
                        setDeleteError(null)
                      }}
                    >
                      סגור
                    </button>
                  </div>
                )}
                <div className="relative flex items-center gap-2">
                {showEmoji && (
                  <div className="absolute bottom-full mb-2 grid w-full grid-cols-6 gap-1 rounded-xl bg-[#1f2c34] p-2 shadow-lg">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        className="rounded-lg p-1.5 text-xl hover:bg-white/10"
                        onClick={() => {
                          setReply((t) => t + e)
                          setShowEmoji(false)
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  disabled={!reply.trim() || sending}
                  onClick={() => void sendReply()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
                  aria-label="שלח תגובה"
                >
                  <SendHorizontal className="h-6 w-6 -scale-x-100" />
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-[#1f2c34]/85 px-2 py-1.5 ring-1 ring-white/10">
                  <input
                    value={reply}
                    onChange={(e) => {
                      setReply(e.target.value)
                      if (replyError) setReplyError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void sendReply()
                      }
                    }}
                    placeholder="הגב לסטטוס..."
                    className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[15px] text-white outline-none placeholder:text-white/70"
                    dir="rtl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmoji((s) => !s)}
                    className="rounded-full p-2 text-white/90 hover:bg-white/10"
                    aria-label="אימוג'י"
                  >
                    <Smile className="h-5 w-5" />
                  </button>
                </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
