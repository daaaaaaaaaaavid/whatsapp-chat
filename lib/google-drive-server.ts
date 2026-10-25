import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"
import { createServiceClient } from "@/lib/supabase/admin"
import { DRIVE_FOLDER_NAME, parseDriveMediaRef } from "@/lib/google-drive"

const DRIVE_API = "https://www.googleapis.com/drive/v3"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const REVOKE_URL = "https://oauth2.googleapis.com/revoke"
const STREAM_COPY_LIMIT = 18 * 1024 * 1024

export type DriveAccountRow = {
  user_id: string
  refresh_token: string
  google_email: string | null
  folder_id: string | null
}

export type DriveSession = {
  accessToken: string
  expiresAt: number
  googleEmail: string
  folderId: string
}

export function googleOAuthConfigured(): boolean {
  return Boolean(googleClientId() && googleClientSecret())
}

function googleClientId() {
  return (
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    ""
  )
}

function googleClientSecret() {
  return (
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    ""
  )
}

function tokenSecret(): Buffer {
  const raw =
    process.env.DRIVE_TOKEN_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "whachat-drive-dev"
  return createHash("sha256").update(raw).digest()
}

export function encryptDriveToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", tokenSecret(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`
}

export function decryptDriveToken(stored: string): string {
  if (!stored.startsWith("v1.")) return stored
  const parts = stored.split(".")
  if (parts.length !== 4) throw new Error("invalid_token")
  const iv = Buffer.from(parts[1], "base64url")
  const tag = Buffer.from(parts[2], "base64url")
  const enc = Buffer.from(parts[3], "base64url")
  const decipher = createDecipheriv("aes-256-gcm", tokenSecret(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8")
}

async function driveJson<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(driveErrorMessage(res.status, text))
  }
  return (text ? (JSON.parse(text) as T) : ({} as T))
}

function driveErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    if (parsed.error?.message) return parsed.error.message
  } catch {
    // keep fallback
  }
  if (status === 401 || status === 403) return "ההרשאה לדרייב פגה. חבר שוב את גוגל דרייב."
  return `שגיאת Google Drive (${status})`
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiresAt: number
}> {
  const id = googleClientId()
  const secret = googleClientSecret()
  if (!id || !secret) {
    throw new Error("חסרים GOOGLE_OAUTH_CLIENT_ID ו־GOOGLE_OAUTH_CLIENT_SECRET בשרת")
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })
  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "רענון טוקן לדרייב נכשל")
  }
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 60) * 1000,
  }
}

export async function driveAbout(accessToken: string): Promise<{ email: string }> {
  const data = await driveJson<{ user?: { emailAddress?: string } }>(
    accessToken,
    "/about?fields=user(emailAddress)",
  )
  const email = data.user?.emailAddress?.trim()
  if (!email) throw new Error("לא התקבל אימייל מגוגל דרייב")
  return { email }
}

async function ensureWhachatFolder(accessToken: string, existingId?: string | null): Promise<string> {
  if (existingId) {
    try {
      await driveJson<{ id: string }>(accessToken, `/files/${encodeURIComponent(existingId)}?fields=id,trashed`)
      return existingId
    } catch {
      // recreate
    }
  }

  const q = encodeURIComponent(
    `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )
  const listed = await driveJson<{ files?: { id: string }[] }>(
    accessToken,
    `/files?q=${q}&fields=files(id)&pageSize=1`,
  )
  if (listed.files?.[0]?.id) return listed.files[0].id

  const created = await driveJson<{ id: string }>(accessToken, "/files", {
    method: "POST",
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  })
  if (!created.id) throw new Error("יצירת תיקיית WhaChat בדרייב נכשלה")
  return created.id
}

export async function loadDriveAccount(userId: string): Promise<DriveAccountRow | null> {
  const admin = createServiceClient()
  if (!admin) return null
  const { data, error } = await admin
    .from("google_drive_accounts")
    .select("user_id, refresh_token, google_email, folder_id")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) {
    if (/does not exist|google_drive_accounts/i.test(error.message)) {
      throw new Error("חסרה טבלת דרייב. הרץ את supabase/migration-google-drive.sql")
    }
    throw new Error(error.message)
  }
  return data as DriveAccountRow | null
}

export async function openDriveSession(userId: string): Promise<DriveSession> {
  const row = await loadDriveAccount(userId)
  if (!row) throw new DriveAccountMissingError()
  const refreshToken = decryptDriveToken(row.refresh_token)
  const { accessToken, expiresAt } = await refreshGoogleAccessToken(refreshToken)
  const { email } = await driveAbout(accessToken)
  const folderId = await ensureWhachatFolder(accessToken, row.folder_id)
  if (folderId !== row.folder_id || email !== row.google_email) {
    const admin = createServiceClient()
    await admin
      ?.from("google_drive_accounts")
      .update({ folder_id: folderId, google_email: email, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
  }
  return { accessToken, expiresAt, googleEmail: email, folderId }
}

export class DriveAccountMissingError extends Error {
  readonly code = "drive_not_connected"
  constructor() {
    super("חבר את גוגל דרייב כדי להמשיך")
    this.name = "DriveAccountMissingError"
  }
}

export async function saveDriveAccount(opts: {
  userId: string
  refreshToken: string
  accessToken: string
}): Promise<{ googleEmail: string; folderId: string }> {
  const admin = createServiceClient()
  if (!admin) throw new Error("חסר SUPABASE_SERVICE_ROLE_KEY")
  const { email } = await driveAbout(opts.accessToken)
  const folderId = await ensureWhachatFolder(opts.accessToken, null)
  const now = new Date().toISOString()
  const { error } = await admin.from("google_drive_accounts").upsert(
    {
      user_id: opts.userId,
      refresh_token: encryptDriveToken(opts.refreshToken),
      google_email: email,
      folder_id: folderId,
      connected_at: now,
      updated_at: now,
    },
    { onConflict: "user_id" },
  )
  if (error) {
    if (/does not exist|google_drive_accounts/i.test(error.message)) {
      throw new Error("חסרה טבלת דרייב. הרץ את supabase/migration-google-drive.sql")
    }
    throw new Error(error.message)
  }
  await admin
    .from("profiles")
    .update({ google_drive_connected_at: now })
    .eq("id", opts.userId)
  return { googleEmail: email, folderId }
}

export async function deleteDriveAccount(userId: string): Promise<void> {
  const admin = createServiceClient()
  if (!admin) throw new Error("חסר SUPABASE_SERVICE_ROLE_KEY")
  const row = await loadDriveAccount(userId)
  if (row) {
    try {
      const token = decryptDriveToken(row.refresh_token)
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" })
    } catch {
      // still drop the row
    }
  }
  await admin.from("google_drive_accounts").delete().eq("user_id", userId)
  await admin.from("profiles").update({ google_drive_connected_at: null }).eq("id", userId)
}

export async function createDriveResumableUpload(opts: {
  accessToken: string
  folderId: string
  fileName: string
  mimeType: string
  size: number
}): Promise<string> {
  const res = await fetch(`${DRIVE_API.replace("/drive/v3", "")}/upload/drive/v3/files?uploadType=resumable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mimeType,
      "X-Upload-Content-Length": String(opts.size),
    },
    body: JSON.stringify({
      name: opts.fileName,
      parents: [opts.folderId],
    }),
  })
  const uploadUrl = res.headers.get("location")
  if (!res.ok || !uploadUrl) {
    const text = await res.text()
    throw new Error(driveErrorMessage(res.status, text))
  }
  return uploadUrl
}

async function shareFile(accessToken: string, fileId: string, email: string): Promise<string> {
  const data = await driveJson<{ id: string }>(
    accessToken,
    `/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "user",
        role: "reader",
        emailAddress: email,
      }),
    },
  )
  return data.id
}

async function unshareFile(accessToken: string, fileId: string, permissionId: string) {
  try {
    await driveJson(
      accessToken,
      `/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`,
      { method: "DELETE" },
    )
  } catch {
    // ignore
  }
}

async function copyFile(
  accessToken: string,
  fileId: string,
  folderId: string,
  name: string,
): Promise<string> {
  const data = await driveJson<{ id: string }>(accessToken, `/files/${encodeURIComponent(fileId)}/copy`, {
    method: "POST",
    body: JSON.stringify({
      name,
      parents: [folderId],
    }),
  })
  if (!data.id) throw new Error("ההעתקה לדרייב נכשלה")
  return data.id
}

async function deleteFile(accessToken: string, fileId: string) {
  try {
    await driveJson(accessToken, `/files/${encodeURIComponent(fileId)}`, { method: "DELETE" })
  } catch {
    // already gone
  }
}

async function downloadFileBytes(accessToken: string, fileId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(driveErrorMessage(res.status, text))
  }
  const len = Number(res.headers.get("content-length") || "0")
  if (len > STREAM_COPY_LIMIT) {
    throw new Error("הקובץ גדול מדי להעתקה דרך השרת. נסה שוב אחרי חיבור דרייב בשני הצדדים.")
  }
  return res.arrayBuffer()
}

async function uploadBytes(opts: {
  accessToken: string
  folderId: string
  fileName: string
  mimeType: string
  bytes: ArrayBuffer
}): Promise<string> {
  const metadata = {
    name: opts.fileName,
    parents: [opts.folderId],
  }
  const boundary = `whachat-${randomBytes(8).toString("hex")}`
  const prefix = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${opts.mimeType || "application/octet-stream"}`,
    "",
    "",
  ].join("\r\n")
  const suffix = `\r\n--${boundary}--`
  const body = Buffer.concat([
    Buffer.from(prefix, "utf8"),
    Buffer.from(opts.bytes),
    Buffer.from(suffix, "utf8"),
  ])
  const res = await fetch(`${DRIVE_API.replace("/drive/v3", "")}/upload/drive/v3/files?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  const data = (await res.json()) as { id?: string }
  if (!res.ok || !data.id) {
    throw new Error("העלאה לדרייב של הנמען נכשלה")
  }
  return data.id
}

export async function copyDriveFileToUser(opts: {
  sourceOwnerId: string
  sourceFileId: string
  destUserId: string
  fileName: string
  mimeType?: string | null
}): Promise<string> {
  const source = await openDriveSession(opts.sourceOwnerId)
  const dest = await openDriveSession(opts.destUserId)
  let permissionId: string | null = null
  try {
    permissionId = await shareFile(source.accessToken, opts.sourceFileId, dest.googleEmail)
    return await copyFile(dest.accessToken, opts.sourceFileId, dest.folderId, opts.fileName)
  } catch (shareErr) {
    try {
      const bytes = await downloadFileBytes(source.accessToken, opts.sourceFileId)
      return await uploadBytes({
        accessToken: dest.accessToken,
        folderId: dest.folderId,
        fileName: opts.fileName,
        mimeType: opts.mimeType || "application/octet-stream",
        bytes,
      })
    } catch {
      throw shareErr instanceof Error ? shareErr : new Error("ההעתקה לדרייב נכשלה")
    }
  } finally {
    if (permissionId) {
      await unshareFile(source.accessToken, opts.sourceFileId, permissionId)
    }
  }
}

export async function grantDriveView(opts: {
  sourceOwnerId: string
  sourceFileId: string
  viewerUserId: string
}): Promise<void> {
  const source = await openDriveSession(opts.sourceOwnerId)
  const dest = await openDriveSession(opts.viewerUserId)
  await shareFile(source.accessToken, opts.sourceFileId, dest.googleEmail)
}

export async function deleteDriveFileForUser(userId: string, fileId: string): Promise<void> {
  try {
    const session = await openDriveSession(userId)
    await deleteFile(session.accessToken, fileId)
  } catch {
    // token gone or file already deleted
  }
}

export async function deleteDriveMediaRefs(fileUrls: string[]): Promise<number> {
  const admin = createServiceClient()
  if (!admin) return 0
  let deleted = 0
  const seen = new Set<string>()

  for (const fileUrl of fileUrls) {
    const ref = parseDriveMediaRef(fileUrl)
    if (!ref) continue
    const key = `${ref.ownerId}/${ref.fileId}`
    if (seen.has(key)) continue
    seen.add(key)

    const { data: copies } = await admin
      .from("drive_media_copies")
      .select("user_id, dest_file_id")
      .eq("source_owner_id", ref.ownerId)
      .eq("source_file_id", ref.fileId)

    for (const copy of copies ?? []) {
      await deleteDriveFileForUser(copy.user_id, copy.dest_file_id)
    }
    await deleteDriveFileForUser(ref.ownerId, ref.fileId)
    await admin
      .from("drive_media_copies")
      .delete()
      .eq("source_owner_id", ref.ownerId)
      .eq("source_file_id", ref.fileId)
    deleted += 1
  }
  return deleted
}

export async function recordDriveCopy(opts: {
  userId: string
  sourceOwnerId: string
  sourceFileId: string
  destFileId: string
  kind: "message" | "status"
  sourceRowId: string
}): Promise<void> {
  const admin = createServiceClient()
  if (!admin) return
  await admin.from("drive_media_copies").upsert(
    {
      user_id: opts.userId,
      source_owner_id: opts.sourceOwnerId,
      source_file_id: opts.sourceFileId,
      dest_file_id: opts.destFileId,
      kind: opts.kind,
      source_row_id: opts.sourceRowId,
    },
    { onConflict: "user_id,source_owner_id,source_file_id" },
  )
}

export async function findDriveCopy(
  userId: string,
  sourceOwnerId: string,
  sourceFileId: string,
): Promise<string | null> {
  const admin = createServiceClient()
  if (!admin) return null
  const { data } = await admin
    .from("drive_media_copies")
    .select("dest_file_id")
    .eq("user_id", userId)
    .eq("source_owner_id", sourceOwnerId)
    .eq("source_file_id", sourceFileId)
    .maybeSingle()
  return (data?.dest_file_id as string | undefined) ?? null
}
