"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Conversation, Message, Participant, Profile } from "@/lib/types"

type SummaryRow = {
  conversation_id: string
  last_message_id: string | null
  last_message_content: string | null
  last_message_type: string | null
  last_message_sender_id: string | null
  last_message_created_at: string | null
  last_message_file_name: string | null
  last_message_deleted_at: string | null
  unread_count: number | string | null
}

function summaryToMessage(row: SummaryRow): Message | null {
  if (!row.last_message_id || !row.last_message_created_at || !row.last_message_sender_id) {
    return null
  }
  return {
    id: row.last_message_id,
    conversation_id: row.conversation_id,
    sender_id: row.last_message_sender_id,
    content: row.last_message_content,
    type: (row.last_message_type as Message["type"]) || "text",
    file_url: null,
    file_name: row.last_message_file_name,
    file_size: null,
    reply_to_id: null,
    created_at: row.last_message_created_at,
    edited_at: null,
    deleted_at: row.last_message_deleted_at,
    is_forwarded: false,
    reads: [],
  }
}

async function fetchLastMessageMapLegacy(
  conversationIds: string[],
): Promise<Map<string, Message>> {
  const supabase = createClient()
  const lastMsgMap = new Map<string, Message>()
  if (!conversationIds.length) return lastMsgMap

  // One query per conversation (capped concurrency) — avoids bulk O(n*30) scans
  const concurrency = 8
  for (let i = 0; i < conversationIds.length; i += concurrency) {
    const slice = conversationIds.slice(i, i + concurrency)
    await Promise.all(
      slice.map(async (id) => {
        const { data } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (data) lastMsgMap.set(id, data as Message)
      }),
    )
  }

  const lastIds = [...lastMsgMap.values()].map((m) => m.id)
  if (lastIds.length) {
    const { data: reads } = await supabase
      .from("message_reads")
      .select("*")
      .in("message_id", lastIds)
    const byMsg = new Map<string, NonNullable<Message["reads"]>>()
    for (const r of reads ?? []) {
      const arr = byMsg.get(r.message_id) ?? []
      arr.push(r)
      byMsg.set(r.message_id, arr)
    }
    for (const [cid, msg] of lastMsgMap) {
      lastMsgMap.set(cid, { ...msg, reads: byMsg.get(msg.id) ?? [] })
    }
  }

  return lastMsgMap
}

export function useConversations(currentUserId: string) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()

    const { data: myParts } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", currentUserId)

    const ids = (myParts ?? []).map((p) => p.conversation_id)
    if (ids.length === 0) {
      setConversations([])
      setLoading(false)
      return
    }

    const { data: convs } = await supabase
      .from("conversations")
      .select("*")
      .in("id", ids)
      .order("updated_at", { ascending: false })

    if (!convs) {
      setConversations([])
      setLoading(false)
      return
    }

    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("*")
      .in("conversation_id", ids)

    const profileIds = Array.from(new Set((parts ?? []).map((p) => p.user_id)))
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, about, last_seen, created_at")
      .in("id", profileIds)
    const profileMap = new Map<string, Profile>((profiles ?? []).map((p) => [p.id, p as Profile]))

    const lastMsgMap = new Map<string, Message>()
    const unreadMap = new Map<string, number>()

    const { data: summaries, error: summaryError } = await supabase.rpc("my_conversation_summaries")
    if (!summaryError && Array.isArray(summaries)) {
      for (const row of summaries as SummaryRow[]) {
        const msg = summaryToMessage(row)
        if (msg) lastMsgMap.set(row.conversation_id, msg)
        unreadMap.set(row.conversation_id, Number(row.unread_count ?? 0))
      }
      // Attach read receipts for last-message ticks
      const lastIds = [...lastMsgMap.values()].map((m) => m.id)
      if (lastIds.length) {
        const { data: reads } = await supabase
          .from("message_reads")
          .select("*")
          .in("message_id", lastIds)
        const byMsg = new Map<string, NonNullable<Message["reads"]>>()
        for (const r of reads ?? []) {
          const arr = byMsg.get(r.message_id) ?? []
          arr.push(r)
          byMsg.set(r.message_id, arr)
        }
        for (const [cid, msg] of lastMsgMap) {
          lastMsgMap.set(cid, { ...msg, reads: byMsg.get(msg.id) ?? [] })
        }
      }
    } else {
      // Fallback before my_conversation_summaries migration is applied
      const legacy = await fetchLastMessageMapLegacy(ids)
      for (const [cid, msg] of legacy) lastMsgMap.set(cid, msg)

      // Approximate unread: messages after last read of the last message only
      // (full unread requires the summaries RPC — keep this light)
      for (const [cid, msg] of lastMsgMap) {
        if (msg.sender_id === currentUserId) {
          unreadMap.set(cid, 0)
          continue
        }
        const reads = msg.reads ?? []
        const seen = reads.some((r) => r.user_id === currentUserId)
        unreadMap.set(cid, seen ? 0 : 1)
      }
    }

    const enriched: Conversation[] = convs.map((c) => {
      const cParts: Participant[] = (parts ?? [])
        .filter((p) => p.conversation_id === c.id)
        .map((p) => ({ ...p, profile: profileMap.get(p.user_id) }))
      return {
        ...c,
        participants: cParts,
        last_message: lastMsgMap.get(c.id) ?? null,
        unread_count: unreadMap.get(c.id) ?? 0,
      }
    })

    enriched.sort((a, b) => {
      const at = a.last_message?.created_at ?? a.updated_at
      const bt = b.last_message?.created_at ?? b.updated_at
      return new Date(bt).getTime() - new Date(at).getTime()
    })

    setConversations(enriched)
    setLoading(false)
  }, [currentUserId])

  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    reloadTimerRef.current = setTimeout(() => {
      void load()
    }, 400)
  }, [load])

  const upsertLastMessage = useCallback((message: Message, opts?: { bumpUnread?: boolean }) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === message.conversation_id)
      if (idx < 0) {
        scheduleReload()
        return prev
      }
      const conv = prev[idx]
      const prevLast = conv.last_message
      const isNewer =
        !prevLast ||
        new Date(message.created_at).getTime() >= new Date(prevLast.created_at).getTime()

      const nextUnread =
        opts?.bumpUnread && message.sender_id !== currentUserId
          ? (conv.unread_count ?? 0) + 1
          : conv.unread_count

      const updated: Conversation = {
        ...conv,
        updated_at: isNewer ? message.created_at : conv.updated_at,
        last_message: isNewer ? { ...message, reads: message.reads ?? prevLast?.reads ?? [] } : prevLast,
        unread_count: nextUnread,
      }

      const rest = prev.filter((_, i) => i !== idx)
      return [updated, ...rest].sort((a, b) => {
        const at = a.last_message?.created_at ?? a.updated_at
        const bt = b.last_message?.created_at ?? b.updated_at
        return new Date(bt).getTime() - new Date(at).getTime()
      })
    })
  }, [currentUserId, scheduleReload])

  const clearUnread = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c)),
    )
  }, [])

  const removeConversation = useCallback((conversationId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== conversationId))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("conversations-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message
        upsertLastMessage(msg, { bumpUnread: true })
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Message
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== msg.conversation_id) return c
            if (c.last_message?.id !== msg.id) return c
            return { ...c, last_message: { ...c.last_message, ...msg } }
          }),
        )
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, (payload) => {
        const read = payload.new as { message_id: string; user_id: string; read_at: string; id: string }
        setConversations((prev) =>
          prev.map((c) => {
            const last = c.last_message
            if (!last || last.id !== read.message_id) return c
            const reads = [...(last.reads ?? []).filter((r) => r.user_id !== read.user_id), read]
            return { ...c, last_message: { ...last, reads } }
          }),
        )
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants" }, () =>
        scheduleReload(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () =>
        scheduleReload(),
      )
      .subscribe()

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [scheduleReload, upsertLastMessage])

  return {
    conversations,
    loading,
    reload: load,
    upsertLastMessage,
    clearUnread,
    removeConversation,
  }
}
