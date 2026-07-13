"use client"

import type React from "react"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { createClient } from "@/lib/supabase/client"
import type { Message, MessageType } from "@/lib/types"
import { parseCallSystemPayload, callSystemLabel } from "@/lib/call-system-message"
import { notifyOfflineRecipients } from "@/lib/push-client"
import { messagePreview } from "@/lib/conversation-display"
import { isAllowedMediaFile, resolveFileMime, UNSUPPORTED_MEDIA_MESSAGE } from "@/lib/media-mime"
import {
  Plus,
  SendHorizontal,
  Smile,
  X,
  ImageIcon,
  FileText,
  Mic,
  Reply,
  Play,
  Trash2,
  Pencil,
  Check,
} from "lucide-react"
import { parseReplyContent } from "@/lib/message-content"

type Props = {
  conversationId: string
  currentUserId: string
  onOptimistic?: (message: Message) => void
  onSent: (message: Message, tempId: string) => void
  onSendFailed?: (tempId: string) => void
  replyTo?: Message | null
  replyAuthor?: string | null
  onCancelReply?: () => void
  editingMessage?: Message | null
  onCancelEdit?: () => void
  onEdited?: (message: Message) => void
  onTyping?: (typing: boolean) => void
}

export type MessageInputHandle = {
  stageFiles: (files: FileList | File[]) => void
}

type PendingItem = {
  id: string
  file: File
  previewUrl: string | null
  kind: "image" | "video" | "file"
  caption: string
}

const EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "🤔", "😢", "😡", "👍", "🙏", "❤️", "🔥", "🎉", "💯", "😴", "🤗"]

function replyPreview(message: Message) {
  if (message.type === "image") return "תמונה"
  if (message.type === "video") return "סרטון"
  if (message.type === "audio") return "הודעה קולית"
  if (message.type === "file") return message.file_name ?? "קובץ"
  const call = parseCallSystemPayload(message.content)
  if (call) return callSystemLabel(call)
  if (message.content) return message.content
  return "הודעה"
}

function detectMediaKind(file: File): "image" | "video" | "file" | "audio" {
  const lower = file.name.toLowerCase()
  if (file.type.startsWith("audio/") || /\.(ogg|mp3|m4a|wav|aac)$/.test(lower)) return "audio"
  if (file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi|mkv|3gp)$/.test(lower)) return "video"
  if (file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|heic|avif)$/.test(lower)) return "image"
  return "file"
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function toPendingItem(file: File): PendingItem | null {
  const kind = detectMediaKind(file)
  if (kind === "audio") return null
  const previewUrl =
    kind === "image" || kind === "video" ? URL.createObjectURL(file) : null
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl,
    kind,
    caption: "",
  }
}

function revokePending(items: PendingItem[]) {
  for (const item of items) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }
}

export const MessageInput = forwardRef<MessageInputHandle, Props>(function MessageInput(
  {
    conversationId,
    currentUserId,
    onOptimistic,
    onSent,
    onSendFailed,
    replyTo,
    replyAuthor,
    onCancelReply,
    editingMessage,
    onCancelEdit,
    onEdited,
    onTyping,
  },
  ref,
) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [pending, setPending] = useState<PendingItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [sendingMedia, setSendingMedia] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const captionInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const onTypingRef = useRef(onTyping)
  onTypingRef.current = onTyping
  const isEditing = Boolean(editingMessage)

  const resizeTextarea = useCallback(() => {
    const el = textInputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  useEffect(() => {
    if (!editingMessage) return
    const parsed = parseReplyContent(editingMessage.content)
    const body = editingMessage.reply_to_id
      ? (editingMessage.content ?? "")
      : (parsed?.body ?? editingMessage.content ?? "")
    setText(body)
    onCancelReply?.()
    requestAnimationFrame(() => {
      textInputRef.current?.focus()
      resizeTextarea()
    })
  }, [editingMessage, onCancelReply, resizeTextarea])

  useEffect(() => {
    resizeTextarea()
  }, [text, resizeTextarea])

  useEffect(() => {
    setText("")
    setSending(false)
    setShowAttach(false)
    setShowEmoji(false)
    setUploadProgress(null)
    setUploadError(null)
    setSendError(null)
    setSendingMedia(false)
    setActiveIndex(0)
    setPending((prev) => {
      revokePending(prev)
      return []
    })
    if (mediaRecorderRef.current?.state === "recording") {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        // ignore
      }
    }
    setRecording(false)
    onTypingRef.current?.(false)
  }, [conversationId])

  const sendMessage = useCallback(
    async (payload: {
      content?: string | null
      type?: MessageType
      file_url?: string
      file_name?: string
      file_size?: number
      reply_to_id?: string | null
      reply_to?: Message | null
    }) => {
      const tempId = `temp-${crypto.randomUUID()}`
      const createdAt = new Date().toISOString()
      const optimistic: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: payload.content ?? null,
        type: payload.type ?? "text",
        file_url: payload.file_url ?? null,
        file_name: payload.file_name ?? null,
        file_size: payload.file_size ?? null,
        reply_to_id: payload.reply_to_id ?? null,
        reply_to: payload.reply_to ?? null,
        created_at: createdAt,
        pending: true,
        reads: [],
      }
      onOptimistic?.(optimistic)

      const supabase = createClient()
      const row = {
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: payload.content ?? null,
        type: payload.type ?? "text",
        file_url: payload.file_url ?? null,
        file_name: payload.file_name ?? null,
        file_size: payload.file_size ?? null,
        reply_to_id: payload.reply_to_id ?? null,
      }
      let { data, error } = await supabase.from("messages").insert(row).select("*").single()
      // Retry without reply_to_id if the column is not migrated yet
      if (error && payload.reply_to_id && /reply_to_id/i.test(error.message)) {
        const { reply_to_id: _omit, ...withoutReply } = row
        ;({ data, error } = await supabase.from("messages").insert(withoutReply).select("*").single())
      }
      if (error) {
        onSendFailed?.(tempId)
        throw error
      }
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId)

      const real = {
        ...(data as Message),
        pending: false,
        reads: [],
        reply_to: payload.reply_to ?? null,
      }
      onSent(real, tempId)
      notifyOfflineRecipients({
        conversationId,
        messageId: real.id,
        body: messagePreview(real),
      })
      return real
    },
    [conversationId, currentUserId, onOptimistic, onSent, onSendFailed],
  )

  const uploadAndSend = useCallback(
    async (
      file: File,
      kindHint: "image" | "file" | "audio" | "video",
      caption?: string | null,
      reply?: { id: string; message: Message } | null,
    ) => {
      setUploadProgress("מעלה...")
      setUploadError(null)
      try {
        if (!isAllowedMediaFile(file)) {
          setUploadError(UNSUPPORTED_MEDIA_MESSAGE)
          setUploadProgress(null)
          throw new Error(UNSUPPORTED_MEDIA_MESSAGE)
        }
        const supabase = createClient()
        const ext = file.name.split(".").pop() || "bin"
        const path = `${currentUserId}/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

        const contentType = resolveFileMime(file)
        const { error } = await supabase.storage.from("media").upload(path, file, {
          contentType,
          upsert: false,
        })
        if (error) {
          const msg = error.message.toLowerCase()
          if (msg.includes("bucket") || msg.includes("not found")) {
            setUploadError("חסר bucket בשם media ב־Supabase. הרץ את migration-media-storage.sql")
          } else if (msg.includes("policy") || msg.includes("row-level") || msg.includes("security")) {
            setUploadError("אין הרשאה להעלות. הרץ את migration-media-storage.sql ב־Supabase")
          } else if (msg.includes("mime") || msg.includes("type") || msg.includes("not allowed")) {
            setUploadError(UNSUPPORTED_MEDIA_MESSAGE)
          } else {
            setUploadError(error.message)
          }
          setUploadProgress(null)
          throw error
        }
        const { data } = supabase.storage.from("media").getPublicUrl(path)

        let type: MessageType = "file"
        const lower = file.name.toLowerCase()
        if (kindHint === "audio" || file.type.startsWith("audio/")) {
          type = "audio"
        } else if (
          kindHint === "video" ||
          file.type.startsWith("video/") ||
          /\.(mp4|webm|mov|m4v|avi|mkv|3gp)$/.test(lower)
        ) {
          type = "video"
        } else if (
          kindHint === "image" ||
          file.type.startsWith("image/") ||
          /\.(jpe?g|png|gif|webp|bmp|heic|avif)$/.test(lower)
        ) {
          type = "image"
        }

        await sendMessage({
          type,
          file_url: data.publicUrl,
          file_name: file.name,
          file_size: file.size,
          content: caption?.trim() || null,
          reply_to_id: reply?.id ?? null,
          reply_to: reply?.message ?? null,
        })
        setUploadProgress(null)
      } catch (err) {
        setUploadProgress(null)
        setUploadError((prev) => {
          if (prev) return prev
          if (err instanceof Error && err.message) return err.message
          if (err && typeof err === "object" && "message" in err) {
            const msg = String((err as { message?: unknown }).message ?? "")
            if (msg) return msg
          }
          return "העלאה נכשלה"
        })
        throw err
      }
    },
    [conversationId, currentUserId, sendMessage],
  )

  const stageFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return

      const unsupported = list.filter((f) => !isAllowedMediaFile(f))
      if (unsupported.length) {
        setUploadError(UNSUPPORTED_MEDIA_MESSAGE)
      }
      const allowed = list.filter((f) => isAllowedMediaFile(f))
      if (allowed.length === 0) return

      const audioFiles = allowed.filter((f) => detectMediaKind(f) === "audio")
      const mediaFiles = allowed.filter((f) => detectMediaKind(f) !== "audio")

      for (const file of audioFiles) {
        void uploadAndSend(file, "audio").catch(() => {})
      }

      if (mediaFiles.length === 0) return

      const next = mediaFiles.map(toPendingItem).filter((item): item is PendingItem => Boolean(item))
      if (next.length === 0) return

      setShowAttach(false)
      setShowEmoji(false)
      if (!unsupported.length) setUploadError(null)
      setPending((prev) => {
        setActiveIndex(prev.length > 0 ? prev.length : 0)
        return [...prev, ...next]
      })
      requestAnimationFrame(() => captionInputRef.current?.focus())
    },
    [uploadAndSend],
  )

  useImperativeHandle(ref, () => ({ stageFiles }), [stageFiles])

  useEffect(() => {
    return () => revokePending(pendingRef.current)
  }, [])

  const clearPending = () => {
    setPending((prev) => {
      revokePending(prev)
      return []
    })
    setActiveIndex(0)
  }

  const removePendingAt = (index: number) => {
    setPending((prev) => {
      const item = prev[index]
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      const next = prev.filter((_, i) => i !== index)
      setActiveIndex((ai) => {
        if (next.length === 0) return 0
        if (ai >= next.length) return next.length - 1
        if (ai > index) return ai - 1
        return ai
      })
      return next
    })
  }

  const updateCaption = (value: string) => {
    setPending((prev) =>
      prev.map((item, i) => (i === activeIndex ? { ...item, caption: value } : item)),
    )
  }

  const handleSendText = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setSendError(null)
    setShowEmoji(false)
    onTyping?.(false)

    if (editingMessage) {
      const editedAt = new Date().toISOString()
      const parsed = parseReplyContent(editingMessage.content)
      const nextContent =
        editingMessage.reply_to_id || !parsed
          ? trimmed
          : `↩ ${parsed.author}: ${parsed.preview}\n${trimmed}`
      const previousText = text
      setText("")
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("messages")
          .update({ content: nextContent, edited_at: editedAt })
          .eq("id", editingMessage.id)
          .eq("sender_id", currentUserId)
          .select("*")
          .single()
        if (error) {
          // Column edited_at may be missing — retry content-only update
          const fallback = await supabase
            .from("messages")
            .update({ content: nextContent })
            .eq("id", editingMessage.id)
            .eq("sender_id", currentUserId)
            .select("*")
            .single()
          if (fallback.error) throw fallback.error
          onEdited?.({
            ...(fallback.data as Message),
            edited_at: editedAt,
            reply_to: editingMessage.reply_to,
            reply_to_id: editingMessage.reply_to_id,
          })
        } else {
          onEdited?.({
            ...(data as Message),
            reply_to: editingMessage.reply_to,
            reply_to_id: editingMessage.reply_to_id,
          })
        }
        onCancelEdit?.()
      } catch (err) {
        setSendError(err instanceof Error ? err.message : "עריכה נכשלה")
        setText(previousText)
      } finally {
        setSending(false)
      }
      return
    }

    setText("")
    const replySnapshot = replyTo
    onCancelReply?.()
    try {
      await sendMessage({
        content: trimmed,
        type: "text",
        reply_to_id: replySnapshot?.id ?? null,
        reply_to: replySnapshot ?? null,
      })
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "שליחה נכשלה")
      setText(trimmed)
    } finally {
      setSending(false)
    }
  }

  const sendPendingMedia = async () => {
    if (pending.length === 0 || sendingMedia) return
    setSendingMedia(true)
    setUploadError(null)

    const items = [...pending]
    const replySnapshot = replyTo
    const sent: PendingItem[] = []

    setPending([])
    setActiveIndex(0)
    if (replySnapshot) onCancelReply?.()

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (!isAllowedMediaFile(item.file)) {
          setUploadError(UNSUPPORTED_MEDIA_MESSAGE)
          throw new Error(UNSUPPORTED_MEDIA_MESSAGE)
        }
        setUploadProgress(items.length > 1 ? `מעלה ${i + 1}/${items.length}...` : "מעלה...")

        const supabase = createClient()
        const ext = item.file.name.split(".").pop() || "bin"
        const path = `${currentUserId}/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

        const contentType = resolveFileMime(item.file)
        const { error } = await supabase.storage.from("media").upload(path, item.file, {
          contentType,
          upsert: false,
        })
        if (error) {
          const msg = error.message.toLowerCase()
          if (msg.includes("bucket") || msg.includes("not found")) {
            setUploadError("חסר bucket בשם media ב־Supabase. הרץ את migration-media-storage.sql")
          } else if (msg.includes("policy") || msg.includes("row-level") || msg.includes("security")) {
            setUploadError("אין הרשאה להעלות. הרץ את migration-media-storage.sql ב־Supabase")
          } else if (msg.includes("mime") || msg.includes("type") || msg.includes("not allowed")) {
            setUploadError(UNSUPPORTED_MEDIA_MESSAGE)
          } else {
            setUploadError(error.message)
          }
          throw error
        }
        const { data } = supabase.storage.from("media").getPublicUrl(path)

        const captionText = item.caption.trim()
        await sendMessage({
          type: item.kind,
          file_url: data.publicUrl,
          file_name: item.file.name,
          file_size: item.file.size,
          content: captionText || null,
          reply_to_id: i === 0 ? (replySnapshot?.id ?? null) : null,
          reply_to: i === 0 ? (replySnapshot ?? null) : null,
        })
        sent.push(item)
      }
      revokePending(sent)
    } catch (err) {
      const remaining = items.filter((item) => !sent.includes(item))
      setPending(remaining)
      setActiveIndex(0)
      revokePending(sent)
      setUploadError((prev) => prev || (err instanceof Error ? err.message : "העלאה נכשלה"))
    } finally {
      setSendingMedia(false)
      setUploadProgress(null)
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" })
        try {
          await uploadAndSend(file, "audio")
        } catch {
          // uploadAndSend sets uploadError
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      audioInputRef.current?.click()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.files
    if (items && items.length > 0) {
      e.preventDefault()
      stageFiles(items)
    }
  }

  const hasText = Boolean(text.trim())
  const active = pending[activeIndex] ?? null

  return (
    <div className="relative">
      {pending.length > 0 && active && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-[#0b141a]" dir="rtl">
          <header className="flex h-14 shrink-0 items-center gap-3 px-4 text-white">
            <button
              type="button"
              onClick={clearPending}
              className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10"
              aria-label="ביטול"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-medium">
                {active.kind === "image" ? "תמונה" : active.kind === "video" ? "סרטון" : "מסמך"}
                {pending.length > 1 ? ` (${activeIndex + 1}/${pending.length})` : ""}
              </div>
              <div className="truncate text-xs text-white/60">{active.file.name}</div>
            </div>
            {pending.length > 1 && (
              <button
                type="button"
                onClick={() => removePendingAt(activeIndex)}
                className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10"
                aria-label="הסר קובץ"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
          </header>

          <div className="flex min-h-0 flex-1 items-center justify-center px-4">
            {active.kind === "image" && active.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.previewUrl}
                alt={active.file.name}
                className="max-h-full max-w-full object-contain"
              />
            )}
            {active.kind === "video" && active.previewUrl && (
              <video
                src={active.previewUrl}
                controls
                className="max-h-[min(70vh,720px)] max-w-full rounded-sm object-contain"
              />
            )}
            {active.kind === "file" && (
              <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/5 px-10 py-12 text-center text-white">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#7f66ff]/20">
                  <FileText className="h-10 w-10 text-[#b39dff]" />
                </div>
                <div>
                  <div className="max-w-xs truncate text-lg font-medium">{active.file.name}</div>
                  <div className="mt-1 text-sm text-white/50">{formatFileSize(active.file.size)}</div>
                </div>
              </div>
            )}
          </div>

          {pending.length > 1 && (
            <div className="flex shrink-0 gap-2 overflow-x-auto px-4 py-3">
              {pending.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                    i === activeIndex ? "ring-[#00a884]" : "ring-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  {item.previewUrl && item.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : item.previewUrl && item.kind === "video" ? (
                    <div className="relative h-full w-full bg-black">
                      <video src={item.previewUrl} muted className="h-full w-full object-cover" />
                      <Play className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#1f2c34]">
                      <FileText className="h-6 w-6 text-[#b39dff]" />
                    </div>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/15"
                aria-label="הוסף עוד"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>
          )}

          <div className="shrink-0 border-t border-white/10 bg-[#1f2c34] px-3 py-3">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void sendPendingMedia()
              }}
              className="mx-auto flex max-w-3xl items-center gap-2"
            >
              <input
                ref={captionInputRef}
                value={active.caption}
                onChange={(e) => updateCaption(e.target.value)}
                placeholder="הוסף כיתוב..."
                className="flex-1 rounded-lg bg-[#2a3942] px-4 py-3 text-[15px] text-white outline-none placeholder:text-white/40"
                disabled={sendingMedia}
              />
              <button
                type="submit"
                disabled={sendingMedia}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition hover:bg-[#06cf9c] disabled:opacity-50"
                aria-label="שלח"
              >
                <SendHorizontal className="h-6 w-6 -scale-x-100" />
              </button>
            </form>
          </div>
        </div>
      )}

      {uploadProgress && (
        <div className="absolute -top-8 right-4 z-30 rounded-full bg-[#00a884] px-3 py-1 text-xs text-white">
          {uploadProgress}
        </div>
      )}

      {replyTo && !isEditing && (
        <div className="flex items-stretch gap-2 border-b border-[#e9edef] bg-[#f0f2f5] px-4 pt-2" dir="rtl">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border-r-4 border-[#00a884] bg-white px-3 py-2">
            <Reply className="h-4 w-4 shrink-0 text-[#00a884]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-[#00a884]">{replyAuthor ?? "משתמש"}</div>
              <div className="truncate text-sm text-[#667781]">{replyPreview(replyTo)}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full text-[#54656f] transition hover:bg-black/5"
            aria-label="ביטול תגובה"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {isEditing && editingMessage && (
        <div className="flex items-stretch gap-2 border-b border-[#e9edef] bg-[#f0f2f5] px-4 pt-2" dir="rtl">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border-r-4 border-[#53bdeb] bg-white px-3 py-2">
            <Pencil className="h-4 w-4 shrink-0 text-[#53bdeb]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-[#53bdeb]">עריכת הודעה</div>
              <div className="truncate text-sm text-[#667781]">
                {editingMessage.reply_to_id
                  ? (editingMessage.content ?? "")
                  : (parseReplyContent(editingMessage.content)?.body ?? editingMessage.content ?? "")}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setText("")
              onCancelEdit?.()
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full text-[#54656f] transition hover:bg-black/5"
            aria-label="ביטול עריכה"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {(uploadError || sendError) && (
        <div className="absolute -top-12 inset-x-4 z-30 rounded-md bg-[#fde8e8] px-3 py-2 text-center text-xs text-[#ea0038] shadow">
          {uploadError || sendError}
          <button
            type="button"
            className="mr-2 underline"
            onClick={() => {
              setUploadError(null)
              setSendError(null)
            }}
          >
            סגור
          </button>
        </div>
      )}

      {recording && (
        <div className="absolute -top-10 inset-x-0 flex justify-center">
          <button
            type="button"
            onClick={stopRecording}
            className="flex items-center gap-2 rounded-full bg-[#ea0038] px-4 py-1.5 text-sm text-white shadow"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            מקליט... לחץ לעצירה ושליחה
          </button>
        </div>
      )}

      {showEmoji && (
        <div className="absolute bottom-16 right-4 z-20 grid grid-cols-8 gap-1 rounded-lg bg-white p-3 shadow-lg ring-1 ring-black/5">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setText((t) => t + emoji)}
              className="rounded p-1 text-xl transition hover:bg-[#f0f2f5]"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {showAttach && (
        <div className="absolute bottom-16 right-14 z-20 flex flex-col gap-2 rounded-lg bg-white p-2 shadow-lg ring-1 ring-black/5">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[#3b4a54] transition hover:bg-[#f0f2f5]"
          >
            <ImageIcon className="h-5 w-5 text-[#007bfc]" />
            תמונות וסרטונים
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[#3b4a54] transition hover:bg-[#f0f2f5]"
          >
            <FileText className="h-5 w-5 text-[#7f66ff]" />
            מסמך
          </button>
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) stageFiles(e.target.files)
          e.target.value = ""
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) stageFiles(e.target.files)
          e.target.value = ""
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void uploadAndSend(f, "audio")
          e.target.value = ""
        }}
      />

      <form onSubmit={handleSendText} className="flex items-end gap-2 bg-[#f0f2f5] px-4 py-2.5">
        {!isEditing && (
          <>
            <button
              type="button"
              onClick={() => {
                setShowEmoji((v) => !v)
                setShowAttach(false)
              }}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5"
              aria-label="אמוג'י"
            >
              <Smile className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAttach((v) => !v)
                setShowEmoji(false)
              }}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5"
              aria-label="צירוף קובץ"
            >
              {showAttach ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
            </button>
          </>
        )}
        {isEditing && (
          <button
            type="button"
            onClick={() => {
              setShowEmoji((v) => !v)
              setShowAttach(false)
            }}
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5"
            aria-label="אמוג'י"
          >
            <Smile className="h-6 w-6" />
          </button>
        )}

        <textarea
          ref={textInputRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            onTyping?.(e.target.value.trim().length > 0)
          }}
          onBlur={() => onTyping?.(false)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              if (e.nativeEvent.isComposing) return
              e.preventDefault()
              onTyping?.(false)
              void handleSendText()
            }
            // Shift+Enter: allow default newline behavior
          }}
          placeholder={isEditing ? "ערוך הודעה" : "הקלדת הודעה"}
          className="max-h-[120px] min-h-[42px] flex-1 resize-none overflow-y-auto rounded-lg bg-white px-4 py-2.5 text-[15px] leading-[22px] text-[#111b21] outline-none placeholder:text-[#667781]"
        />

        {hasText || isEditing ? (
          <button
            type="submit"
            disabled={sending || !hasText}
            className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${
              isEditing
                ? "bg-[#00a884] text-white hover:bg-[#06cf9c]"
                : "text-[#54656f] hover:bg-black/5"
            }`}
            aria-label={isEditing ? "שמור עריכה" : "שלח"}
          >
            {isEditing ? (
              <Check className="h-5 w-5" />
            ) : (
              <SendHorizontal className="h-6 w-6 -scale-x-100" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (recording ? stopRecording() : startRecording())}
            className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 ${
              recording ? "text-[#ea0038]" : "text-[#54656f]"
            }`}
            aria-label={recording ? "עצור הקלטה" : "הודעה קולית"}
          >
            <Mic className="h-6 w-6" />
          </button>
        )}
      </form>
    </div>
  )
})
