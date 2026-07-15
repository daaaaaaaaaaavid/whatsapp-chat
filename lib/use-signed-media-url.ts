"use client"

import { useCallback, useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { resolveMediaDisplayUrl, SIGNED_TTL_SECONDS } from "@/lib/media-url"

/** Refresh a bit before the signed URL expires. */
const REFRESH_AFTER_MS = Math.max(60_000, (SIGNED_TTL_SECONDS - 5 * 60) * 1000)

/** Resolve a stored media reference into a short-lived signed URL for display. */
export function useSignedMediaUrl(fileUrl: string | null | undefined): string | null {
  const [signed, setSigned] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => {
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    let refreshTimer: ReturnType<typeof setTimeout> | undefined

    if (!fileUrl) {
      setSigned(null)
      return
    }

    const supabase = createClient()
    void resolveMediaDisplayUrl(supabase, fileUrl).then((url) => {
      if (cancelled) return
      setSigned(url)
      if (url) {
        refreshTimer = setTimeout(() => {
          if (!cancelled) refresh()
        }, REFRESH_AFTER_MS)
      }
    })

    return () => {
      cancelled = true
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  }, [fileUrl, tick, refresh])

  return signed
}

/** Signed URL plus explicit refresh (e.g. after audio/media load failure). */
export function useSignedMediaUrlControls(fileUrl: string | null | undefined): {
  url: string | null
  loading: boolean
  refresh: () => void
} {
  const [signed, setSigned] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(fileUrl))
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => {
    setTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    let refreshTimer: ReturnType<typeof setTimeout> | undefined

    if (!fileUrl) {
      setSigned(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const supabase = createClient()
    void resolveMediaDisplayUrl(supabase, fileUrl).then((url) => {
      if (cancelled) return
      setSigned(url)
      setLoading(false)
      if (url) {
        refreshTimer = setTimeout(() => {
          if (!cancelled) refresh()
        }, REFRESH_AFTER_MS)
      }
    })

    return () => {
      cancelled = true
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  }, [fileUrl, tick, refresh])

  return { url: signed, loading, refresh }
}
