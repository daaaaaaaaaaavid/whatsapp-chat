"use client"

import type React from "react"

import dynamic from "next/dynamic"
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { createClient } from "@/lib/supabase/client"
import type { Message, MessageType } from "@/lib/types"
import { parseCallSystemPayload, callSystemLabel } from "@/lib/call-system-message"
import { notifyOfflineRecipients } from "@/lib/push-client"
import {
  isAllowedMediaFile,
  MAX_MEDIA_BYTES,
  pickVoiceRecorderMime,
  resolveFileMime,
  UNSUPPORTED_MEDIA_MESSAGE,
  voiceRecordingFile,
} from "@/lib/media-mime"
import { uploadMediaWithProgress } from "@/lib/media-upload"
import { mediaReferenceUrl, withMediaDurationHint } from "@/lib/media-url"
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
  Bold,
  Italic,
  Palette,
  LoaderCircle,
} from "lucide-react"
import { parseReplyContent } from "@/lib/message-content"
import {
  decodeFormattedMessage,
  DEFAULT_MESSAGE_FORMATTING,
  encodeFormattedMessage,
  MESSAGE_COLORS,
  plainMessageText,
  type MessageFormatting,
} from "@/lib/message-formatting"
import {
  detectMediaKind,
  formatUploadFileSize,
  revokePending,
  toPendingItem,
  type PendingMediaItem,
} from "@/lib/pending-media"
import { MAX_MESSAGE_LENGTH } from "@/lib/validation"

const EmojiPicker = dynamic(() => import("@/components/chat/emoji-picker"), {
  ssr: false,
  loading: () => (
    <div className="absolute bottom-16 left-2 right-2 z-30 h-[390px] animate-pulse rounded-xl bg-[var(--wa-panel)] shadow-xl ring-1 ring-black/10 sm:left-auto sm:right-4 sm:w-[370px]" />
  ),
})

type Props = {
  conversationId: string
  currentUserId: string
  onOptimistic?: (message: Message) => void
  onSent: (message: Message, tempId: string) => void
  onSendFailed?: (tempId: string) => void
  replyTo?: Message | null
  replyAuthor?: string | null
  onCancelReply?: () => void
  /** Keep reply target after send (side thread panel). */
  keepReplyAfterSend?: boolean
  /** Label / chrome for Google Chat–style thread composer. */
  threadMode?: boolean
  editingMessage?: Message | null
  onCancelEdit?: () => void
  onEdited?: (message: Message) => void
  onTyping?: (typing: boolean) => void
}

export type MessageInputHandle = {
  stageFiles: (files: FileList | File[]) => void
}

type PendingItem = PendingMediaItem

type UploadStatus = {
  fileName: string
  current: number
  total: number
  /** 0–1 progress within the current file */
  fileProgress: number
}

type RecordingPreview = {
  file: File
  url: string
  durationSec: number
}

function overallUploadPercent(status: UploadStatus): number {
  if (status.total <= 0) return 0
  const ratio = (status.current - 1 + Math.min(1, Math.max(0, status.fileProgress))) / status.total
  return Math.round(Math.min(100, Math.max(0, ratio * 100)))
}

function replyPreview(message: Message) {
  if (message.type === "image") return "תמונה"
  if (message.type === "video") return "סרטון"
  if (message.type === "audio") return "הודעה קולית"
  if (message.type === "file") return message.file_name ?? "קובץ"
  const call = parseCallSystemPayload(message.content)
  if (call) return callSystemLabel(call)
  if (message.content) return plainMessageText(message.content)
  return "הודעה"
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
    keepReplyAfterSend,
    threadMode,
    editingMessage,
    onCancelEdit,
    onEdited,
    onTyping,
  },
  ref,
) {
  const emojiPickerId = useId()
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showFormatting, setShowFormatting] = useState(false)
  const [formatting, setFormatting] = useState<MessageFormatting>({ ...DEFAULT_MESSAGE_FORMATTING })
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordingPreview, setRecordingPreview] = useState<RecordingPreview | null>(null)
  const [sendingRecording, setSendingRecording] = useState(false)
  const [pending, setPending] = useState<PendingItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [sendingMedia, setSendingMedia] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const captionInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const textSelectionRef = useRef({ start: 0, end: 0 })
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingStartedAtRef = useRef<number | null>(null)
  const discardRecordingRef = useRef(false)
  const recordingPreviewRef = useRef(recordingPreview)
  recordingPreviewRef.current = recordingPreview
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

  const rememberTextSelection = useCallback(() => {
    const input = textInputRef.current
    if (!input) return
    textSelectionRef.current = {
      start: input.selectionStart,
      end: input.selectionEnd,
    }
  }, [])

  const closeEmojiPicker = useCallback(() => setShowEmoji(false), [])

  const insertEmoji = useCallback(
    (emoji: string) => {
      setText((current) => {
        const start = Math.min(textSelectionRef.current.start, current.length)
        const end = Math.min(textSelectionRef.current.end, current.length)
        const cursor = start + emoji.length
        textSelectionRef.current = { start: cursor, end: cursor }

        requestAnimationFrame(() => {
          const input = textInputRef.current
          input?.focus()
          input?.setSelectionRange(cursor, cursor)
          resizeTextarea()
        })

        return `${current.slice(0, start)}${emoji}${current.slice(end)}`
      })
      onTypingRef.current?.(true)
    },
    [resizeTextarea],
  )

  useEffect(() => {
    if (!editingMessage) return
    const parsed = parseReplyContent(editingMessage.content)
    const body = editingMessage.reply_to_id
      ? (editingMessage.content ?? "")
      : (parsed?.body ?? editingMessage.content ?? "")
    const decoded = decodeFormattedMessage(body)
    setText(decoded.text)
    setFormatting(decoded.formatting)
    onCancelReply?.()
    requestAnimationFrame(() => {
      const input = textInputRef.current
      const cursor = decoded.text.length
      input?.focus()
      input?.setSelectionRange(cursor, cursor)
      textSelectionRef.current = { start: cursor, end: cursor }
      resizeTextarea()
    })
  }, [editingMessage, onCancelReply, resizeTextarea])

  useEffect(() => {
    resizeTextarea()
  }, [text, resizeTextarea])

  useEffect(() => {
    return () => {
      const preview = recordingPreviewRef.current
      if (preview) URL.revokeObjectURL(preview.url)
    }
  }, [])

  useEffect(() => {
    setText("")
    textSelectionRef.current = { start: 0, end: 0 }
    setSending(false)
    setShowAttach(false)
    setShowEmoji(false)
    setShowFormatting(false)
    setFormatting({ ...DEFAULT_MESSAGE_FORMATTING })
    setUploadStatus(null)
    setUploadError(null)
    setSendError(null)
    setSendingMedia(false)
    setSendingRecording(false)
    setRecordingPreview((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
    setActiveIndex(0)
    setPending((prev) => {
      revokePending(prev)
      return []
    })
    if (mediaRecorderRef.current?.state === "recording") {
      discardRecordingRef.current = true
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
      durationSec?: number | null,
    ) => {
      setUploadStatus({ fileName: file.name, current: 1, total: 1, fileProgress: 0 })
      setUploadError(null)
      try {
        if (!isAllowedMediaFile(file)) {
          setUploadError(UNSUPPORTED_MEDIA_MESSAGE)
          setUploadStatus(null)
          throw new Error(UNSUPPORTED_MEDIA_MESSAGE)
        }
        if (file.size > MAX_MEDIA_BYTES) {
          setUploadError("הקובץ גדול מדי (מקסימום 50MB)")
          setUploadStatus(null)
          throw new Error("file too large")
        }
        const supabase = createClient()
        const ext = file.name.split(".").pop() || "bin"
        const path = `${currentUserId}/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

        const contentType = resolveFileMime(file)
        const { error } = await uploadMediaWithProgress(supabase, path, file, {
          contentType,
          upsert: false,
          onProgress: (p) => {
            setUploadStatus((prev) =>
              prev
                ? { ...prev, fileName: file.name, current: 1, total: 1, fileProgress: p.ratio }
                : { fileName: file.name, current: 1, total: 1, fileProgress: p.ratio },
            )
          },
        })
        if (error) {
          const msg = error.message.toLowerCase()
          if (msg.includes("bucket") || msg.includes("not found")) {
            setUploadError("חסר bucket בשם media ב־Supabase. הרץ את migration-private-media.sql")
          } else if (msg.includes("policy") || msg.includes("row-level") || msg.includes("security")) {
            setUploadError("אין הרשאה להעלות. הרץ את migration-private-media.sql ב־Supabase")
          } else if (msg.includes("mime") || msg.includes("type") || msg.includes("not allowed")) {
            setUploadError(UNSUPPORTED_MEDIA_MESSAGE)
          } else {
            setUploadError(error.message)
          }
          setUploadStatus(null)
          throw error
        }
        let publicUrl = mediaReferenceUrl(supabase, path)

        let type: MessageType = "file"
        const lower = file.name.toLowerCase()
        if (kindHint === "audio" || file.type.startsWith("audio/")) {
          type = "audio"
          if (durationSec && durationSec > 0) {
            publicUrl = withMediaDurationHint(publicUrl, durationSec)
          }
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
          file_url: publicUrl,
          file_name: file.name,
          file_size: file.size,
          content: caption?.trim() || null,
          reply_to_id: reply?.id ?? null,
          reply_to: reply?.message ?? null,
        })
        setUploadStatus(null)
      } catch (err) {
        setUploadStatus(null)
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
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setSendError(`ההודעה ארוכה מדי (מקסימום ${MAX_MESSAGE_LENGTH} תווים)`)
      return
    }
    setSending(true)
    setSendError(null)
    setShowEmoji(false)
    onTyping?.(false)

    if (editingMessage) {
      const editedAt = new Date().toISOString()
      const parsed = parseReplyContent(editingMessage.content)
      const formattedText = encodeFormattedMessage(trimmed, formatting)
      const nextContent =
        editingMessage.reply_to_id || !parsed
          ? formattedText
          : `↩ ${parsed.author}: ${parsed.preview}\n${formattedText}`
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
        setFormatting({ ...DEFAULT_MESSAGE_FORMATTING })
        setShowFormatting(false)
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
    if (!keepReplyAfterSend) onCancelReply?.()
    try {
      await sendMessage({
        content: encodeFormattedMessage(trimmed, formatting),
        type: "text",
        reply_to_id: replySnapshot?.id ?? null,
        reply_to: replySnapshot ?? null,
      })
      setFormatting({ ...DEFAULT_MESSAGE_FORMATTING })
      setShowFormatting(false)
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

    setActiveIndex(0)
    if (replySnapshot && !keepReplyAfterSend) onCancelReply?.()

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (!isAllowedMediaFile(item.file)) {
          setUploadError(UNSUPPORTED_MEDIA_MESSAGE)
          throw new Error(UNSUPPORTED_MEDIA_MESSAGE)
        }
        setActiveIndex(i)
        setUploadStatus({
          fileName: item.file.name,
          current: i + 1,
          total: items.length,
          fileProgress: 0,
        })

        if (item.file.size > MAX_MEDIA_BYTES) {
          setUploadError("הקובץ גדול מדי (מקסימום 50MB)")
          throw new Error("file too large")
        }
        const supabase = createClient()
        const ext = item.file.name.split(".").pop() || "bin"
        const path = `${currentUserId}/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

        const contentType = resolveFileMime(item.file)
        const { error } = await uploadMediaWithProgress(supabase, path, item.file, {
          contentType,
          upsert: false,
          onProgress: (p) => {
            setUploadStatus({
              fileName: item.file.name,
              current: i + 1,
              total: items.length,
              fileProgress: p.ratio,
            })
          },
        })
        if (error) {
          const msg = error.message.toLowerCase()
          if (msg.includes("bucket") || msg.includes("not found")) {
            setUploadError("חסר bucket בשם media ב־Supabase. הרץ את migration-private-media.sql")
          } else if (msg.includes("policy") || msg.includes("row-level") || msg.includes("security")) {
            setUploadError("אין הרשאה להעלות. הרץ את migration-private-media.sql ב־Supabase")
          } else if (msg.includes("mime") || msg.includes("type") || msg.includes("not allowed")) {
            setUploadError(UNSUPPORTED_MEDIA_MESSAGE)
          } else {
            setUploadError(error.message)
          }
          throw error
        }
        const publicUrl = mediaReferenceUrl(supabase, path)

        const captionText = item.caption.trim()
        await sendMessage({
          type: item.kind,
          file_url: publicUrl,
          file_name: item.file.name,
          file_size: item.file.size,
          content: captionText || null,
          reply_to_id: i === 0 ? (replySnapshot?.id ?? null) : null,
          reply_to: i === 0 ? (replySnapshot ?? null) : null,
        })
        sent.push(item)
      }
      setPending([])
      revokePending(sent)
    } catch (err) {
      const remaining = items.filter((item) => !sent.includes(item))
      setPending(remaining)
      setActiveIndex(0)
      revokePending(sent)
      setUploadError((prev) => prev || (err instanceof Error ? err.message : "העלאה נכשלה"))
    } finally {
      setSendingMedia(false)
      setUploadStatus(null)
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const discardRecordingPreview = () => {
    setRecordingPreview((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
  }

  const sendRecordingPreview = async () => {
    if (!recordingPreview || sendingRecording) return
    setSendingRecording(true)
    try {
      await uploadAndSend(
        recordingPreview.file,
        "audio",
        null,
        null,
        recordingPreview.durationSec,
      )
      discardRecordingPreview()
    } catch {
      // uploadAndSend sets uploadError
    } finally {
      setSendingRecording(false)
    }
  }

  const startRecording = async () => {
    try {
      discardRecordingPreview()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickVoiceRecorderMime()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      chunksRef.current = []
      discardRecordingRef.current = false
      recordingStartedAtRef.current = performance.now()
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        mediaRecorderRef.current = null
        const startedAt = recordingStartedAtRef.current
        recordingStartedAtRef.current = null
        const durationSec =
          startedAt != null ? Math.max(0.1, (performance.now() - startedAt) / 1000) : null
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false
          chunksRef.current = []
          return
        }
        if (chunksRef.current.length === 0) {
          setUploadError("ההקלטה ריקה — נסה שוב")
          return
        }
        const file = voiceRecordingFile(chunksRef.current, recorder.mimeType || mimeType)
        chunksRef.current = []
        const url = URL.createObjectURL(file)
        setRecordingPreview((current) => {
          if (current) URL.revokeObjectURL(current.url)
          return { file, url, durationSec: durationSec ?? 0.1 }
        })
      }
      mediaRecorderRef.current = recorder
      // Single blob (no timeslices) so playback can seek reliably
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
              disabled={sendingMedia}
              className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
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
                disabled={sendingMedia}
                className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
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
                  <div className="mt-1 text-sm text-white/50">{formatUploadFileSize(active.file.size)}</div>
                </div>
              </div>
            )}
            {sendingMedia && uploadStatus && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-[#0b141a]/75 backdrop-blur-[2px]"
                role="status"
                aria-label={`העלאת ${uploadStatus.fileName}`}
              >
                <div className="w-[min(86vw,360px)] rounded-2xl border border-white/10 bg-[#1f2c34] p-5 text-center text-white shadow-2xl">
                  <LoaderCircle className="mx-auto h-11 w-11 animate-spin text-[#00a884]" />
                  <div className="mt-3 truncate text-sm font-medium">{uploadStatus.fileName}</div>
                  <div className="mt-1 text-xs text-white/55">
                    {uploadStatus.total > 1
                      ? `${uploadStatus.current} / ${uploadStatus.total} · ${overallUploadPercent(uploadStatus)}%`
                      : `${overallUploadPercent(uploadStatus)}%`}
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#00a884] transition-[width] duration-150"
                      style={{
                        width: `${Math.max(2, overallUploadPercent(uploadStatus))}%`,
                      }}
                    />
                  </div>
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
                  disabled={sendingMedia}
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
                disabled={sendingMedia}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
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

      {uploadStatus && pending.length === 0 && (
        <div
          className="absolute -top-16 inset-x-4 z-30 flex items-center gap-3 rounded-xl border border-[var(--wa-border)] bg-[var(--wa-panel)] px-4 py-3 shadow-lg"
          role="status"
          aria-label={`העלאת ${uploadStatus.fileName}`}
          dir="rtl"
        >
          <LoaderCircle className="h-6 w-6 shrink-0 animate-spin text-[#00a884]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-sm font-medium text-[var(--wa-text)]">
                {uploadStatus.fileName}
              </div>
              <div className="shrink-0 text-xs text-[var(--wa-text-secondary)]" dir="ltr">
                {overallUploadPercent(uploadStatus)}%
              </div>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--wa-border)]">
              <div
                className="h-full rounded-full bg-[#00a884] transition-[width] duration-150"
                style={{ width: `${Math.max(2, overallUploadPercent(uploadStatus))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {replyTo && !isEditing && !threadMode && (
        <div className="flex items-stretch gap-2 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-4 pt-2" dir="rtl">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border-r-4 border-[#00a884] bg-[var(--wa-panel)] px-3 py-2">
            <Reply className="h-4 w-4 shrink-0 text-[#00a884]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-[#00a884]">{replyAuthor ?? "משתמש"}</div>
              <div className="truncate text-sm text-[var(--wa-text-secondary)]">{replyPreview(replyTo)}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-black/5"
            aria-label="ביטול תגובה"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {replyTo && !isEditing && threadMode && (
        <div className="border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-4 pt-2" dir="rtl">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-[#00a884]">
            <Reply className="h-3.5 w-3.5 shrink-0" />
            תגובה בשרשור
          </div>
        </div>
      )}

      {isEditing && editingMessage && (
        <div className="flex items-stretch gap-2 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-4 pt-2" dir="rtl">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border-r-4 border-[#53bdeb] bg-[var(--wa-panel)] px-3 py-2">
            <Pencil className="h-4 w-4 shrink-0 text-[#53bdeb]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-[#53bdeb]">עריכת הודעה</div>
              <div className="truncate text-sm text-[var(--wa-text-secondary)]">
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
            className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-black/5"
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
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--wa-panel)]" />
            מקליט... לחץ לעצירה ולהאזנה
          </button>
        </div>
      )}

      {recordingPreview && (
        <div
          className="flex items-center gap-2 border-t border-[var(--wa-border)] bg-[var(--wa-header)] px-4 py-2"
          dir="ltr"
        >
          <button
            type="button"
            onClick={discardRecordingPreview}
            disabled={sendingRecording}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#ea0038] transition hover:bg-black/5 disabled:opacity-40"
            aria-label="מחק הקלטה"
            title="מחק הקלטה"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <audio
            key={recordingPreview.url}
            src={recordingPreview.url}
            controls
            preload="metadata"
            className="h-10 min-w-0 flex-1 max-w-full"
            aria-label="תצוגה מקדימה של ההקלטה"
          />
          <button
            type="button"
            onClick={() => void sendRecordingPreview()}
            disabled={sendingRecording}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition hover:bg-[#06cf9c] disabled:opacity-50"
            aria-label="שלח הקלטה"
            title="שלח הקלטה"
          >
            {sendingRecording ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : (
              <SendHorizontal className="h-5 w-5 -scale-x-100" />
            )}
          </button>
        </div>
      )}

      {showEmoji && (
        <EmojiPicker id={emojiPickerId} onSelect={insertEmoji} onClose={closeEmojiPicker} />
      )}

      {showFormatting && (
        <div
          className="absolute bottom-16 left-2 right-2 z-20 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--wa-panel)] p-2.5 shadow-xl ring-1 ring-black/10 sm:left-auto sm:right-4"
          dir="rtl"
        >
          <button
            type="button"
            onClick={() => setFormatting((current) => ({ ...current, bold: !current.bold }))}
            aria-pressed={formatting.bold}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
              formatting.bold
                ? "bg-[var(--wa-accent-soft)] text-[var(--wa-teal)]"
                : "text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)]"
            }`}
            title="מודגש"
          >
            <Bold className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            onClick={() => setFormatting((current) => ({ ...current, italic: !current.italic }))}
            aria-pressed={formatting.italic}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
              formatting.italic
                ? "bg-[var(--wa-accent-soft)] text-[var(--wa-teal)]"
                : "text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)]"
            }`}
            title="נטוי"
          >
            <Italic className="h-4.5 w-4.5" />
          </button>
          <span className="mx-0.5 h-6 w-px bg-[var(--wa-border)]" />
          {MESSAGE_COLORS.map(({ value, label }) => (
            <button
              key={value ?? "default"}
              type="button"
              onClick={() => setFormatting((current) => ({ ...current, color: value }))}
              aria-label={`צבע ${label}`}
              aria-pressed={formatting.color === value}
              title={label}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                formatting.color === value ? "ring-2 ring-[var(--wa-teal)] ring-offset-2 ring-offset-[var(--wa-panel)]" : ""
              }`}
            >
              <span
                className="h-5 w-5 rounded-full border border-black/15"
                style={{ backgroundColor: value ?? "var(--wa-text)" }}
              />
            </button>
          ))}
        </div>
      )}

      {showAttach && (
        <div className="absolute bottom-16 right-14 z-20 flex flex-col gap-2 rounded-lg bg-[var(--wa-panel)] p-2 shadow-lg ring-1 ring-black/5">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--wa-text)] transition hover:bg-[var(--wa-header)]"
          >
            <ImageIcon className="h-5 w-5 text-[#007bfc]" />
            תמונות וסרטונים
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--wa-text)] transition hover:bg-[var(--wa-header)]"
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

      <form onSubmit={handleSendText} className="flex items-end gap-2 bg-[var(--wa-header)] px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            setShowFormatting((value) => !value)
            setShowEmoji(false)
            setShowAttach(false)
          }}
          className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 ${
            showFormatting || formatting.bold || formatting.italic || formatting.color
              ? "text-[var(--wa-teal)]"
              : "text-[var(--wa-text-secondary)]"
          }`}
          aria-label="עיצוב הודעה"
          aria-expanded={showFormatting}
          title="עיצוב הודעה"
        >
          <Palette className="h-5.5 w-5.5" />
        </button>
        {!isEditing && (
          <>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                rememberTextSelection()
                setShowEmoji((v) => !v)
                setShowAttach(false)
                setShowFormatting(false)
              }}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-black/5"
              aria-label="אמוג'י"
              aria-expanded={showEmoji}
              aria-controls={showEmoji ? emojiPickerId : undefined}
            >
              <Smile className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAttach((v) => !v)
                setShowEmoji(false)
                setShowFormatting(false)
              }}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-black/5"
              aria-label="צירוף קובץ"
            >
              {showAttach ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
            </button>
          </>
        )}
        {isEditing && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              rememberTextSelection()
              setShowEmoji((v) => !v)
              setShowAttach(false)
              setShowFormatting(false)
            }}
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-black/5"
            aria-label="אמוג'י"
            aria-expanded={showEmoji}
            aria-controls={showEmoji ? emojiPickerId : undefined}
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
            textSelectionRef.current = {
              start: e.target.selectionStart,
              end: e.target.selectionEnd,
            }
            onTyping?.(e.target.value.trim().length > 0)
          }}
          onClick={rememberTextSelection}
          onSelect={rememberTextSelection}
          onKeyUp={rememberTextSelection}
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
          className="max-h-[120px] min-h-[42px] flex-1 resize-none overflow-y-auto rounded-lg bg-[var(--wa-panel)] px-4 py-2.5 text-[15px] leading-[22px] text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-secondary)]"
          style={{
            fontWeight: formatting.bold ? 700 : undefined,
            fontStyle: formatting.italic ? "italic" : undefined,
            color: formatting.color ?? undefined,
          }}
        />

        {hasText || isEditing ? (
          <button
            type="submit"
            disabled={sending || !hasText}
            className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${
              isEditing
                ? "bg-[#00a884] text-white hover:bg-[#06cf9c]"
                : "text-[var(--wa-text-secondary)] hover:bg-black/5"
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
              recording ? "text-[#ea0038]" : "text-[var(--wa-text-secondary)]"
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
