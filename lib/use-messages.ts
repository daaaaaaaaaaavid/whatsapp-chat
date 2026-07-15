"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Message, MessageRead } from "@/lib/types"

export const MESSAGE_PAGE_SIZE = 50

export function useMessages(conversationId: string | null, currentUserId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
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

  const hydrateReplies = useCallback((msgs: Message[]) => {
    const byId = new Map(msgs.map((m) => [m.id, m]))
    return msgs.map((m) => ({
      ...m,
      reply_to: m.reply_to_id ? (byId.get(m.reply_to_id) ?? m.reply_to ?? null) : null,
    }))
  }, [])

  const loadReads = useCallback(async (msgIds: string[]) => {
    if (!msgIds.length) return [] as MessageRead[]
    const supabase = createClient()
    const { data } = await supabase.from("message_reads").select("*").in("message_id", msgIds)
    return (data ?? []) as MessageRead[]
  }, [])

  const load = useCallback(async () => {
    if (!conversationId) {
      setMessages([])
      setHasMore(false)
      setLoading(false)
      return
    }
    const forId = conversationId
    setLoading(true)
    const supabase = createClient()

    // Latest page first (descending), then reverse for chronological UI
    const { data: msgs, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", forId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE)

    if (conversationIdRef.current !== forId) return

    if (error) {
      console.error("Failed to load messages:", error.message)
      setMessages([])
      setHasMore(false)
      setLoading(false)
      return
    }

    const page = ([...(msgs ?? [])] as Message[]).reverse()
    setHasMore((msgs ?? []).length >= MESSAGE_PAGE_SIZE)

    const reads = await loadReads(page.map((m) => m.id))
    if (conversationIdRef.current !== forId) return

    const withReads = hydrateReplies(attachReads(page, reads))
    setMessages((prev) => {
      const pending = prev.filter(
        (m) => m.pending && m.conversation_id === forId && !page.some((s) => s.id === m.id),
      )
      return [...withReads, ...pending]
    })
    setLoading(false)
  }, [conversationId, attachReads, hydrateReplies, loadReads])

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder || !hasMore) return
    const oldest = messages.find((m) => !m.pending)
    if (!oldest) return

    const forId = conversationId
    setLoadingOlder(true)
    const supabase = createClient()

    const { data: msgs, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", forId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE)

    if (conversationIdRef.current !== forId) {
      setLoadingOlder(false)
      return
    }

    if (error) {
      console.error("Failed to load older messages:", error.message)
      setLoadingOlder(false)
      return
    }

    const page = ([...(msgs ?? [])] as Message[]).reverse()
    setHasMore((msgs ?? []).length >= MESSAGE_PAGE_SIZE)

    const reads = await loadReads(page.map((m) => m.id))
    if (conversationIdRef.current !== forId) {
      setLoadingOlder(false)
      return
    }

    const withReads = hydrateReplies(attachReads(page, reads))
    setMessages((prev) => {
      const existing = new Set(prev.map((m) => m.id))
      const fresh = withReads.filter((m) => !existing.has(m.id))
      return hydrateReplies([...fresh, ...prev])
    })
    setLoadingOlder(false)
  }, [
    conversationId,
    loadingOlder,
    hasMore,
    messages,
    attachReads,
    hydrateReplies,
    loadReads,
  ])

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
    loadingOlder,
    hasMore,
    loadOlder,
    reload: load,
    setMessages,
    addOptimistic,
    confirmOptimistic,
    failOptimistic,
  }
}
