"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchMyWorkSpaces } from "@/lib/space-actions"
import type { WorkSpace } from "@/lib/types"

export function useWorkSpaces(currentUserId: string, enabled: boolean) {
  const [spaces, setSpaces] = useState<WorkSpace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      setSpaces([])
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await fetchMyWorkSpaces(currentUserId)
    setSpaces(res.spaces)
    setError(res.error)
    setLoading(false)
  }, [currentUserId, enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  return { spaces, loading, error, reload }
}
