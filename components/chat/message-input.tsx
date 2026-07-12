"use client"

import type React from "react"

import { useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { MessageType } from "@/lib/types"
import { Paperclip, SendHorizontal, Smile, X, ImageIcon, FileText } from "lucide-react"

type Props = {
  conversationId: string
  currentUserId: string
  onSent: () => void
}

const EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "🤔", "😢", "😡", "👍", "🙏", "❤️", "🔥", "🎉", "💯", "😴", "🤗"]

export function MessageInput({ conversationId, currentUserId, onSent }: Props) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const sendMessage = async (payload: {
    content?: string
    type?: MessageType
    file_url?: string
    file_name?: string
    file_size?: number
  }) => {
    const supabase = createClient()
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: payload.content ?? null,
      type: payload.type ?? "text",
      file_url: payload.file_url ?? null,
      file_name: payload.file_name ?? null,
      file_size: payload.file_size ?? null,
    })
    if (error) throw error
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)
    onSent()
  }

  const handleSendText = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText("")
    setShowEmoji(false)
    try {
      await sendMessage({ content: trimmed, type: "text" })
    } finally {
      setSending(false)
    }
  }

  const handleFile = async (file: File, kind: "image" | "file") => {
    setShowAttach(false)
    setUploadProgress("מעלה...")
    const supabase = createClient()
    const ext = file.name.split(".").pop()
    const path = `${currentUserId}/${conversationId}/${Date.now()}.${ext}`

    const { error } = await supabase.storage.from("media").upload(path, file)
    if (error) {
      setUploadProgress(null)
      return
    }
    const { data } = supabase.storage.from("media").getPublicUrl(path)

    let type: MessageType = "file"
    if (kind === "image") {
      if (file.type.startsWith("image/")) type = "image"
      else if (file.type.startsWith("video/")) type = "video"
    }

    await sendMessage({
      type,
      file_url: data.publicUrl,
      file_name: file.name,
      file_size: file.size,
    })
    setUploadProgress(null)
  }

  return (
    <div className="relative">
      {uploadProgress && (
        <div className="absolute -top-8 right-4 rounded-full bg-[#00a884] px-3 py-1 text-xs text-white">
          {uploadProgress}
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
          {showAttach ? <X className="h-6 w-6" /> : <Paperclip className="h-6 w-6" />}
        </button>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              if (e.nativeEvent.isComposing) return
              e.preventDefault()
              void handleSendText()
            }
          }}
          placeholder="הקלד הודעה"
          className="flex-1 rounded-lg bg-white px-4 py-2.5 text-[15px] text-[#111b21] outline-none placeholder:text-[#667781]"
        />

        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5 disabled:opacity-40"
          aria-label="שלח"
        >
          <SendHorizontal className="h-6 w-6 -scale-x-100" />
        </button>
      </form>
    </div>
  )
}
