/** Drive media refs stored in messages.file_url / statuses.media_url. */

export const DRIVE_SCHEME = "gdrive:"
export const DRIVE_FOLDER_NAME = "WhaChat"
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FILE_ID_RE = /^[A-Za-z0-9_-]{10,128}$/

export type DriveMediaRef = {
  ownerId: string
  fileId: string
  hash: string
}

export class DriveNotConnectedError extends Error {
  readonly code = "drive_not_connected"
  constructor(message = "חבר את גוגל דרייב כדי לשלוח ולקבל תמונות") {
    super(message)
    this.name = "DriveNotConnectedError"
  }
}

export function isDriveNotConnectedError(error: unknown): error is DriveNotConnectedError {
  return (
    error instanceof DriveNotConnectedError ||
    (error instanceof Error && (error as Error & { code?: string }).code === "drive_not_connected")
  )
}

export function isDriveMediaUrl(fileUrl: string | null | undefined): boolean {
  if (!fileUrl) return false
  const base = fileUrl.split("#")[0] ?? fileUrl
  return base.startsWith(DRIVE_SCHEME)
}

export function parseDriveMediaRef(fileUrl: string | null | undefined): DriveMediaRef | null {
  if (!fileUrl) return null
  const hashIdx = fileUrl.indexOf("#")
  const base = hashIdx >= 0 ? fileUrl.slice(0, hashIdx) : fileUrl
  const hash = hashIdx >= 0 ? fileUrl.slice(hashIdx + 1) : ""
  if (!base.startsWith(DRIVE_SCHEME)) return null

  const rest = base.slice(DRIVE_SCHEME.length).replace(/^\/\//, "")
  const slash = rest.indexOf("/")
  if (slash <= 0) return null
  const ownerId = rest.slice(0, slash)
  const fileId = rest.slice(slash + 1)
  if (!UUID_RE.test(ownerId) || !FILE_ID_RE.test(fileId)) return null
  return { ownerId, fileId, hash }
}

export function driveCopyKey(ownerId: string, fileId: string): string {
  return `${ownerId}/${fileId}`
}

export function driveMediaReferenceUrl(
  ownerId: string,
  fileId: string,
  extraHash?: string | null,
): string {
  const base = `${DRIVE_SCHEME}${ownerId}/${fileId}`
  if (!extraHash) return base
  return `${base}#${extraHash.replace(/^#/, "")}`
}

export function withDriveMediaHash(fileUrl: string, extraHash: string): string {
  const ref = parseDriveMediaRef(fileUrl)
  if (!ref) return fileUrl
  const params = new URLSearchParams(ref.hash.replace(/;/g, "&"))
  const incoming = new URLSearchParams(extraHash.replace(/^#/, "").replace(/;/g, "&"))
  incoming.forEach((value, key) => params.set(key, value))
  const next = params.toString().replace(/&/g, "&")
  return driveMediaReferenceUrl(ref.ownerId, ref.fileId, next)
}

export function driveMediaKindHint(fileUrl: string | null | undefined): "image" | "video" | null {
  if (!fileUrl) return null
  if (/#(?:.*&)?(?:whachat=)?video\b/i.test(fileUrl)) return "video"
  if (/#(?:.*&)?(?:whachat=)?image\b/i.test(fileUrl)) return "image"
  return null
}
