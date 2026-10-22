"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { buildStatusFeed } from "@/lib/status-feed"
import type { Profile, Status } from "@/lib/types"

/** `statuses` is not in the realtime publication, so the list refreshes by polling. */
const REFRESH_MS = 60_000

export function useStatusFeed(currentUser: Profile, active: boolean) {
  const [statuses, setStatuses] = useState<Status[]>([])
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data, error: statusError } = await supabase
      .from("statuses")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
    if (statusError) {
      setError(statusError.message)
      setLoading(false)
      return
    }
    const rows = (data ?? []) as Status[]
    const uids = Array.from(new Set(rows.map((s) => s.user_id)))
    const othersIds = rows.filter((s) => s.user_id !== currentUser.id).map((s) => s.id)
    const [{ data: profiles }, { data: views }] = await Promise.all([
      uids.length
        ? supabase
            .from("profiles")
            .select("id, display_name, avatar_url, about, last_seen, created_at")
            .in("id", uids)
        : Promise.resolve({ data: [] as Profile[] }),
      othersIds.length
        ? supabase
            .from("status_views")
            .select("status_id")
            .eq("viewer_id", currentUser.id)
            .in("status_id", othersIds)
        : Promise.resolve({ data: [] as { status_id: string }[] }),
    ])
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]))
    pmap.set(currentUser.id, currentUser)
    setStatuses(rows.map((s) => ({ ...s, profile: pmap.get(s.user_id) })))
    setViewedIds((prev) => {
      const next = new Set(prev)
      for (const v of views ?? []) next.add(v.status_id)
      return next
    })
    setError(null)
    setLoading(false)
  }, [currentUser])

  useEffect(() => {
    if (!active) return
    void reload()
    const timer = window.setInterval(() => void reload(), REFRESH_MS)
    const onFocus = () => void reload()
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", onFocus)
    }
  }, [active, reload])

  const markViewed = useCallback((statusId: string) => {
    setViewedIds((prev) => {
      if (prev.has(statusId)) return prev
      const next = new Set(prev)
      next.add(statusId)
      return next
    })
  }, [])

  const removeStatus = useCallback((statusId: string) => {
    setStatuses((prev) => prev.filter((s) => s.id !== statusId))
  }, [])

  const feed = useMemo(
    () => buildStatusFeed(statuses, currentUser.id, viewedIds),
    [statuses, currentUser.id, viewedIds],
  )

  return { feed, viewedIds, loading, error, reload, markViewed, removeStatus }
}
