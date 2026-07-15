"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { resolveMediaDisplayUrl } from "@/lib/media-url"

/** Resolve a stored media reference into a short-lived signed URL for display. */
export function useSignedMediaUrl(fileUrl: string | null | undefined): string | null {
  const [signed, setSigned] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!fileUrl) {
      setSigned(null)
      return
    }

    const supabase = createClient()
    void resolveMediaDisplayUrl(supabase, fileUrl).then((url) => {
      if (!cancelled) setSigned(url)
    })

    return () => {
      cancelled = true
    }
  }, [fileUrl])

  return signed
}
