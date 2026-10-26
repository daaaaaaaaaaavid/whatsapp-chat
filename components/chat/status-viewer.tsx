"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Avatar } from "./avatar"
import { createClient } from "@/lib/supabase/client"
import type { Profile, StatusReply } from "@/lib/types"
import type { StatusGroup } from "@/lib/status-feed"
import { formatStatusTime } from "@/lib/format"
import { resolveMediaDisplayUrl } from "@/lib/media-url"
import { isDriveMediaUrl } from "@/lib/google-drive"
import { useVoiceTyping } from "@/lib/use-voice-typing"
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  MessageCircle,
  Mic,
  MoreVertical,
  Pause,
  Play,
  SendHorizontal,
  Smile,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { notifyStatusOwner } from "@/lib/push-client"
import { useChatMediaDisplay } from "@/lib/use-chat-media"

const IMAGE_DURATION_MS = 5000
const EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "🤔", "😢", "👍", "🙏", "❤️", "🔥", "🎉", "👏", "😮", "🤩", "💯", "✨", "😅"]
const QUICK_REACTIONS = ["😂", "😮", "😢", "🙏", "👏", "🔥"]
const LIKE = "❤️"

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

/** Text statuses stay up long enough to read; short ones still get the image duration. */
function textDurationMs(content: string | null) {
  return Math.min(12_000, Math.max(IMAGE_DURATION_MS, 3_000 + (content?.length ?? 0) * 45))
}

function statusStreamUrl(statusId: string) {
  return `/api/drive/status-media?id=${encodeURIComponent(statusId)}`
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

type StatusViewRow = { viewer_id: string; viewed_at: string; profile?: Profile }

type Props = {
  groups: StatusGroup[]
  groupIndex: number
  index: number
  currentUserId: string
  onNavigate: (groupIndex: number, index: number) => void
  onClose: () => void
  /** Where to start when auto-advancing into the next contact. */
  startIndexFor?: (group: StatusGroup) => number
  onViewed?: (statusId: string) => void
  onStatusDeleted?: (statusId: string) => void
}

export function StatusViewer({
  groups,
  groupIndex,
  index,
  currentUserId,
  onNavigate,
  onClose,
  startIndexFor,
  onViewed,
  onStatusDeleted,
}: Props) {
  const group = groups[groupIndex]
  const status = group?.statuses[index]
  const isOwn = group?.profile.id === currentUserId

  const [progress, setProgress] = useState(0)
  const [userPaused, setUserPaused] = useState(false)
  const [holding, setHolding] = useState(false)
  const [muted, setMuted] = useState(true)
  const [mediaLoading, setMediaLoading] = useState(true)
  const [reply, setReply] = useState("")
  const [inputFocused, setInputFocused] = useState(false)
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set())
  const [replies, setReplies] = useState<StatusReply[]>([])
  const [views, setViews] = useState<StatusViewRow[]>([])
  const [sheet, setSheet] = useState<"views" | "replies" | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [captionExpanded, setCaptionExpanded] = useState(false)

  const [mediaMissing, setMediaMissing] = useState(false)
  const hasMedia = Boolean(status?.media_url)
  const isVideo = hasMedia && status?.media_url ? isVideoUrl(status.media_url) : false
  const driveMedia = Boolean(status?.media_url && isDriveMediaUrl(status.media_url))
  const storedMedia = useChatMediaDisplay(driveMedia ? null : status?.media_url)
  const displayMediaUrl =
    driveMedia && status && !mediaMissing ? statusStreamUrl(status.id) : storedMedia.url
  const progressRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Set when a press became a hold, so the click that ends it does not also navigate. */
  const heldRef = useRef(false)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const advancingRef = useRef(false)
  const replyRef = useRef("")
  replyRef.current = reply
  const sendReplyRef = useRef<(text?: string) => Promise<void>>(async () => {})

  const voice = useVoiceTyping({
    getText: () => replyRef.current,
    setText: (next) => {
      replyRef.current = next
      setReply(next)
    },
    send: (text) => void sendReplyRef.current(text),
  })

  const paused =
    userPaused ||
    holding ||
    inputFocused ||
    Boolean(reply.trim()) ||
    showEmoji ||
    menuOpen ||
    sheet !== null ||
    Boolean(replyError) ||
    voice.listening

  useEffect(() => {
    progressRef.current = 0
    advancingRef.current = false
    setProgress(0)
    setUserPaused(false)
    setHolding(false)
    setMediaLoading(Boolean(status?.media_url))
    setMediaMissing(false)
    setReply("")
    setShowEmoji(false)
    setMenuOpen(false)
    setNotice(null)
    setReplyError(null)
    setDeleteError(null)
    setSheet(null)
    setReplies([])
    setViews([])
    setCaptionExpanded(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset per slide only
  }, [status?.id])

  useEffect(() => {
    if (!status || status.user_id === currentUserId) return
    onViewed?.(status.id)
    const supabase = createClient()
    void supabase
      .from("status_views")
      .upsert({ status_id: status.id, viewer_id: currentUserId }, { onConflict: "status_id,viewer_id" })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per slide
  }, [status?.id, currentUserId])

  const loadActivity = useCallback(async (statusId: string) => {
    setActivityLoading(true)
    try {
      const supabase = createClient()
      const [{ data: replyRows }, { data: viewRows }] = await Promise.all([
        supabase.from("status_replies").select("*").eq("status_id", statusId).order("created_at", { ascending: true }),
        supabase
          .from("status_views")
          .select("viewer_id, viewed_at")
          .eq("status_id", statusId)
          .order("viewed_at", { ascending: false }),
      ])
      const uids = Array.from(
        new Set([...(replyRows ?? []).map((r) => r.user_id), ...(viewRows ?? []).map((v) => v.viewer_id)]),
      )
      const { data: profiles } = uids.length
        ? await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, about, last_seen, created_at")
            .in("id", uids)
        : { data: [] as Profile[] }
      const pmap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]))
      setReplies((replyRows ?? []).map((r) => ({ ...r, profile: pmap.get(r.user_id) })) as StatusReply[])
      setViews((viewRows ?? []).map((v) => ({ ...v, profile: pmap.get(v.viewer_id) })))
    } finally {
      setActivityLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!status || !isOwn) return
    void loadActivity(status.id)
    const supabase = createClient()
    const channel = supabase
      .channel(`status-replies-${status.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "status_replies", filter: `status_id=eq.${status.id}` },
        () => void loadActivity(status.id),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per slide
  }, [status?.id, isOwn, loadActivity])

  const nextTarget = useCallback((): [number, number] | null => {
    if (!group) return null
    if (index < group.statuses.length - 1) return [groupIndex, index + 1]
    if (groupIndex < groups.length - 1) {
      const next = groups[groupIndex + 1]
      return [groupIndex + 1, startIndexFor ? startIndexFor(next) : 0]
    }
    return null
  }, [group, index, groupIndex, groups, startIndexFor])

  const goNext = useCallback(() => {
    if (advancingRef.current) return
    advancingRef.current = true
    const target = nextTarget()
    if (target) onNavigate(target[0], target[1])
    else onClose()
  }, [nextTarget, onNavigate, onClose])

  const goPrev = useCallback(() => {
    advancingRef.current = false
    if (index > 0) {
      onNavigate(groupIndex, index - 1)
      return
    }
    if (groupIndex > 0) {
      const prev = groups[groupIndex - 1]
      onNavigate(groupIndex - 1, prev.statuses.length - 1)
      return
    }
    progressRef.current = 0
    setProgress(0)
    const v = videoRef.current
    if (v) v.currentTime = 0
  }, [index, groupIndex, groups, onNavigate])

  // Warm the next image so the following slide appears instantly.
  useEffect(() => {
    const target = nextTarget()
    if (!target) return
    const next = groups[target[0]]?.statuses[target[1]]
    if (!next?.media_url || isVideoUrl(next.media_url)) return
    if (isDriveMediaUrl(next.media_url)) {
      const img = new Image()
      img.src = statusStreamUrl(next.id)
      return
    }
    let cancelled = false
    void resolveMediaDisplayUrl(createClient(), next.media_url).then((url) => {
      if (cancelled || !url) return
      const img = new Image()
      img.src = url
    })
    return () => {
      cancelled = true
    }
  }, [nextTarget, groups])

  const slideDuration = hasMedia ? IMAGE_DURATION_MS : textDurationMs(status?.content ?? null)

  // Images / text only — never runs while a video slide is active.
  useEffect(() => {
    if (!status || paused || isVideo) return
    if (hasMedia && mediaLoading) return
    let cancelled = false
    let raf = 0
    const startedAt = performance.now() - progressRef.current * slideDuration
    const tick = (now: number) => {
      if (cancelled) return
      if (videoRef.current) return
      const p = Math.min(1, (now - startedAt) / slideDuration)
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
  }, [status?.id, paused, isVideo, hasMedia, mediaLoading, goNext, slideDuration, status])

  // Videos: progress + advance come only from the <video> element duration.
  useEffect(() => {
    if (!status || !isVideo || paused) return
    let cancelled = false
    let raf = 0
    let lastBgPaint = 0
    const tick = (now: number) => {
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
        if (now - lastBgPaint > 1200 && v.readyState >= 2) {
          lastBgPaint = now
          paintBackdrop(v)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paintBackdrop is stable
  }, [status?.id, isVideo, paused, goNext])

  /** Drawing a cross-origin frame taints the canvas, which is fine: it is only displayed, never read. */
  function paintBackdrop(v: HTMLVideoElement) {
    const canvas = bgCanvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    try {
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sheet) setSheet(null)
        else if (showEmoji) setShowEmoji(false)
        else if (menuOpen) setMenuOpen(false)
        else onClose()
        return
      }
      if (isTypingTarget(e.target)) return
      if (e.key === "ArrowLeft") goNext()
      if (e.key === "ArrowRight") goPrev()
      if (e.key === " ") {
        e.preventDefault()
        setUserPaused((p) => !p)
      }
      if (e.key === "m" || e.key === "M") setMuted((m) => !m)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goNext, goPrev, onClose, sheet, showEmoji, menuOpen])

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

  const flash = (text: string) => {
    setNotice(text)
    window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 1600)
  }

  const sendReply = async (override?: string) => {
    const trimmed = (override ?? reply).trim()
    if (!trimmed || sending || isOwn || !status) return
    setSending(true)
    setReplyError(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("status_replies")
        .insert({ status_id: status.id, user_id: currentUserId, content: trimmed })
        .select("id")
        .single()
      if (error) {
        setReplyError(error.message || "שליחת התגובה נכשלה")
        return
      }
      if (data?.id) notifyStatusOwner({ statusId: status.id, replyId: data.id })
      if (override === undefined || override === reply) setReply("")
      setShowEmoji(false)
      if (trimmed === LIKE) {
        setLikedIds((prev) => new Set(prev).add(status.id))
        flash("סימנת לייק לסטטוס")
      } else {
        flash("התגובה נשלחה")
      }
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "שליחת התגובה נכשלה")
    } finally {
      setSending(false)
    }
  }
  sendReplyRef.current = sendReply

  const deleteStatus = async () => {
    if (!status || !isOwn || deleting) return
    setDeleting(true)
    setDeleteError(null)
    setMenuOpen(false)
    try {
      const res = await fetch(statusStreamUrl(status.id), { method: "DELETE" })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        setDeleteError(body?.message || "מחיקת הסטטוס נכשלה")
        return
      }
      onStatusDeleted?.(status.id)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "מחיקת הסטטוס נכשלה")
    } finally {
      setDeleting(false)
    }
  }

  const endHold = (e?: ReactPointerEvent) => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
    setHolding(false)
    const start = pointerStart.current
    pointerStart.current = null
    if (e && start && e.clientY - start.y > 90 && Math.abs(e.clientX - start.x) < 80) onClose()
  }

  if (!group || !status) return null

  const canPrev = index > 0 || groupIndex > 0
  const canNext = nextTarget() !== null
  const liked = likedIds.has(status.id)
  const caption = hasMedia ? status.content?.trim() : null
  const bgColor = status.background_color || "#075E54"

  return (
    <div
      className="fixed inset-0 z-[60] overflow-hidden bg-[#0b141a] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="צפייה בסטטוס"
      dir="rtl"
    >
      {/* Blurred backdrop of the current slide */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {hasMedia && !isVideo && displayMediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={status.id}
            src={displayMediaUrl}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-70 blur-3xl"
          />
        ) : isVideo ? (
          <canvas
            key={status.id}
            ref={bgCanvasRef}
            width={36}
            height={64}
            className="h-full w-full scale-125 object-cover opacity-70 blur-3xl"
          />
        ) : (
          <div className="h-full w-full opacity-60" style={{ backgroundColor: bgColor }} />
        )}
        <div className="absolute inset-0 bg-black/30" />
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10"
        aria-label="סגירה"
      >
        <X className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition hover:bg-white/10"
        aria-label="חזרה לרשימה"
      >
        <ArrowRight className="h-6 w-6" />
      </button>

      <button
        type="button"
        onClick={goNext}
        className={cn(
          "absolute left-5 top-1/2 z-40 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-md backdrop-blur transition hover:bg-black/60 md:flex",
          !canNext && "opacity-60",
        )}
        aria-label="הבא"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={goPrev}
        className={cn(
          "absolute right-5 top-1/2 z-40 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-md backdrop-blur transition hover:bg-black/60 md:flex",
          !canPrev && "pointer-events-none opacity-0",
        )}
        aria-label="הקודם"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* 9:16 story column */}
      <div className="relative mx-auto flex h-full w-full max-w-[min(100vw,calc((100svh-0.75rem)*9/16))] flex-col pt-2.5">
        <div className="relative z-30 flex gap-1 px-1">
          {group.statuses.map((s, i) => (
            <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: i < index ? "100%" : i > index ? "0%" : `${progress * 100}%` }}
              />
            </div>
          ))}
        </div>

        <div className="relative mt-1.5 min-h-0 flex-1 overflow-hidden rounded-t-lg bg-black shadow-2xl">
          {/* Header */}
          <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 pb-10 pt-3">
            <Avatar name={group.profile.display_name} url={group.profile.avatar_url} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium leading-tight">
                {isOwn ? "הסטטוס שלי" : (group.profile.display_name ?? group.profile.email)}
              </div>
              <div className="text-[12px] leading-tight text-white/80">{formatStatusTime(status.created_at)}</div>
            </div>
            <div className="flex shrink-0 items-center" dir="ltr">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="rounded-full p-1.5 hover:bg-white/10"
                  aria-label="אפשרויות"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
                {menuOpen && (
                  <div
                    className="wa-menu absolute left-0 top-full z-40 mt-1 min-w-[160px] py-1 text-sm text-[var(--wa-text)]"
                    dir="rtl"
                  >
                    {isOwn && (
                      <button
                        type="button"
                        disabled={deleting}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-right text-[#ea0038] hover:bg-[var(--wa-hover)] disabled:opacity-50"
                        onClick={() => void deleteStatus()}
                      >
                        <Trash2 className="h-4 w-4" />
                        {deleting ? "מוחק..." : "מחיקת הסטטוס"}
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
                      סגירה
                    </button>
                  </div>
                )}
              </div>
              {isVideo && (
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="rounded-full p-1.5 hover:bg-white/10"
                  aria-label={muted ? "ביטול השתקה" : "השתקה"}
                  title="M"
                >
                  {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => setUserPaused((p) => !p)}
                className="rounded-full p-1.5 hover:bg-white/10"
                aria-label={paused ? "המשך" : "השהיה"}
                title="רווח"
              >
                {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Content */}
          <div
            className="relative flex h-full w-full select-none"
            onPointerDown={(e) => {
              pointerStart.current = { x: e.clientX, y: e.clientY }
              heldRef.current = false
              holdTimer.current = setTimeout(() => {
                heldRef.current = true
                setHolding(true)
              }, 180)
            }}
            onPointerUp={endHold}
            onPointerCancel={() => endHold()}
            onPointerLeave={() => endHold()}
          >
            <button
              type="button"
              className="absolute inset-y-0 left-0 z-20 w-1/3 cursor-pointer"
              aria-label="הבא"
              onClick={(e) => {
                e.stopPropagation()
                if (!heldRef.current) goNext()
              }}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 z-20 w-1/3 cursor-pointer"
              aria-label="הקודם"
              onClick={(e) => {
                e.stopPropagation()
                if (!heldRef.current) goPrev()
              }}
            />

            {hasMedia && mediaMissing ? (
              <div className="flex h-full w-full items-center justify-center bg-[#0b141a] px-8 text-center">
                <p className="text-base text-white/80">הקובץ נמחק ולא ניתן לצפות בו</p>
              </div>
            ) : hasMedia && displayMediaUrl ? (
              isVideo ? (
                <video
                  ref={videoRef}
                  key={status.id}
                  src={displayMediaUrl}
                  className="h-full w-full object-contain"
                  playsInline
                  autoPlay
                  preload="auto"
                  muted={muted}
                  onLoadedData={(e) => {
                    setMediaLoading(false)
                    paintBackdrop(e.currentTarget)
                  }}
                  onCanPlay={() => setMediaLoading(false)}
                  onEnded={goNext}
                  onWaiting={() => setMediaLoading(true)}
                  onPlaying={() => setMediaLoading(false)}
                  onError={() => {
                    setMediaLoading(false)
                    if (driveMedia) setMediaMissing(true)
                  }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={status.id}
                  src={displayMediaUrl}
                  alt=""
                  className="wa-fade-in h-full w-full object-contain"
                  onLoad={() => setMediaLoading(false)}
                  onError={() => {
                    setMediaLoading(false)
                    if (driveMedia) setMediaMissing(true)
                  }}
                />
              )
            ) : !hasMedia ? (
              <div
                className="flex h-full w-full items-center justify-center px-8 text-center"
                style={{ backgroundColor: bgColor }}
              >
                <p
                  className={cn(
                    "whitespace-pre-wrap font-medium leading-snug text-white",
                    (status.content?.length ?? 0) < 60
                      ? "text-[1.9rem]"
                      : (status.content?.length ?? 0) < 200
                        ? "text-[1.45rem]"
                        : "text-[1.1rem]",
                  )}
                >
                  {status.content}
                </p>
              </div>
            ) : null}

            {mediaLoading && hasMedia && !mediaMissing && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
              </div>
            )}

            {holding && (
              <div className="pointer-events-none absolute inset-0 z-10 bg-black/10" />
            )}
          </div>

          {caption && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-5 pb-[4.5rem] pt-16">
              <button
                type="button"
                onClick={() => setCaptionExpanded((v) => !v)}
                className={cn(
                  "pointer-events-auto mx-auto block max-w-full whitespace-pre-wrap text-center text-[15px] leading-relaxed text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]",
                  !captionExpanded && "line-clamp-3",
                )}
              >
                {caption}
              </button>
            </div>
          )}

          {/* Own status: views + replies sheet */}
          {isOwn && sheet && (
            <div className="absolute inset-x-0 bottom-0 z-40 flex max-h-[60%] flex-col rounded-t-2xl bg-[var(--wa-panel)] text-[var(--wa-text)] shadow-2xl">
              <div className="flex items-center gap-1 border-b border-[var(--wa-border)] px-2 pt-2">
                {(
                  [
                    ["views", `צפו (${views.length})`],
                    ["replies", `תגובות (${replies.length})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSheet(id)}
                    className={cn(
                      "flex-1 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition",
                      sheet === id
                        ? "border-[#00a884] text-[var(--wa-teal-dark)]"
                        : "border-transparent text-[var(--wa-text-secondary)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSheet(null)}
                  className="mb-1 rounded-full p-1.5 text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)]"
                  aria-label="סגירה"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="wa-scroll min-h-0 flex-1 overflow-y-auto py-1">
                {activityLoading && views.length === 0 && replies.length === 0 ? (
                  <div className="py-6 text-center text-sm text-[var(--wa-text-secondary)]">טוען...</div>
                ) : sheet === "views" ? (
                  views.length === 0 ? (
                    <div className="py-6 text-center text-sm text-[var(--wa-text-secondary)]">אף אחד עוד לא צפה</div>
                  ) : (
                    views.map((v) => (
                      <div key={v.viewer_id} className="flex items-center gap-3 px-4 py-2">
                        <Avatar name={v.profile?.display_name} url={v.profile?.avatar_url} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{v.profile?.display_name ?? v.profile?.email ?? "משתמש"}</div>
                          <div className="text-xs text-[var(--wa-text-secondary)]">{formatStatusTime(v.viewed_at)}</div>
                        </div>
                        {replies.some((r) => r.user_id === v.viewer_id && r.content === LIKE) && (
                          <Heart className="h-4 w-4 fill-[#ea0038] text-[#ea0038]" />
                        )}
                      </div>
                    ))
                  )
                ) : replies.length === 0 ? (
                  <div className="py-6 text-center text-sm text-[var(--wa-text-secondary)]">אין תגובות עדיין</div>
                ) : (
                  replies.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 px-4 py-2">
                      <Avatar name={r.profile?.display_name} url={r.profile?.avatar_url} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium text-[var(--wa-teal-dark)]">
                            {r.profile?.display_name ?? r.profile?.email ?? "משתמש"}
                          </span>
                          <span className="shrink-0 text-[11px] text-[var(--wa-text-secondary)]">
                            {formatStatusTime(r.created_at)}
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap text-sm">{r.content}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="absolute inset-x-0 bottom-3 z-40 flex flex-col items-center gap-2 px-3">
        {(notice || replyError || deleteError || voice.error) && (
          <div
            className={cn(
              "wa-fade-in rounded-full px-4 py-1.5 text-center text-xs shadow",
              notice ? "bg-black/60 text-white" : "bg-[#fde8e8] text-[#ea0038]",
            )}
          >
            {notice || replyError || deleteError || voice.error}
            {!notice && (
              <button
                type="button"
                className="mr-2 underline"
                onClick={() => {
                  setReplyError(null)
                  setDeleteError(null)
                  voice.clearError()
                }}
              >
                סגירה
              </button>
            )}
          </div>
        )}

        {isOwn ? (
          !sheet && (
            <button
              type="button"
              onClick={() => {
                setSheet("views")
                void loadActivity(status.id)
              }}
              className="flex items-center gap-4 rounded-full bg-black/50 px-5 py-2.5 text-sm backdrop-blur transition hover:bg-black/65"
            >
              <span className="flex items-center gap-1.5">
                <Eye className="h-4 w-4" />
                {views.length}
              </span>
              <span className="flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" />
                {replies.length}
              </span>
            </button>
          )
        ) : (
          <div className="relative w-full max-w-[560px]">
            {showEmoji && (
              <div className="wa-fade-in absolute bottom-full right-0 mb-2 grid w-full max-w-[340px] grid-cols-6 gap-1 rounded-2xl bg-[#1f2c34]/95 p-2 shadow-xl backdrop-blur">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="rounded-lg p-1.5 text-xl transition hover:scale-110 hover:bg-white/10"
                    onClick={() => setReply((t) => t + e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            {inputFocused && !reply.trim() && !showEmoji && (
              <div className="wa-fade-in absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 gap-1 rounded-full bg-black/55 px-2 py-1 backdrop-blur">
                {QUICK_REACTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onPointerDown={(ev) => ev.preventDefault()}
                    onClick={() => void sendReply(e)}
                    className="rounded-full p-1.5 text-2xl transition hover:scale-125"
                    aria-label={`תגובה ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEmoji((s) => !s)}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10",
                  showEmoji && "bg-white/15",
                )}
                aria-label="אימוג'י"
              >
                <Smile className="h-6 w-6" />
              </button>

              <div className="flex h-11 min-w-0 flex-1 items-center gap-1 rounded-full bg-[var(--wa-panel)] pr-4 pl-1 text-[var(--wa-text)] shadow-lg">
                <input
                  value={reply}
                  onChange={(e) => {
                    setReply(e.target.value)
                    if (replyError) setReplyError(null)
                  }}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void sendReply()
                    }
                  }}
                  placeholder="כאן מקלידים תגובה..."
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--wa-text-secondary)]"
                  dir="rtl"
                />
                {reply.trim() ? (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void sendReply()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition hover:bg-[#06cf9c] disabled:opacity-50"
                    aria-label="שליחת תגובה"
                  >
                    <SendHorizontal className="h-4.5 w-4.5 -scale-x-100" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={voice.toggle}
                    className={cn(
                      "wa-voice-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
                      voice.listening
                        ? "wa-voice-live"
                        : "bg-[#e7f0fe] text-[#1a73e8] hover:bg-[#d6e6fd] dark:bg-[#1a73e8]/20",
                    )}
                    aria-label={voice.listening ? "עצירת הקלדה קולית" : "תגובה בקול"}
                    aria-pressed={voice.listening}
                    title={voice.listening ? "מקשיב… לחצו לעצירה" : "תגובה בקול"}
                  >
                    <Mic className="h-4.5 w-4.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={sending || liked}
                onClick={() => void sendReply(LIKE)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10 disabled:cursor-default"
                aria-label={liked ? "סימנת לייק" : "לייק"}
                aria-pressed={liked}
              >
                <Heart
                  className={cn("h-6 w-6 transition", liked && "scale-110 fill-[#ea0038] text-[#ea0038]")}
                />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
