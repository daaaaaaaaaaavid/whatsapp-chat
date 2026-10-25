"use client"

import { createClient, ensureSupabaseConfig } from "@/lib/supabase/client"
import {
  DriveNotConnectedError,
  driveMediaReferenceUrl,
  isDriveNotConnectedError,
} from "@/lib/google-drive"
import type { UploadProgress } from "@/lib/media-upload"

export type DriveStatus = {
  connected: boolean
  configured: boolean
  googleEmail: string | null
  folderId: string | null
}

export type DriveCopyKind = "message" | "status"

export type DriveCopyResult = {
  destFileId: string
  alreadyHad: boolean
}

function errMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export async function fetchDriveStatus(): Promise<DriveStatus> {
  const res = await fetch("/api/drive/status", { cache: "no-store" })
  const data = (await res.json()) as DriveStatus & { message?: string }
  if (!res.ok) {
    throw new Error(data.message || "לא ניתן לבדוק את חיבור הדרייב")
  }
  return {
    connected: Boolean(data.connected),
    configured: data.configured !== false,
    googleEmail: data.googleEmail ?? null,
    folderId: data.folderId ?? null,
  }
}

export async function saveGoogleDriveConnection(opts: {
  providerToken: string
  providerRefreshToken?: string | null
}): Promise<{ googleEmail: string }> {
  const res = await fetch("/api/drive/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider_token: opts.providerToken,
      provider_refresh_token: opts.providerRefreshToken,
    }),
  })
  const data = (await res.json()) as {
    ok?: boolean
    error?: string
    message?: string
    googleEmail?: string
  }
  if (!res.ok || !data.ok) {
    const err = new Error(data.message || "חיבור גוגל דרייב נכשל") as Error & { code?: string }
    err.code = data.error
    throw err
  }
  return { googleEmail: data.googleEmail ?? "" }
}

export async function completeGoogleDriveConnectFromSession(): Promise<{ googleEmail: string }> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.provider_token
  if (!token) {
    throw new Error("לא התקבלה הרשאה מגוגל. נסה לחבר שוב.")
  }
  return saveGoogleDriveConnection({
    providerToken: token,
    providerRefreshToken: session.provider_refresh_token,
  })
}

export async function disconnectGoogleDrive(): Promise<void> {
  const res = await fetch("/api/drive/disconnect", { method: "POST" })
  const data = (await res.json()) as { ok?: boolean; message?: string }
  if (!res.ok || !data.ok) {
    throw new Error(data.message || "ניתוק הדרייב נכשל")
  }
}

export async function fetchDriveAccessSession(): Promise<{
  accessToken: string
  folderId: string
  expiresAt: number
  googleEmail: string
}> {
  const res = await fetch("/api/drive/token", { cache: "no-store" })
  const data = (await res.json()) as {
    accessToken?: string
    folderId?: string
    expiresAt?: number
    googleEmail?: string
    error?: string
    message?: string
  }
  if (res.status === 409 || data.error === "drive_not_connected") {
    throw new DriveNotConnectedError(data.message)
  }
  if (!res.ok || !data.accessToken || !data.folderId) {
    throw new Error(data.message || "לא ניתן לפתוח את הדרייב")
  }
  return {
    accessToken: data.accessToken,
    folderId: data.folderId,
    expiresAt: data.expiresAt ?? Date.now() + 45 * 60 * 1000,
    googleEmail: data.googleEmail ?? "",
  }
}

export async function uploadFileToGoogleDrive(opts: {
  accessToken: string
  folderId: string
  file: Blob
  fileName: string
  mimeType: string
  onProgress?: (progress: UploadProgress) => void
}): Promise<{ fileId: string }> {
  const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mimeType,
      "X-Upload-Content-Length": String(opts.file.size),
    },
    body: JSON.stringify({
      name: opts.fileName,
      parents: [opts.folderId],
    }),
  })
  const uploadUrl = init.headers.get("location")
  if (!init.ok || !uploadUrl) {
    const text = await init.text()
    throw new Error(parseGoogleError(text) || "פתיחת העלאה לדרייב נכשלה")
  }

  const fileId = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl)
    xhr.responseType = "text"
    xhr.setRequestHeader("Content-Type", opts.mimeType)
    xhr.upload.onprogress = (event) => {
      if (!opts.onProgress || !event.lengthComputable || event.total <= 0) return
      opts.onProgress({
        loaded: event.loaded,
        total: event.total,
        ratio: Math.min(1, event.loaded / event.total),
      })
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.({ loaded: opts.file.size, total: opts.file.size || 1, ratio: 1 })
        try {
          const parsed = JSON.parse(xhr.responseText) as { id?: string }
          if (parsed.id) {
            resolve(parsed.id)
            return
          }
        } catch {
          // fall through
        }
        reject(new Error("העלאה לדרייב הושלמה בלי מזהה קובץ"))
        return
      }
      reject(new Error(parseGoogleError(xhr.responseText) || `העלאה נכשלה (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error("שגיאת רשת בהעלאה לדרייב"))
    xhr.onabort = () => reject(new Error("ההעלאה בוטלה"))
    xhr.send(opts.file)
  })

  return { fileId }
}

export async function uploadUserDriveMedia(opts: {
  userId: string
  file: Blob
  fileName: string
  mimeType: string
  extraHash?: string | null
  onProgress?: (progress: UploadProgress) => void
}): Promise<string> {
  const session = await fetchDriveAccessSession()
  const { fileId } = await uploadFileToGoogleDrive({
    accessToken: session.accessToken,
    folderId: session.folderId,
    file: opts.file,
    fileName: opts.fileName,
    mimeType: opts.mimeType,
    onProgress: opts.onProgress,
  })
  return driveMediaReferenceUrl(opts.userId, fileId, opts.extraHash)
}

export async function copyDriveMedia(opts: {
  kind: DriveCopyKind
  id: string
  mode?: "copy" | "view"
}): Promise<DriveCopyResult> {
  const res = await fetch("/api/drive/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: opts.kind,
      id: opts.id,
      mode: opts.mode ?? "copy",
    }),
  })
  const data = (await res.json()) as {
    destFileId?: string
    alreadyHad?: boolean
    error?: string
    message?: string
  }
  if (res.status === 409 || data.error === "drive_not_connected") {
    throw new DriveNotConnectedError(data.message)
  }
  if (!res.ok || !data.destFileId) {
    throw new Error(data.message || "ההורדה לחשבון שלך נכשלה")
  }
  return {
    destFileId: data.destFileId,
    alreadyHad: Boolean(data.alreadyHad),
  }
}

export async function downloadDriveFileBlob(accessToken: string, fileId: string): Promise<Blob> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseGoogleError(text) || "הורדת הקובץ מהדרייב נכשלה")
  }
  return res.blob()
}

function parseGoogleError(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string }
    return parsed.error?.message || parsed.message || null
  } catch {
    return body.trim() ? body.trim().slice(0, 180) : null
  }
}

export { isDriveNotConnectedError }
