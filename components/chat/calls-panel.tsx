"use client"

import type { Conversation, Message, Profile } from "@/lib/types"
import { Avatar } from "./avatar"
import {
  convAvatarUrl,
  convDisplayName,
  isSelfConversation,
} from "@/lib/conversation-display"
import { parseCallSystemPayload } from "@/lib/call-system-message"
import { formatChatListTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/client"
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

type Props = {
  conversations: Conversation[]
  currentUser: Profile
  onCall: (conv: Conversation, video: boolean) => void
}

type CallRow = {
  id: string
  conv: Conversation
  missed: boolean
  video: boolean
  incoming: boolean
  outgoing: boolean
  label: string
  at: string
}

function rowFromMessage(
  msg: Message,
  conv: Conversation,
  currentUserId: string,
): CallRow | null {
  const payload = parseCallSystemPayload(msg.content)
  if (!payload) return null

  const missed = payload.event === "missed" || payload.event === "rejected"
  const incoming = payload.event === "incoming" || (missed && msg.sender_id !== currentUserId)
  const outgoing =
    payload.event === "outgoing" ||
    payload.event === "ended" ||
    (missed && msg.sender_id === currentUserId)

  let label = "שיחה"
  if (payload.event === "missed") label = "שיחה שלא נענתה"
  else if (payload.event === "rejected") label = "שיחה נדחתה"
  else if (payload.event === "ended") label = "שיחה שהסתיימה"
  else if (payload.event === "incoming") label = "שיחה נכנסת"
  else if (payload.event === "outgoing") label = "שיחה יוצאת"

  return {
    id: msg.id,
    conv,
    missed,
    video: payload.video,
    incoming,
    outgoing,
    label,
    at: msg.created_at,
  }
}

export function CallsPanel({ conversations, currentUser, onCall }: Props) {
  const [history, setHistory] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)

  const privateConvs = useMemo(
    () => conversations.filter((c) => !c.is_group && !isSelfConversation(c, currentUser.id)),
    [conversations, currentUser.id],
  )

  const convById = useMemo(() => {
    const map = new Map<string, Conversation>()
    for (const c of privateConvs) map.set(c.id, c)
    return map
  }, [privateConvs])

  useEffect(() => {
    let cancelled = false
    const ids = privateConvs.map((c) => c.id)
    if (!ids.length) {
      setHistory([])
      setLoading(false)
      return
    }

    ;(async () => {
      setLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, type, created_at")
        .in("conversation_id", ids)
        .eq("type", "system")
        .order("created_at", { ascending: false })
        .limit(80)

      if (cancelled) return

      const rows: CallRow[] = []
      const seenKeys = new Set<string>()
      for (const raw of data ?? []) {
        const msg = raw as Message
        const conv = convById.get(msg.conversation_id)
        if (!conv) continue
        const row = rowFromMessage(msg, conv, currentUser.id)
        if (!row) continue
        // Dedupe near-duplicate events for the same call minute (incoming+outgoing pair)
        const key = `${conv.id}-${row.label}-${row.video}-${Math.floor(new Date(row.at).getTime() / 60_000)}`
        if (seenKeys.has(key)) continue
        seenKeys.add(key)
        rows.push(row)
        if (rows.length >= 40) break
      }

      // Fallback: last_message call payloads if query returned empty (e.g. RLS / type filter)
      if (rows.length === 0) {
        for (const conv of privateConvs) {
          const last = conv.last_message
          if (!last) continue
          const row = rowFromMessage(last, conv, currentUser.id)
          if (row) rows.push({ ...row, id: last.id })
        }
        rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      }

      setHistory(rows)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [privateConvs, convById, currentUser.id])

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex h-16 items-center px-4">
        <h1 className="text-xl font-medium text-[#00a884]">שיחות</h1>
      </header>
      <div className="wa-scroll flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#667781]">טוען שיחות...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#667781]">
            אין היסטוריית שיחות עדיין. התחל שיחה מצ&apos;אט פרטי.
          </div>
        ) : (
          history.map(({ id, conv, missed, video, incoming, label, at }) => {
            const name = convDisplayName(conv, currentUser.id)
            const Icon = missed ? PhoneMissed : incoming ? PhoneIncoming : PhoneOutgoing
            return (
              <div
                key={id}
                className="flex w-full items-center gap-3 px-3 py-3 transition hover:bg-[#f5f6f6]"
              >
                <Avatar
                  name={name}
                  url={convAvatarUrl(conv, currentUser.id)}
                  isGroup={conv.is_group}
                  size={49}
                />
                <div className="flex min-w-0 flex-1 flex-col border-b border-[#e9edef] pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate ${missed ? "text-[#ea0038]" : "text-[#111b21]"}`}>
                      {name}
                    </span>
                    <span className="shrink-0 text-xs text-[#667781]">{formatChatListTime(at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-sm text-[#667781]">
                      <Icon className={`h-3.5 w-3.5 ${missed ? "text-[#ea0038]" : "text-[#25d366]"}`} />
                      {label}
                      {video ? " · וידאו" : ""}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onCall(conv, false)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[#54656f] hover:bg-black/5"
                        aria-label="התקשר"
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onCall(conv, true)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[#54656f] hover:bg-black/5"
                        aria-label="שיחת וידאו"
                      >
                        <Video className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
