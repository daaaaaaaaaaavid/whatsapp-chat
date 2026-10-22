"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Avatar } from "./avatar"
import { createClient } from "@/lib/supabase/client"
import { fetchContacts } from "@/lib/chat-actions"
import { isAllowedMediaFile, resolveFileMime, UNSUPPORTED_MEDIA_MESSAGE } from "@/lib/media-mime"
import { mediaReferenceUrl } from "@/lib/media-url"
import type { Profile, StatusAudienceMode } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Lock,
  Palette,
  Plus,
  SendHorizontal,
  Smile,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react"

export const STATUS_BG_COLORS = [
  "#075E54",
  "#00a884",
  "#5b6cff",
  "#e542a3",
  "#f5b800",
  "#0088cc",
  "#d9534f",
  "#845ec2",
  "#54656f",
]
const MAX_MEDIA_BYTES = 50 * 1024 * 1024
const MAX_TEXT_LENGTH = 700
const AUDIENCE_STORAGE_KEY = "whachat-status-audience"
const QUICK_EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "🤔", "😢", "👍", "🙏", "❤️", "🔥", "🎉", "✨", "💯", "🌸", "☀️"]

export type StatusMediaDraft = { id: string; file: File; preview: string; caption: string }

export function audienceLabel(mode: StatusAudienceMode, selectedCount: number) {
  if (mode === "contacts_except") {
    return selectedCount ? `אנשי הקשר, חוץ מ־${selectedCount}` : "כל אנשי הקשר"
  }
  if (mode === "selected_contacts") {
    return selectedCount ? `רק ${selectedCount} אנשי קשר` : "אף אחד"
  }
  return "כל אנשי הקשר"
}

export function useStatusAudience(userId: string) {
  const [mode, setMode] = useState<StatusAudienceMode>("contacts")
  const [userIds, setUserIds] = useState<string[]>([])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${AUDIENCE_STORAGE_KEY}:${userId}`) ?? "null") as {
        mode?: StatusAudienceMode
        userIds?: string[]
      } | null
      if (saved?.mode === "contacts" || saved?.mode === "contacts_except" || saved?.mode === "selected_contacts") {
        setMode(saved.mode)
        setUserIds(Array.isArray(saved.userIds) ? saved.userIds : [])
      }
    } catch {
      setMode("contacts")
      setUserIds([])
    }
  }, [userId])

  const save = useCallback(
    (nextMode: StatusAudienceMode, nextIds: string[]) => {
      setMode(nextMode)
      setUserIds(nextIds)
      localStorage.setItem(`${AUDIENCE_STORAGE_KEY}:${userId}`, JSON.stringify({ mode: nextMode, userIds: nextIds }))
    },
    [userId],
  )

  return { mode, userIds, save, label: audienceLabel(mode, userIds.length) }
}

export type StatusAudience = ReturnType<typeof useStatusAudience>

/** Validates a picked file; returns an error message or null. */
export function statusMediaError(file: File): string | null {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return "ניתן להעלות רק תמונות או סרטונים"
  if (!isAllowedMediaFile(file)) return UNSUPPORTED_MEDIA_MESSAGE
  if (file.size > MAX_MEDIA_BYTES) return "הקובץ גדול מדי (מקסימום 50MB)"
  return null
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/3gpp": "3gp",
  "video/x-matroska": "mkv",
}

export async function postStatus(opts: {
  userId: string
  text: string
  backgroundColor: string
  mediaFile: File | null
  audience: Pick<StatusAudience, "mode" | "userIds">
}) {
  const supabase = createClient()
  let mediaUrl: string | null = null

  if (opts.mediaFile) {
    const file = opts.mediaFile
    const mime = resolveFileMime(file)
    const isVideoFile = mime.startsWith("video/") || file.type.startsWith("video/")
    const namedExt = file.name.split(".").pop()?.toLowerCase()
    const ext =
      MIME_EXT[mime] ||
      (namedExt && /^[a-z0-9]{2,5}$/.test(namedExt) ? namedExt : null) ||
      (isVideoFile ? "mp4" : "jpg")
    const path = `${opts.userId}/status/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from("media").upload(path, file, { contentType: mime })
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes("bucket") || msg.includes("not found")) {
        throw new Error("חסר bucket בשם media ב־Supabase. הרץ את migration-media-storage.sql")
      }
      if (msg.includes("policy") || msg.includes("row-level") || msg.includes("security")) {
        throw new Error("אין הרשאה להעלות. הרץ את migration-media-storage.sql ב־Supabase")
      }
      throw new Error(error.message)
    }
    // Client-only hash so the viewer classifies media without relying on extension alone.
    mediaUrl = `${mediaReferenceUrl(supabase, path)}#whachat=${isVideoFile ? "video" : "image"}`
  }

  const { error } = await supabase.from("statuses").insert({
    user_id: opts.userId,
    content: opts.text.trim() || null,
    background_color: opts.mediaFile ? "#000000" : opts.backgroundColor,
    media_url: mediaUrl,
    audience_mode: opts.audience.mode,
    audience_user_ids: opts.audience.mode === "contacts" ? [] : opts.audience.userIds,
  })
  if (error) {
    const message = error.message.toLowerCase()
    throw new Error(
      message.includes("audience_mode") || message.includes("audience_user_ids")
        ? "יש להריץ את supabase/migration-status-privacy-12h.sql ב־Supabase לפני פרסום סטטוס"
        : error.message,
    )
  }
}

function textSizeClass(length: number) {
  if (length < 40) return "text-[2.6rem] leading-tight"
  if (length < 120) return "text-[2rem] leading-snug"
  if (length < 300) return "text-[1.5rem] leading-snug"
  return "text-[1.15rem] leading-relaxed"
}

function AudienceChip({ label, onClick, dark }: { label: string; onClick: () => void; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex max-w-[60%] items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition",
        dark ? "bg-black/35 text-white hover:bg-black/50" : "bg-black/20 text-white hover:bg-black/30",
      )}
    >
      <Lock className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      <ChevronLeft className="h-3.5 w-3.5 shrink-0 opacity-80" />
    </button>
  )
}

function SendButton({ disabled, busy, onClick }: { disabled: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-lg transition hover:bg-[#06cf9c] disabled:opacity-50"
      aria-label="פרסום סטטוס"
    >
      {busy ? (
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : (
        <SendHorizontal className="h-6 w-6 -scale-x-100" />
      )}
    </button>
  )
}

export function TextStatusComposer({
  userId,
  audience,
  onOpenPrivacy,
  onClose,
  onPosted,
}: {
  userId: string
  audience: StatusAudience
  onOpenPrivacy: () => void
  onClose: () => void
  onPosted: () => void
}) {
  const [text, setText] = useState("")
  const [bgColor, setBgColor] = useState(STATUS_BG_COLORS[0])
  const [showEmoji, setShowEmoji] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const post = async () => {
    if (!text.trim() || posting) return
    setPosting(true)
    setError(null)
    try {
      await postStatus({ userId, text, backgroundColor: bgColor, mediaFile: null, audience })
      onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפרסום נכשל")
    } finally {
      setPosting(false)
    }
  }

  const cycleColor = () => {
    const i = STATUS_BG_COLORS.indexOf(bgColor)
    setBgColor(STATUS_BG_COLORS[(i + 1) % STATUS_BG_COLORS.length])
  }

  return (
    <div
      className="wa-fade-in relative flex h-full w-full flex-col text-white transition-colors duration-300"
      style={{ backgroundColor: bgColor }}
      dir="rtl"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
          aria-label="סגירה"
        >
          <X className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
              aria-label="אימוג'י"
            >
              <Smile className="h-6 w-6" />
            </button>
            {showEmoji && (
              <div className="absolute left-0 top-12 z-10 grid w-60 grid-cols-6 gap-1 rounded-2xl bg-black/60 p-2 backdrop-blur">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="rounded-lg p-1 text-xl hover:bg-white/15"
                    onClick={() => {
                      setText((t) => (t + emoji).slice(0, MAX_TEXT_LENGTH))
                      setShowEmoji(false)
                      textRef.current?.focus()
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={cycleColor}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
            aria-label="החלפת צבע רקע"
            title="החלפת צבע רקע"
          >
            <Palette className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-8">
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void post()
            }
          }}
          autoFocus
          placeholder="הקלידו סטטוס"
          rows={Math.min(8, Math.max(1, text.split("\n").length))}
          className={cn(
            "max-h-full w-full max-w-2xl resize-none bg-transparent text-center font-medium text-white outline-none placeholder:text-white/60",
            textSizeClass(text.length),
          )}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-4 pb-3">
        {STATUS_BG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setBgColor(c)}
            style={{ backgroundColor: c }}
            className={cn(
              "h-7 w-7 rounded-full ring-2 ring-white/40 transition hover:scale-110",
              bgColor === c && "scale-110 ring-[3px] ring-white",
            )}
            aria-label="צבע רקע"
          />
        ))}
      </div>

      {error && <div className="mx-4 mb-2 rounded-lg bg-black/40 px-3 py-2 text-center text-sm">{error}</div>}

      <div className="flex items-center justify-between gap-3 bg-black/15 px-5 py-4">
        <AudienceChip label={audience.label} onClick={onOpenPrivacy} />
        <span className="text-xs text-white/70">
          {text.length > MAX_TEXT_LENGTH - 100 ? `${text.length}/${MAX_TEXT_LENGTH}` : "Ctrl+Enter לפרסום"}
        </span>
        <SendButton disabled={!text.trim()} busy={posting} onClick={() => void post()} />
      </div>
    </div>
  )
}

function DraftPreview({ draft }: { draft: StatusMediaDraft }) {
  if (draft.file.type.startsWith("video/")) {
    return (
      <video
        key={draft.id}
        src={draft.preview}
        className="max-h-full max-w-full rounded-md object-contain"
        controls
        playsInline
        autoPlay
        muted
      />
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={draft.id} src={draft.preview} alt="" className="max-h-full max-w-full rounded-md object-contain" />
}

export function MediaStatusComposer({
  userId,
  drafts,
  audience,
  onDraftsChange,
  onAddMore,
  onOpenPrivacy,
  onClose,
  onPosted,
}: {
  userId: string
  drafts: StatusMediaDraft[]
  audience: StatusAudience
  onDraftsChange: (next: StatusMediaDraft[]) => void
  onAddMore: () => void
  onOpenPrivacy: () => void
  onClose: () => void
  onPosted: () => void
}) {
  const [selected, setSelected] = useState(0)
  const [posting, setPosting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedIndex = Math.max(0, Math.min(selected, drafts.length - 1))
  const current = drafts[selectedIndex]

  if (!current) return null

  const updateCaption = (caption: string) => {
    onDraftsChange(drafts.map((d) => (d.id === current.id ? { ...d, caption } : d)))
  }

  const removeDraft = (id: string) => {
    const draft = drafts.find((d) => d.id === id)
    if (draft) URL.revokeObjectURL(draft.preview)
    const next = drafts.filter((d) => d.id !== id)
    if (next.length === 0) onClose()
    else onDraftsChange(next)
  }

  const post = async () => {
    if (posting) return
    setPosting(true)
    setError(null)
    let remaining = drafts
    try {
      for (let i = 0; i < drafts.length; i++) {
        setProgress({ done: i, total: drafts.length })
        const draft = drafts[i]
        await postStatus({
          userId,
          text: draft.caption,
          backgroundColor: "#000000",
          mediaFile: draft.file,
          audience,
        })
        URL.revokeObjectURL(draft.preview)
        remaining = remaining.filter((d) => d.id !== draft.id)
      }
      onPosted()
    } catch (err) {
      onDraftsChange(remaining)
      setError(err instanceof Error ? err.message : "הפרסום נכשל")
    } finally {
      setPosting(false)
      setProgress(null)
    }
  }

  return (
    <div className="wa-fade-in relative flex h-full w-full flex-col bg-[#0b141a] text-white" dir="rtl">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
          aria-label="סגירה"
        >
          <X className="h-6 w-6" />
        </button>
        <span className="text-sm text-white/70">
          {drafts.length > 1 ? `${selectedIndex + 1} מתוך ${drafts.length}` : current.file.name}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-3">
        <DraftPreview draft={current} />
      </div>

      <div className="mx-auto w-full max-w-2xl px-4">
        <input
          value={current.caption}
          onChange={(e) => updateCaption(e.target.value.slice(0, MAX_TEXT_LENGTH))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void post()
            }
          }}
          placeholder="הוספת כיתוב"
          className="w-full rounded-xl bg-white/10 px-4 py-3 text-[15px] text-white outline-none ring-1 ring-white/10 placeholder:text-white/50 focus:ring-[#00a884]"
          dir="rtl"
        />
      </div>

      {error && <div className="mx-auto mt-2 max-w-2xl rounded-lg bg-[#ea0038]/20 px-3 py-2 text-center text-sm">{error}</div>}

      <div className="mt-3 flex items-center gap-3 border-t border-white/10 px-5 py-4">
        <AudienceChip label={audience.label} onClick={onOpenPrivacy} dark />
        <div className="wa-scroll flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto py-1">
          {drafts.map((d, i) => (
            <div key={d.id} className="group relative shrink-0">
              <button
                type="button"
                onClick={() => setSelected(i)}
                className={cn(
                  "h-12 w-12 overflow-hidden rounded-lg ring-2 transition",
                  i === selectedIndex ? "ring-[#00a884]" : "ring-transparent opacity-70 hover:opacity-100",
                )}
              >
                {d.file.type.startsWith("video/") ? (
                  <video src={d.preview} className="h-full w-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.preview} alt="" className="h-full w-full object-cover" />
                )}
              </button>
              <button
                type="button"
                onClick={() => removeDraft(d.id)}
                className="absolute -left-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-black/80 group-hover:flex"
                aria-label="הסרה"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onAddMore}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/40 text-white/80 hover:bg-white/10"
            aria-label="הוספת עוד"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-1">
          <SendButton disabled={drafts.length === 0} busy={posting} onClick={() => void post()} />
          {progress && progress.total > 1 && (
            <span className="text-[11px] text-white/70">
              {progress.done + 1}/{progress.total}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const AUDIENCE_OPTIONS: Array<{ mode: StatusAudienceMode; label: string; detail: string; icon: typeof Users }> = [
  { mode: "contacts", label: "כל אנשי הקשר", detail: "כל אנשי הקשר שלך ב־WhaChat", icon: Users },
  { mode: "contacts_except", label: "אנשי הקשר חוץ מ...", detail: "בחירת אנשים להסתרה", icon: UserMinus },
  { mode: "selected_contacts", label: "שיתוף רק עם...", detail: "בחירת מי יוכל לראות", icon: UserCheck },
]

export function StatusPrivacyPane({
  userId,
  audience,
  onBack,
}: {
  userId: string
  audience: StatusAudience
  onBack: () => void
}) {
  const [contacts, setContacts] = useState<Profile[]>([])
  const [contactsError, setContactsError] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    let cancelled = false
    void fetchContacts(userId).then((res) => {
      if (cancelled) return
      setContacts(res.users)
      setContactsError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const toggleContact = (id: string) => {
    const next = audience.userIds.includes(id)
      ? audience.userIds.filter((x) => x !== id)
      : [...audience.userIds, id]
    audience.save(audience.mode, next)
  }

  const q = query.trim().toLowerCase()
  const filtered = q
    ? contacts.filter((c) => `${c.display_name ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q))
    : contacts

  return (
    <div className="wa-fade-in flex h-full w-full flex-col bg-[var(--wa-panel)]" dir="rtl">
      <header className="wa-chrome flex h-16 shrink-0 items-center gap-3 px-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)]"
          aria-label="חזרה"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <div>
          <div className="font-medium text-[var(--wa-text)]">פרטיות הסטטוס</div>
          <div className="text-xs text-[var(--wa-text-secondary)]">מי יוכל לראות את עדכוני הסטטוס החדשים שלך</div>
        </div>
      </header>

      <div className="wa-scroll mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-y-auto">
        <div className="py-2">
          {AUDIENCE_OPTIONS.map((option) => {
            const Icon = option.icon
            const selected = audience.mode === option.mode
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => audience.save(option.mode, option.mode === "contacts" ? [] : audience.userIds)}
                className="flex w-full items-center gap-4 px-6 py-3.5 text-right hover:bg-[var(--wa-hover)]"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    selected ? "border-[#00a884]" : "border-[#8696a0]",
                  )}
                >
                  {selected && <span className="h-2.5 w-2.5 rounded-full bg-[#00a884]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[var(--wa-text)]">{option.label}</div>
                  <div className="text-xs text-[var(--wa-text-secondary)]">{option.detail}</div>
                </div>
                <Icon className="h-5 w-5 text-[var(--wa-text-secondary)]" />
              </button>
            )
          })}
        </div>

        <p className="border-y border-[var(--wa-border)] px-6 py-3 text-xs leading-relaxed text-[var(--wa-text-secondary)]">
          שינויים בהגדרות הפרטיות לא ישפיעו על סטטוסים שכבר שלחת.
        </p>

        {audience.mode !== "contacts" && (
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between px-6 pb-1 pt-4 text-sm">
              <span className="font-medium text-[var(--wa-teal-dark)]">
                {audience.mode === "contacts_except" ? "הסתרה מ־" : "שיתוף עם"}
              </span>
              <span className="text-xs text-[var(--wa-text-secondary)]">{audience.userIds.length} נבחרו</span>
            </div>
            <div className="px-5 py-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש איש קשר"
                className="w-full rounded-lg bg-[var(--wa-header)] px-3 py-2 text-sm text-[var(--wa-text)] outline-none"
              />
            </div>
            {contactsError && (
              <div className="mx-5 mb-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{contactsError}</div>
            )}
            {filtered.map((contact) => {
              const selected = audience.userIds.includes(contact.id)
              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => toggleContact(contact.id)}
                  className="flex w-full items-center gap-3 px-6 py-2.5 text-right hover:bg-[var(--wa-hover)]"
                >
                  <Avatar name={contact.display_name} url={contact.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[var(--wa-text)]">{contact.display_name ?? contact.email}</div>
                    <div className="truncate text-xs text-[var(--wa-text-secondary)]">{contact.email}</div>
                  </div>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded border",
                      selected ? "border-[#00a884] bg-[#00a884]" : "border-[#8696a0]",
                    )}
                  >
                    {selected && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                </button>
              )
            })}
            {!contactsError && filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-[var(--wa-text-secondary)]">לא נמצאו אנשי קשר</div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--wa-border)] p-4">
        <button type="button" onClick={onBack} className="mx-auto block w-full max-w-sm rounded-full bg-[#00a884] py-2.5 font-medium text-white">
          סיום
        </button>
      </div>
    </div>
  )
}
