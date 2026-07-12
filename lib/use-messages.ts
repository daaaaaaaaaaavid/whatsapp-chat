"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Message, MessageRead } from "@/lib/types"

export function useMessages(conversationId: string | null, currentUserId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const readsRef = useRef<Map<string, MessageRead[]>>(new Map())

  const attachReads = useCallback((msgs: Message[], reads: MessageRead[]) => {
    const map = new Map<string, MessageRead[]>()
    for (const r of reads) {
      const arr = map.get(r.message_id) ?? []
      arr.push(r)
      map.set(r.message_id, arr)
    }
    readsRef.current = map
    return msgs.map((m) => ({ ...m, reads: map.get(m.id) ?? [] }))
  }, [])

  const load = useCallback(async () => {
    if (!conversationId) {
      setMessages([])
      return
    }
    setLoading(true)
    const supabase = createClient()

    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })

    const msgIds = (msgs ?? []).map((m) => m.id)
    let reads: MessageRead[] = []
    if (msgIds.length) {
      const { data } = await supabase.from("message_reads").select("*").in("message_id", msgIds)
      reads = (data ?? []) as MessageRead[]
    }

    setMessages(attachReads((msgs ?? []) as Message[], reads))
    setLoading(false)
  }, [conversationId, attachReads])

  useEffect(() => {
    load()
  }, [load])

  // realtime subscription for this conversation
  useEffect(() => {
    if (!conversationId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, { ...newMsg, reads: [] }]
          })
        },
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, (payload) => {
        const read = payload.new as MessageRead
        setMessages((prev) =>
          prev.map((m) =>
            m.id === read.message_id
              ? { ...m, reads: [...(m.reads ?? []).filter((r) => r.user_id !== read.user_id), read] }
              : m,
          ),
        )
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  return { messages, loading, reload: load, setMessages }
}
