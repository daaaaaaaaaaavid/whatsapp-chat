"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Modal } from "./modal"
import { Avatar } from "./avatar"
import { StatusViewer, type GroupedStatus } from "./status-viewer"
import { createClient } from "@/lib/supabase/client"
import type { Profile, Status } from "@/lib/types"
import { formatChatListTime } from "@/lib/format"
import { Camera, ImagePlus, Plus, Type, Video, X } from "lucide-react"

type Props = {
  open: boolean
  currentUser: Profile
  onClose: () => void
}

const BG_COLORS = ["#075E54", "#00a884", "#e542a3", "#f5b800", "#0088cc", "#d9534f", "#845ec2", "#4caf50"]
const MAX_MEDIA_BYTES = 50 * 1024 * 1024

type CreateMode = "text" | "media"

export function StatusDialog({ open, currentUser, onClose }: Props) {
  const [statuses, setStatuses] = useState<Status[]>([])
  const [creating, setCreating] = useState(false)
  const [createMode, setCreateMode] = useState<CreateMode>("text")
  const [text, setText] = useState("")
  const [bgColor, setBgColor] = useState(BG_COLORS[0])
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<GroupedStatus | null>(null)
  const [viewIndex, setViewIndex] = useState(0)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("statuses")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
    if (!data) return
    const uids = Array.from(new Set(data.map((s) => s.user_id)))
    const { data: profiles } = await supabase.from("profiles").select("*").in("id", uids)
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]))
    setStatuses(data.map((s) => ({ ...s, profile: pmap.get(s.user_id) })) as Status[])
  }, [])

  const resetCreate = () => {
    setCreating(false)
    setCreateMode("text")
    setText("")
    setBgColor(BG_COLORS[0])
    setMediaFile(null)
    setUploadError(null)
    setPosting(false)
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    setMediaPreview(null)
  }

  useEffect(() => {
    if (open) {
      load()
      resetCreate()
      setViewing(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when dialog opens
  }, [open, load])

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
        const ext = mediaFile.name.split(".").pop() || (mediaFile.type.startsWith("video/") ? "mp4" : "jpg")
        const path = `${currentUser.id}/status/${Date.now()}.${ext}`
        const { error } = await supabase.storage.from("media").upload(path, mediaFile)
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
        mediaUrl = data.publicUrl
      }

      const { error: insertError } = await supabase.from("statuses").insert({
        user_id: currentUser.id,
        content: text.trim() || null,
        background_color: createMode === "text" ? bgColor : "#000000",
        media_url: mediaUrl,
      })
      if (insertError) {
        setUploadError(insertError.message)
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

      {creating ? (
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
            <div className="border-b border-[#e9edef] px-4 py-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="הוסף כיתוב (אופציונלי)"
                className="w-full rounded-lg border border-[#e9edef] bg-[#f0f2f5] px-3 py-2 text-sm text-[#111b21] outline-none focus:border-[#00a884]"
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

          {uploadError && (
            <div className="px-4 pb-2 text-center text-sm text-red-600">{uploadError}</div>
          )}

          <div className="flex justify-between p-4">
            <button type="button" onClick={resetCreate} className="text-sm text-[#667781]" disabled={posting}>
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
            className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[#f5f6f6]"
          >
            <div className="relative">
              <Avatar name={currentUser.display_name} url={currentUser.avatar_url} size={49} />
              {myStatuses.length === 0 && (
                <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#00a884]">
                  <Plus className="h-3 w-3 text-white" />
                </span>
              )}
            </div>
            <div className="flex-1 border-b border-[#e9edef] pb-3">
              <div className="text-[#111b21]">הסטטוס שלי</div>
              <div className="text-sm text-[#667781]">
                {myStatuses.length
                  ? formatChatListTime(myStatuses[myStatuses.length - 1].created_at)
                  : "הקש כדי להוסיף עדכון סטטוס"}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={startText}
            className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[#f5f6f6]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884] text-white">
              <Type className="h-5 w-5" />
            </div>
            <span className="text-[#111b21]">כתוב סטטוס טקסט חדש</span>
          </button>

          <button
            type="button"
            onClick={pickMedia}
            className="flex w-full items-center gap-3 border-b border-[#e9edef] px-5 py-3 text-right transition hover:bg-[#f5f6f6]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0088cc] text-white">
              <ImagePlus className="h-5 w-5" />
            </div>
            <div className="flex-1 text-right">
              <div className="text-[#111b21]">תמונה או סרטון</div>
              <div className="text-xs text-[#667781]">העלה מדיה לסטטוס</div>
            </div>
            <div className="flex gap-1 text-[#667781]">
              <Camera className="h-4 w-4" />
              <Video className="h-4 w-4" />
            </div>
          </button>

          {grouped.length > 0 && (
            <>
              <div className="px-5 py-2 text-xs font-medium text-[#667781]">עדכונים אחרונים</div>
              {grouped.map((g) => (
                <button
                  key={g.profile.id}
                  type="button"
                  onClick={() => openViewer(g)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-[#f5f6f6]"
                >
                  <div className="rounded-full p-0.5 ring-2 ring-[#00a884]">
                    <Avatar name={g.profile.display_name} url={g.profile.avatar_url} size={45} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[#111b21]">{g.profile.display_name ?? g.profile.email}</div>
                    <div className="text-sm text-[#667781]">
                      {formatChatListTime(g.statuses[g.statuses.length - 1].created_at)}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {grouped.length === 0 && myStatuses.length === 0 && (
            <div className="p-6 text-center text-sm text-[#667781]">אין עדכוני סטטוס עדיין</div>
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
        />
      )}
    </Modal>
  )
}
