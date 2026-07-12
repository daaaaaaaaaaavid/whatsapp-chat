"use client"

import type { Message, Participant } from "@/lib/types"
import { formatTime, formatFileSize, avatarColor } from "@/lib/format"
import { MessageTicks } from "./message-ticks"
import { FileText, Download } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  message: Message
  isMine: boolean
  isGroup: boolean
  showSenderName: boolean
  participants: Participant[]
  totalOthers: number
}

export function MessageBubble({ message, isMine, isGroup, showSenderName, participants, totalOthers }: Props) {
  const senderProfile = participants.find((p) => p.user_id === message.sender_id)?.profile
  const senderName = senderProfile?.display_name ?? senderProfile?.email ?? "משתמש"

  const readCount = (message.reads ?? []).filter((r) => r.user_id !== message.sender_id).length
  let status: "sent" | "delivered" | "read" = "sent"
  if (readCount > 0) status = readCount >= totalOthers && totalOthers > 0 ? "read" : "delivered"

  return (
    <div className={cn("flex px-2", isMine ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "relative my-0.5 max-w-[65%] rounded-lg px-2.5 py-1.5 shadow-sm",
          isMine ? "bubble-tail-out rounded-tl-none bg-[#d9fdd3]" : "bubble-tail-in rounded-tr-none bg-white",
        )}
      >
        {isGroup && !isMine && showSenderName && (
          <div className="mb-0.5 text-xs font-medium" style={{ color: avatarColor(senderName) }}>
            {senderName}
          </div>
        )}

        {message.type === "image" && message.file_url && (
          <img
            src={message.file_url || "/placeholder.svg"}
            alt="תמונה"
            className="mb-1 max-h-80 w-full max-w-xs rounded-md object-cover"
          />
        )}

        {message.type === "video" && message.file_url && (
          <video src={message.file_url} controls className="mb-1 max-h-80 w-full max-w-xs rounded-md" />
        )}

        {message.type === "audio" && message.file_url && (
          <audio src={message.file_url} controls className="mb-1 w-56 max-w-full" />
        )}

        {message.type === "file" && message.file_url && (
          <a
            href={message.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-1 flex items-center gap-3 rounded-md bg-black/5 p-2.5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884]/15">
              <FileText className="h-5 w-5 text-[#00a884]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-[#111b21]">{message.file_name}</div>
              <div className="text-xs text-[#667781]">{message.file_size ? formatFileSize(message.file_size) : ""}</div>
            </div>
            <Download className="h-4 w-4 text-[#667781]" />
          </a>
        )}

        {message.content && (
          <span className="whitespace-pre-wrap break-words text-[15px] leading-[19px] text-[#111b21]">
            {message.content}
          </span>
        )}

        <span className="float-left mr-2 mt-1 flex items-center gap-1 text-[11px] text-[#667781]">
          {formatTime(message.created_at)}
          {isMine && <MessageTicks status={status} />}
        </span>
      </div>
    </div>
  )
}
