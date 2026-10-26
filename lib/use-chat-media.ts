"use client"

import { useCallback, useEffect, useState } from "react"
import { isDriveMediaUrl } from "@/lib/google-drive"
import { messageMediaStreamUrl } from "@/lib/message-media"
import { useDriveOptional } from "@/components/chat/drive-provider"
import { useSignedMediaUrlControls } from "@/lib/use-signed-media-url"

const blobCache = new Map<string, string>()

export function useChatMediaDisplay(
  fileUrl: string | null | undefined,
  opts?: { enabled?: boolean; messageId?: string | null },
): {
  url: string | null
  loading: boolean
  needsDownload: boolean
  isDrive: boolean
  refresh: () => void
} {
  const enabled = opts?.enabled !== false
  const drive = useDriveOptional()
  const isDrive = isDriveMediaUrl(fileUrl)
  const signed = useSignedMediaUrlControls(isDrive || !enabled ? null : fileUrl)
  const streamMessageId = enabled && isDrive && opts?.messageId ? opts.messageId : null
  const viewFileId = streamMessageId
    ? null
    : enabled && isDrive
      ? (drive?.viewFileId(fileUrl) ?? null)
      : null
  const needsDownload = Boolean(enabled && isDrive && !viewFileId && !streamMessageId)
  const [blobUrl, setBlobUrl] = useState<string | null>(() =>
    viewFileId ? blobCache.get(viewFileId) ?? null : null,
  )
  const [loading, setLoading] = useState(() => Boolean(viewFileId && !blobCache.get(viewFileId ?? "")))
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => {
    if (viewFileId) blobCache.delete(viewFileId)
    setTick((n) => n + 1)
  }, [viewFileId])

  useEffect(() => {
    if (!enabled || !isDrive || !viewFileId || !drive) {
      if (!viewFileId) setBlobUrl(null)
      setLoading(false)
      return
    }

    const cached = blobCache.get(viewFileId)
    if (cached) {
      setBlobUrl(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    let cancelled = false
    void drive
      .downloadBlob(viewFileId)
      .then((blob) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        const prev = blobCache.get(viewFileId)
        if (prev && prev !== url) URL.revokeObjectURL(prev)
        blobCache.set(viewFileId, url)
        setBlobUrl(url)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setBlobUrl(null)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [drive, enabled, isDrive, tick, viewFileId])

  if (!enabled) {
    return { url: null, loading: false, needsDownload: false, isDrive, refresh }
  }
  if (streamMessageId) {
    return {
      url: messageMediaStreamUrl(streamMessageId),
      loading: false,
      needsDownload: false,
      isDrive: true,
      refresh,
    }
  }
  if (!isDrive) {
    return {
      url: signed.url,
      loading: signed.loading,
      needsDownload: false,
      isDrive: false,
      refresh: signed.refresh,
    }
  }
  return {
    url: blobUrl,
    loading,
    needsDownload,
    isDrive: true,
    refresh,
  }
}
