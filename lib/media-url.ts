import type { SupabaseClient } from "@supabase/supabase-js"

const MEDIA_BUCKET = "media"
export const SIGNED_TTL_SECONDS = 60 * 60 // 1 hour

/** Treat cached URLs as stale this early so refresh can overlap expiry. */
const CACHE_SKEW_MS = 5 * 60 * 1000

type SignedCacheEntry = {
  signedUrl: string
  expiresAt: number
}

const signedUrlCache = new Map<string, SignedCacheEntry>()
const signedUrlInflight = new Map<string, Promise<string | null>>()

function withFileUrlFragment(signedUrl: string, fileUrl: string): string {
  const hashIdx = fileUrl.indexOf("#")
  if (hashIdx >= 0) return `${signedUrl}${fileUrl.slice(hashIdx)}`
  return signedUrl
}

function cacheKeyForFileUrl(fileUrl: string): string | null {
  return parseMediaStoragePath(fileUrl)
}

function readFreshCache(path: string): string | null {
  const entry = signedUrlCache.get(path)
  if (!entry) return null
  if (entry.expiresAt <= Date.now() + CACHE_SKEW_MS) {
    signedUrlCache.delete(path)
    return null
  }
  return entry.signedUrl
}

/** Drop a cached signed URL (e.g. after a media load failure / forced refresh). */
export function invalidateMediaDisplayUrl(fileUrl: string | null | undefined): void {
  if (!fileUrl) return
  const path = cacheKeyForFileUrl(fileUrl)
  if (!path) return
  signedUrlCache.delete(path)
}

/** Sync peek at a still-valid cached display URL (avoids avatar flash on remount). */
export function peekCachedMediaDisplayUrl(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null
  const path = cacheKeyForFileUrl(fileUrl)
  if (!path) return fileUrl
  const signed = readFreshCache(path)
  return signed ? withFileUrlFragment(signed, fileUrl) : null
}

/** Test helper — clears signed URL cache/inflight maps. */
export function clearSignedMediaUrlCacheForTests(): void {
  signedUrlCache.clear()
  signedUrlInflight.clear()
}

/** Extract `{ userId/... }` path from a stored media URL or return a raw path. */
export function parseMediaStoragePath(fileUrl: string): string | null {
  if (!fileUrl) return null
  // Already a storage path (no scheme)
  if (!fileUrl.includes("://") && !fileUrl.startsWith("/")) {
    return fileUrl.replace(/^\/+/, "") || null
  }
  try {
    const url = new URL(fileUrl)
    const markers = [
      `/storage/v1/object/public/${MEDIA_BUCKET}/`,
      `/storage/v1/object/sign/${MEDIA_BUCKET}/`,
      `/storage/v1/object/authenticated/${MEDIA_BUCKET}/`,
      `/storage/v1/object/${MEDIA_BUCKET}/`,
    ]
    for (const marker of markers) {
      const idx = url.pathname.indexOf(marker)
      if (idx !== -1) {
        const rest = url.pathname.slice(idx + marker.length)
        // Signed URLs may include a token query; path is enough
        return decodeURIComponent(rest.split("?")[0] || "") || null
      }
    }
    return null
  } catch {
    return null
  }
}

/** Canonical public-style URL used for DB storage / path extraction (not for display). */
export function mediaReferenceUrl(supabase: SupabaseClient, path: string): string {
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** Read `#d=12.3` duration hint appended to stored media URLs. */
export function parseMediaDurationHint(fileUrl: string | null | undefined): number | null {
  if (!fileUrl) return null
  const hashIdx = fileUrl.indexOf("#")
  if (hashIdx < 0) return null
  const hash = fileUrl.slice(hashIdx + 1)
  const params = new URLSearchParams(hash.replace(/;/g, "&"))
  const raw = params.get("d")
  if (!raw) return null
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

/** Append or replace `#d=` duration hint on a media reference URL. */
export function withMediaDurationHint(fileUrl: string, durationSec: number): string {
  const base = fileUrl.split("#")[0] ?? fileUrl
  const safe = Math.max(0.1, Math.round(durationSec * 10) / 10)
  return `${base}#d=${safe}`
}

/** Resolve a displayable URL (signed) from a stored file_url / media_url. */
export async function resolveMediaDisplayUrl(
  supabase: SupabaseClient,
  fileUrl: string | null | undefined,
  expiresIn = SIGNED_TTL_SECONDS,
): Promise<string | null> {
  if (!fileUrl) return null
  const path = parseMediaStoragePath(fileUrl)
  if (!path) return fileUrl

  const cached = readFreshCache(path)
  if (cached) return withFileUrlFragment(cached, fileUrl)

  const existing = signedUrlInflight.get(path)
  if (existing) {
    const signed = await existing
    return signed ? withFileUrlFragment(signed, fileUrl) : null
  }

  const request = (async (): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(path, expiresIn)

    if (error || !data?.signedUrl) {
      console.error("resolveMediaDisplayUrl:", error?.message)
      return null
    }

    signedUrlCache.set(path, {
      signedUrl: data.signedUrl,
      expiresAt: Date.now() + expiresIn * 1000,
    })
    return data.signedUrl
  })()

  signedUrlInflight.set(path, request)
  try {
    const signed = await request
    return signed ? withFileUrlFragment(signed, fileUrl) : null
  } finally {
    signedUrlInflight.delete(path)
  }
}

/** Download media as a Blob via the authenticated client (best for audio playback). */
export async function downloadMediaBlob(
  supabase: SupabaseClient,
  fileUrl: string | null | undefined,
): Promise<Blob | null> {
  if (!fileUrl) return null
  const path = parseMediaStoragePath(fileUrl)
  if (path) {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(path)
    if (!error && data) return data
    console.error("downloadMediaBlob:", error?.message)
  }

  const signed = await resolveMediaDisplayUrl(supabase, fileUrl)
  if (!signed) return null
  try {
    const res = await fetch(signed)
    if (!res.ok) return null
    return await res.blob()
  } catch (err) {
    console.error("downloadMediaBlob fetch:", err)
    return null
  }
}
