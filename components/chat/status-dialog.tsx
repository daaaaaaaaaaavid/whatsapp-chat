"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Modal } from "./modal"
import { Avatar } from "./avatar"
import { StatusViewer, type GroupedStatus } from "./status-viewer"
import { createClient } from "@/lib/supabase/client"
import { fetchContacts } from "@/lib/chat-actions"
import type { Profile, Status, StatusAudienceMode } from "@/lib/types"
import { formatChatListTime } from "@/lib/format"
import { isAllowedMediaFile, resolveFileMime, UNSUPPORTED_MEDIA_MESSAGE } from "@/lib/media-mime"
import {
  Camera,
  Check,
  ChevronLeft,
  ImagePlus,
  Plus,
  Settings,
  Type,
  UserCheck,
  UserMinus,
  Users,
  Video,
  X,
} from "lucide-react"

type Props = {
  open: boolean
  currentUser: Profile
  onClose: () => void
}

const BG_COLORS = ["#075E54", "#00a884", "#e542a3", "#f5b800", "#0088cc", "#d9534f", "#845ec2", "#4caf50"]
const MAX_MEDIA_BYTES = 50 * 1024 * 1024

type CreateMode = "text" | "media"

const AUDIENCE_STORAGE_KEY = "whachat-status-audience"

function audienceLabel(mode: StatusAudienceMode, selectedCount: number) {
  if (mode === "contacts_except") {
    return selectedCount ? `אנשי הקשר, חוץ מ־${selectedCount}` : "כל אנשי הקשר"
  }
  if (mode === "selected_contacts") {
    return selectedCount ? `רק ${selectedCount} אנשי קשר` : "אף אחד"
  }
  return "כל אנשי הקשר"
}

export function StatusDialog({ open, currentUser, onClose }: Props) {
  const [statuses, setStatuses] = useState<Status[]>([])
  const [contacts, setContacts] = useState<Profile[]>([])
  const [contactsError, setContactsError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [createMode, setCreateMode] = useState<CreateMode>("text")
  const [text, setText] = useState("")
  const [bgColor, setBgColor] = useState(BG_COLORS[0])
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<GroupedStatus | null>(null)
  const [viewIndex, setViewIndex] = useState(0)
  const [audienceMode, setAudienceMode] = useState<StatusAudienceMode>("contacts")
  const [audienceUserIds, setAudienceUserIds] = useState<string[]>([])
  const mediaInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data }, contactsResult] = await Promise.all([
      supabase
        .from("statuses")
        .select("*")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true }),
      fetchContacts(currentUser.id),
    ])
    setContacts(contactsResult.users)
    setContactsError(contactsResult.error)
    if (!data) return
    const uids = Array.from(new Set(data.map((s) => s.user_id)))
    const { data: profiles } = await supabase.from("profiles").select("*").in("id", uids)
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]))
    setStatuses(data.map((s) => ({ ...s, profile: pmap.get(s.user_id) })) as Status[])
  }, [currentUser.id])

  const resetCreate = () => {
    setCreating(false)
    setCreateMode("text")
    setText("")
    setBgColor(BG_COLORS[0])
    setMediaFile(null)
    setUploadError(null)
    setPosting(false)
    setPrivacyOpen(false)
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    setMediaPreview(null)
  }

  useEffect(() => {
    if (open) {
      load()
      resetCreate()
      setViewing(null)
      try {
        const saved = JSON.parse(
          localStorage.getItem(`${AUDIENCE_STORAGE_KEY}:${currentUser.id}`) ?? "null",
        ) as { mode?: StatusAudienceMode; userIds?: string[] } | null
        if (
          saved?.mode === "contacts" ||
          saved?.mode === "contacts_except" ||
          saved?.mode === "selected_contacts"
        ) {
          setAudienceMode(saved.mode)
          setAudienceUserIds(Array.isArray(saved.userIds) ? saved.userIds : [])
        }
      } catch {
        setAudienceMode("contacts")
        setAudienceUserIds([])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when dialog opens
  }, [open, load, currentUser.id])

  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    }
  }, [mediaPreview])

  const myStatuses = statuses.filter((s) => s.user_id === currentUser.id)
  const others = statuses.filter((s) => s.user_id !== currentUser.id)
  const grouped: GroupedStatus[] = []
  for (const s of others) {
    let g = grouped.find((x) => x.profile.id === s.user_id)
    if (!g && s.profile) {
      g = { profile: s.profile, statuses: [] }
      grouped.push(g)
    }
    g?.statuses.push(s)
  }

  const allGroups: GroupedStatus[] = [
    ...(myStatuses.length ? [{ profile: currentUser, statuses: myStatuses }] : []),
    ...grouped,
  ]

  const startText = () => {
    setCreateMode("text")
    setMediaFile(null)
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    setMediaPreview(null)
    setUploadError(null)
    setCreating(true)
  }

  const pickMedia = () => {
    mediaInputRef.current?.click()
  }

  const onMediaSelected = (file: File | undefined) => {
    if (!file) return
    const isImage = file.type.startsWith("image/")
    const isVideo = file.type.startsWith("video/")
    if (!isImage && !isVideo) {
      setUploadError("ניתן להעלות רק תמונות או סרטונים")
      return
    }
    if (!isAllowedMediaFile(file)) {
      setUploadError(UNSUPPORTED_MEDIA_MESSAGE)
      return
    }
    if (file.size > MAX_MEDIA_BYTES) {
      setUploadError("הקובץ גדול מדי (מקסימום 50MB)")
      return
    }
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    setMediaFile(file)
    setMediaPreview(URL.createObjectURL(file))
    setCreateMode("media")
    setUploadError(null)
    setCreating(true)
  }

  const saveAudience = (mode: StatusAudienceMode, userIds: string[]) => {
    setAudienceMode(mode)
    setAudienceUserIds(userIds)
    localStorage.setItem(
      `${AUDIENCE_STORAGE_KEY}:${currentUser.id}`,
      JSON.stringify({ mode, userIds }),
    )
  }

  const selectAudienceMode = (mode: StatusAudienceMode) => {
    saveAudience(mode, mode === "contacts" ? [] : audienceUserIds)
  }

  const toggleAudienceContact = (userId: string) => {
    const next = audienceUserIds.includes(userId)
      ? audienceUserIds.filter((id) => id !== userId)
      : [...audienceUserIds, userId]
    saveAudience(audienceMode, next)
  }

  const handlePost = async () => {
    if (posting) return
    if (createMode === "text" && !text.trim()) return
    if (createMode === "media" && !mediaFile) return

    setPosting(true)
    setUploadError(null)
    try {
      const supabase = createClient()
      let mediaUrl: string | null = null

      if (mediaFile) {
        const mime = resolveFileMime(mediaFile)
        const isVideoFile = mime.startsWith("video/") || mediaFile.type.startsWith("video/")
        const mimeExt: Record<string, string> = {
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
        const namedExt = mediaFile.name.split(".").pop()?.toLowerCase()
        const safeExt =
          mimeExt[mime] ||
          (namedExt && /^[a-z0-9]{2,5}$/.test(namedExt) ? namedExt : null) ||
          (isVideoFile ? "mp4" : "jpg")
        const path = `${currentUser.id}/status/${Date.now()}.${safeExt}`
        const { error } = await supabase.storage.from("media").upload(path, mediaFile, {
          contentType: mime,
        })
        if (error) {
          const msg = error.message.toLowerCase()
          if (msg.includes("bucket") || msg.includes("not found")) {
            setUploadError("חסר bucket בשם media ב־Supabase. הרץ את migration-media-storage.sql")
          } else if (msg.includes("policy") || msg.includes("row-level") || msg.includes("security")) {
            setUploadError("אין הרשאה להעלות. הרץ את migration-media-storage.sql ב־Supabase")
          } else {
            setUploadError(error.message)
          }
          return
        }
        const { data } = supabase.storage.from("media").getPublicUrl(path)
        // Client-only hash so the viewer classifies media without relying on extension alone.
        mediaUrl = `${data.publicUrl}#whachat=${isVideoFile ? "video" : "image"}`
      }

      const { error: insertError } = await supabase.from("statuses").insert({
        user_id: currentUser.id,
        content: text.trim() || null,
        background_color: createMode === "text" ? bgColor : "#000000",
        media_url: mediaUrl,
        audience_mode: audienceMode,
        audience_user_ids: audienceMode === "contacts" ? [] : audienceUserIds,
      })
      if (insertError) {
        const message = insertError.message.toLowerCase()
        setUploadError(
          message.includes("audience_mode") || message.includes("audience_user_ids")
            ? "יש להריץ את supabase/migration-status-privacy-12h.sql ב־Supabase לפני פרסום סטטוס"
            : insertError.message,
        )
        return
      }

      resetCreate()
      load()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "הפרסום נכשל")
    } finally {
      setPosting(false)
    }
  }

  const openViewer = (g: GroupedStatus) => {
    setViewing(g)
    setViewIndex(0)
  }

  const canPost =
    createMode === "text" ? Boolean(text.trim()) : Boolean(mediaFile)
  const mediaIsVideo = mediaFile?.type.startsWith("video/") ?? false

  return (
    <Modal open={open} onClose={onClose} title="סטטוס">
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          onMediaSelected(e.target.files?.[0])
          e.target.value = ""
        }}
      />

      {privacyOpen ? (
        <div className="flex flex-col" dir="rtl">
          <div className="flex items-center gap-3 border-b border-[var(--wa-border)] px-4 py-3">
            <button
              type="button"
              onClick={() => setPrivacyOpen(false)}
              className="rounded-full p-2 text-[var(--wa-text-secondary)] hover:bg-[var(--wa-header)]"
              aria-label="חזרה"
            >
              <ChevronLeft className="h-5 w-5 rotate-180" />
            </button>
            <div>
              <div className="font-medium text-[var(--wa-text)]">פרטיות הסטטוס</div>
              <div className="text-xs text-[var(--wa-text-secondary)]">מי יוכל לראות סטטוסים חדשים</div>
            </div>
          </div>

          <div className="border-b border-[var(--wa-border)] py-2">
            {(
              [
                {
                  mode: "contacts" as const,
                  label: "כל אנשי הקשר",
                  detail: "כל אנשי הקשר שלך ב־WhaChat",
                  icon: Users,
                },
                {
                  mode: "contacts_except" as const,
                  label: "אנשי הקשר חוץ מ...",
                  detail: "בחר למי להסתיר",
                  icon: UserMinus,
                },
                {
                  mode: "selected_contacts" as const,
                  label: "שתף רק עם...",
                  detail: "בחר מי יוכל לראות",
                  icon: UserCheck,
                },
              ] satisfies Array<{
                mode: StatusAudienceMode
                label: string
                detail: string
                icon: typeof Users
              }>
            ).map((option) => {
              const Icon = option.icon
              const selected = audienceMode === option.mode
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => selectAudienceMode(option.mode)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-right hover:bg-[var(--wa-hover)]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--wa-accent-soft)] text-[#008069]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[var(--wa-text)]">{option.label}</div>
                    <div className="text-xs text-[var(--wa-text-secondary)]">{option.detail}</div>
                  </div>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      selected ? "border-[#00a884] bg-[#00a884]" : "border-[#8696a0]"
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                </button>
              )
            })}
          </div>

          {audienceMode !== "contacts" && (
            <div className="max-h-[46vh] overflow-y-auto">
              <div className="px-5 py-2 text-xs font-medium text-[var(--wa-text-secondary)]">
                {audienceMode === "contacts_except" ? "הסתר מ־" : "שתף עם"} ·{" "}
                {audienceUserIds.length} נבחרו
              </div>
              {contactsError && (
                <div className="mx-4 mb-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {contactsError}
                </div>
              )}
              {contacts.map((contact) => {
                const selected = audienceUserIds.includes(contact.id)
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => toggleAudienceContact(contact.id)}
                    className="flex w-full items-center gap-3 px-5 py-2.5 text-right hover:bg-[var(--wa-hover)]"
                  >
                    <Avatar name={contact.display_name} url={contact.avatar_url} size={42} />
                    <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-2">
                      <div className="truncate text-[var(--wa-text)]">
                        {contact.display_name ?? contact.email}
                      </div>
                      <div className="truncate text-xs text-[var(--wa-text-secondary)]">{contact.email}</div>
                    </div>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        selected ? "border-[#00a884] bg-[#00a884]" : "border-[#8696a0]"
                      }`}
                    >
                      {selected && <Check className="h-3.5 w-3.5 text-white" />}
                    </span>
                  </button>
                )
              })}
              {!contactsError && contacts.length === 0 && (
                <div className="p-6 text-center text-sm text-[var(--wa-text-secondary)]">אין אנשי קשר לבחירה</div>
              )}
            </div>
          )}

          <div className="border-t border-[var(--wa-border)] p-4">
            <button
              type="button"
              onClick={() => setPrivacyOpen(false)}
              className="w-full rounded-full bg-[#00a884] py-2.5 font-medium text-white"
            >
              שמור
            </button>
          </div>
        </div>
      ) : creating ? (
        <div className="flex flex-col">
          {createMode === "media" && mediaPreview ? (
            <div className="relative flex min-h-64 items-center justify-center bg-black">
              {mediaIsVideo ? (
                <video src={mediaPreview} className="max-h-80 w-full object-contain" controls playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaPreview} alt="" className="max-h-80 w-full object-contain" />
              )}
              <button
                type="button"
                onClick={() => {
                  if (mediaPreview) URL.revokeObjectURL(mediaPreview)
                  setMediaFile(null)
                  setMediaPreview(null)
                  setCreateMode("text")
                }}
                className="absolute top-3 left-3 rounded-full bg-black/50 p-2 text-white"
                aria-label="הסר מדיה"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              className="flex min-h-64 items-center justify-center p-8 text-center"
              style={{ backgroundColor: bgColor }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoFocus
                placeholder="הקלד סטטוס"
                className="w-full resize-none bg-transparent text-center text-2xl font-medium text-white outline-none placeholder:text-white/70"
                rows={3}
              />
            </div>
          )}

          {createMode === "media" && (
            <div className="border-b border-[var(--wa-border)] px-4 py-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="הוסף כיתוב (אופציונלי)"
                className="w-full rounded-lg border border-[var(--wa-border)] bg-[var(--wa-header)] px-3 py-2 text-sm text-[var(--wa-text)] outline-none focus:border-[#00a884]"
                dir="rtl"
              />
            </div>
          )}

          {createMode === "text" && (
            <div className="flex items-center justify-center gap-2 p-4">
              {BG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBgColor(c)}
                  style={{ backgroundColor: c }}
                  className={`h-8 w-8 rounded-full ${bgColor === c ? "ring-2 ring-offset-2 ring-[#00a884]" : ""}`}
                  aria-label="צבע רקע"
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setPrivacyOpen(true)}
            className="mx-4 mb-3 flex items-center gap-3 rounded-lg bg-[var(--wa-header)] px-3 py-2.5 text-right"
            dir="rtl"
          >
            <Settings className="h-5 w-5 text-[#008069]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--wa-text)]">מי יכול לראות</div>
              <div className="truncate text-xs text-[var(--wa-text-secondary)]">
                {audienceLabel(audienceMode, audienceUserIds.length)}
              </div>
            </div>
            <ChevronLeft className="h-4 w-4 text-[#8696a0]" />
          </button>

          {uploadError && (
            <div className="px-4 pb-2 text-center text-sm text-red-600">{uploadError}</div>
          )}

          <div className="flex justify-between p-4">
            <button type="button" onClick={resetCreate} className="text-sm text-[var(--wa-text-secondary)]" disabled={posting}>
              ביטול
            </button>
            <button
              type="button"
              onClick={() => void handlePost()}
              disabled={!canPost || posting}
              className="rounded-full bg-[#00a884] px-6 py-2 font-medium text-white disabled:opacity-50"
            >
              {posting ? "מפרסם..." : "פרסם"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() =>
              myStatuses.length
                ? openViewer({ profile: currentUser, statuses: myStatuses })
                : startText()
            }
            className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[var(--wa-hover)]"
          >
            <div className="relative">
              <Avatar name={currentUser.display_name} url={currentUser.avatar_url} size={49} />
              {myStatuses.length === 0 && (
                <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#00a884]">
                  <Plus className="h-3 w-3 text-white" />
                </span>
              )}
            </div>
            <div className="flex-1 border-b border-[var(--wa-border)] pb-3">
              <div className="text-[var(--wa-text)]">הסטטוס שלי</div>
              <div className="text-sm text-[var(--wa-text-secondary)]">
                {myStatuses.length
                  ? formatChatListTime(myStatuses[myStatuses.length - 1].created_at)
                  : "הקש כדי להוסיף עדכון סטטוס"}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={startText}
            className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[var(--wa-hover)]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884] text-white">
              <Type className="h-5 w-5" />
            </div>
            <span className="text-[var(--wa-text)]">כתוב סטטוס טקסט חדש</span>
          </button>

          <button
            type="button"
            onClick={pickMedia}
            className="flex w-full items-center gap-3 border-b border-[var(--wa-border)] px-5 py-3 text-right transition hover:bg-[var(--wa-hover)]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0088cc] text-white">
              <ImagePlus className="h-5 w-5" />
            </div>
            <div className="flex-1 text-right">
              <div className="text-[var(--wa-text)]">תמונה או סרטון</div>
              <div className="text-xs text-[var(--wa-text-secondary)]">העלה מדיה לסטטוס</div>
            </div>
            <div className="flex gap-1 text-[var(--wa-text-secondary)]">
              <Camera className="h-4 w-4" />
              <Video className="h-4 w-4" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPrivacyOpen(true)}
            className="flex w-full items-center gap-3 border-b border-[var(--wa-border)] px-5 py-3 text-right transition hover:bg-[var(--wa-hover)]"
            dir="rtl"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--wa-accent-soft)] text-[#008069]">
              <Settings className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[var(--wa-text)]">פרטיות הסטטוס</div>
              <div className="truncate text-xs text-[var(--wa-text-secondary)]">
                {audienceLabel(audienceMode, audienceUserIds.length)}
              </div>
            </div>
            <ChevronLeft className="h-4 w-4 text-[#8696a0]" />
          </button>

          {grouped.length > 0 && (
            <>
              <div className="px-5 py-2 text-xs font-medium text-[var(--wa-text-secondary)]">עדכונים אחרונים</div>
              {grouped.map((g) => (
                <button
                  key={g.profile.id}
                  type="button"
                  onClick={() => openViewer(g)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-[var(--wa-hover)]"
                >
                  <div className="rounded-full p-0.5 ring-2 ring-[#00a884]">
                    <Avatar name={g.profile.display_name} url={g.profile.avatar_url} size={45} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[var(--wa-text)]">{g.profile.display_name ?? g.profile.email}</div>
                    <div className="text-sm text-[var(--wa-text-secondary)]">
                      {formatChatListTime(g.statuses[g.statuses.length - 1].created_at)}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {grouped.length === 0 && myStatuses.length === 0 && (
            <div className="p-6 text-center text-sm text-[var(--wa-text-secondary)]">אין עדכוני סטטוס עדיין</div>
          )}
        </div>
      )}

      {viewing && (
        <StatusViewer
          group={viewing}
          groups={allGroups}
          index={viewIndex}
          currentUserId={currentUser.id}
          onIndexChange={setViewIndex}
          onGroupChange={(g, i) => {
            setViewing(g)
            setViewIndex(i)
          }}
          onClose={() => setViewing(null)}
          onStatusDeleted={(statusId) => {
            setStatuses((prev) => prev.filter((s) => s.id !== statusId))
            setViewing((current) => {
              if (!current) return null
              const nextStatuses = current.statuses.filter((s) => s.id !== statusId)
              if (nextStatuses.length === 0) return null
              const nextIndex = Math.min(viewIndex, nextStatuses.length - 1)
              setViewIndex(nextIndex)
              return { ...current, statuses: nextStatuses }
            })
          }}
        />
      )}
    </Modal>
  )
}
