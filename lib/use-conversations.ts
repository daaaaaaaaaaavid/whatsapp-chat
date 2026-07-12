"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Conversation, Message, Participant, Profile } from "@/lib/types"

export function useConversations(currentUserId: string) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()

    // conversations the user participates in
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

    // participants for all conversations
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("*")
      .in("conversation_id", ids)

    const profileIds = Array.from(new Set((parts ?? []).map((p) => p.user_id)))
    const { data: profiles } = await supabase.from("profiles").select("*").in("id", profileIds)
    const profileMap = new Map<string, Profile>((profiles ?? []).map((p) => [p.id, p as Profile]))

    // last message per conversation
    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })

    const lastMsgMap = new Map<string, Message>()
    const unreadMap = new Map<string, number>()
    for (const m of msgs ?? []) {
      if (!lastMsgMap.has(m.conversation_id)) {
        lastMsgMap.set(m.conversation_id, m as Message)
      }
    }

    // unread counts: messages not sent by me and not read by me
    const { data: myReads } = await supabase
      .from("message_reads")
      .select("message_id")
      .eq("user_id", currentUserId)
    const readSet = new Set((myReads ?? []).map((r) => r.message_id))
    for (const m of msgs ?? []) {
      if (m.sender_id !== currentUserId && !readSet.has(m.id)) {
        unreadMap.set(m.conversation_id, (unreadMap.get(m.conversation_id) ?? 0) + 1)
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

  useEffect(() => {
    load()
  }, [load])

  // realtime: also refresh when conversations themselves change
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("conversations-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reads" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_participants" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => load())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  return { conversations, loading, reload: load }
}
