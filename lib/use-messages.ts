"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Message, MessageRead } from "@/lib/types"

export function useMessages(conversationId: string | null, currentUserId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const readsRef = useRef<Map<string, MessageRead[]>>(new Map())
  const conversationIdRef = useRef(conversationId)
  conversationIdRef.current = conversationId

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
      setLoading(false)
      return
    }
    const forId = conversationId
    setLoading(true)
    const supabase = createClient()

    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", forId)
      .order("created_at", { ascending: true })

    if (conversationIdRef.current !== forId) return

    const msgIds = (msgs ?? []).map((m) => m.id)
    let reads: MessageRead[] = []
    if (msgIds.length) {
      const { data } = await supabase.from("message_reads").select("*").in("message_id", msgIds)
      reads = (data ?? []) as MessageRead[]
    }

    if (conversationIdRef.current !== forId) return
    const withReads = attachReads((msgs ?? []) as Message[], reads)
    const byId = new Map(withReads.map((m) => [m.id, m]))
    const withReplies = withReads.map((m) => ({
      ...m,
      reply_to: m.reply_to_id ? (byId.get(m.reply_to_id) ?? null) : null,
    }))
    setMessages((prev) => {
      const pending = prev.filter(
        (m) => m.pending && m.conversation_id === forId && !(msgs ?? []).some((s) => s.id === m.id),
      )
      return [...withReplies, ...pending]
    })
    setLoading(false)
  }, [conversationId, attachReads])

  const addOptimistic = useCallback((message: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev
      return [...prev, message]
    })
  }, [])

  const confirmOptimistic = useCallback((tempId: string, real: Message) => {
    setMessages((prev) => {
      const withoutDup = prev.filter((m) => m.id !== real.id && m.id !== tempId)
      return [...withoutDup, { ...real, pending: false, reads: real.reads ?? [] }]
    })
  }, [])

  const failOptimistic = useCallback((tempId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== tempId))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!conversationId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`messages-view-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages((prev) => {
            const replyTo =
              newMsg.reply_to_id != null
                ? (prev.find((m) => m.id === newMsg.reply_to_id) ?? null)
                : null
            const hydrated = { ...newMsg, reply_to: replyTo, reads: [] as MessageRead[], pending: false }
            if (prev.some((m) => m.id === newMsg.id)) {
              return prev.map((m) =>
                m.id === newMsg.id ? { ...hydrated, reads: m.reads ?? [] } : m,
              )
            }
            // Replace matching optimistic bubble from the same sender
            const tempIdx = prev.findIndex(
              (m) =>
                m.pending &&
                m.sender_id === newMsg.sender_id &&
                m.type === newMsg.type &&
                (m.content ?? null) === (newMsg.content ?? null) &&
                (m.file_url ?? null) === (newMsg.file_url ?? null),
            )
            if (tempIdx >= 0) {
              const next = [...prev]
              next[tempIdx] = hydrated
              return next
            }
            return [...prev, hydrated]
          })
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const updated = payload.new as Message
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)))
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

  return {
    messages,
    loading,
    reload: load,
    setMessages,
    addOptimistic,
    confirmOptimistic,
    failOptimistic,
  }
}
