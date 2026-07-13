"use client"

import type React from "react"

import { useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Message, MessageType } from "@/lib/types"
import { parseCallSystemPayload, callSystemLabel } from "@/lib/call-system-message"
import { notifyOfflineRecipients } from "@/lib/push-client"
import { messagePreview } from "@/lib/conversation-display"
import { Plus, SendHorizontal, Smile, X, ImageIcon, FileText, Mic, Reply } from "lucide-react"

type Props = {
  conversationId: string
  currentUserId: string
  onOptimistic?: (message: Message) => void
  onSent: (message: Message, tempId: string) => void
  onSendFailed?: (tempId: string) => void
  replyTo?: Message | null
  replyAuthor?: string | null
  onCancelReply?: () => void
  onTyping?: (typing: boolean) => void
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

export function MessageInput({
  conversationId,
  currentUserId,
  onOptimistic,
  onSent,
  onSendFailed,
  replyTo,
  replyAuthor,
  onCancelReply,
  onTyping,
}: Props) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const sendMessage = async (payload: {
    content?: string
    type?: MessageType
    file_url?: string
    file_name?: string
    file_size?: number
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
      created_at: createdAt,
      pending: true,
      reads: [],
    }
    onOptimistic?.(optimistic)

    const supabase = createClient()
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: payload.content ?? null,
        type: payload.type ?? "text",
        file_url: payload.file_url ?? null,
        file_name: payload.file_name ?? null,
        file_size: payload.file_size ?? null,
      })
      .select("*")
      .single()
    if (error) {
      onSendFailed?.(tempId)
      throw error
    }
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)

    const real = { ...(data as Message), pending: false, reads: [] }
    onSent(real, tempId)
    notifyOfflineRecipients({
      conversationId,
      messageId: real.id,
      body: messagePreview(real),
    })
    return real
  }

  const handleSendText = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setSendError(null)
    setText("")
    setShowEmoji(false)
    const quoted = replyTo
      ? `↩ ${replyAuthor ?? "משתמש"}: ${replyPreview(replyTo)}\n${trimmed}`
      : trimmed
    onCancelReply?.()
    onTyping?.(false)
    try {
      await sendMessage({ content: quoted, type: "text" })
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "שליחה נכשלה")
      setText(trimmed)
    } finally {
      setSending(false)
    }
  }

  const handleFile = async (file: File, kind: "image" | "file" | "audio") => {
    setShowAttach(false)
    setUploadProgress("מעלה...")
    setUploadError(null)
    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() || "bin"
      const path = `${currentUserId}/${conversationId}/${Date.now()}.${ext}`

      const { error } = await supabase.storage.from("media").upload(path, file)
      if (error) {
        const msg = error.message.toLowerCase()
        if (msg.includes("bucket") || msg.includes("not found")) {
          setUploadError("חסר bucket בשם media ב־Supabase. הרץ את migration-media-storage.sql")
        } else if (msg.includes("policy") || msg.includes("row-level") || msg.includes("security")) {
          setUploadError("אין הרשאה להעלות. הרץ את migration-media-storage.sql ב־Supabase")
        } else {
          setUploadError(error.message)
        }
        setUploadProgress(null)
        return
      }
      const { data } = supabase.storage.from("media").getPublicUrl(path)

      let type: MessageType = "file"
      const lower = file.name.toLowerCase()
      if (kind === "audio" || file.type.startsWith("audio/")) {
        type = "audio"
      } else if (file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi|mkv|3gp)$/.test(lower)) {
        type = "video"
      } else if (file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|heic|avif)$/.test(lower)) {
        type = "image"
      } else if (kind === "image") {
        type = "image"
      }

      await sendMessage({
        type,
        file_url: data.publicUrl,
        file_name: file.name,
        file_size: file.size,
      })
      setUploadProgress(null)
    } catch (err) {
      setUploadProgress(null)
      setUploadError(err instanceof Error ? err.message : "העלאה נכשלה")
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
        await handleFile(file, "audio")
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      // Fallback: pick an audio file if mic permission denied
      audioInputRef.current?.click()
    }
  }

  const hasText = Boolean(text.trim())

  return (
    <div className="relative">
      {uploadProgress && (
        <div className="absolute -top-8 right-4 rounded-full bg-[#00a884] px-3 py-1 text-xs text-white">
          {uploadProgress}
        </div>
      )}

      {replyTo && (
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
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f, "image")
          e.target.value = ""
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f, "file")
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
          if (f) handleFile(f, "audio")
          e.target.value = ""
        }}
      />

      <form onSubmit={handleSendText} className="flex items-center gap-2 bg-[#f0f2f5] px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            setShowEmoji((v) => !v)
            setShowAttach(false)
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5"
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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5"
          aria-label="צירוף קובץ"
        >
          {showAttach ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </button>

        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            onTyping?.(e.target.value.trim().length > 0)
          }}
          onBlur={() => onTyping?.(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              if (e.nativeEvent.isComposing) return
              e.preventDefault()
              onTyping?.(false)
              void handleSendText()
            }
          }}
          placeholder="הקלדת הודעה"
          className="flex-1 rounded-lg bg-white px-4 py-2.5 text-[15px] text-[#111b21] outline-none placeholder:text-[#667781]"
        />

        {hasText ? (
          <button
            type="submit"
            disabled={sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5 disabled:opacity-40"
            aria-label="שלח"
          >
            <SendHorizontal className="h-6 w-6 -scale-x-100" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (recording ? stopRecording() : startRecording())}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5 ${
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
}
