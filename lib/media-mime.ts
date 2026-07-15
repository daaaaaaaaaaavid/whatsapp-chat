/** MIME types allowed by the Supabase `media` storage bucket. */
export const ALLOWED_MEDIA_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/heic",
  "image/heif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/3gpp",
  "video/x-matroska",
  "audio/mpeg",
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mp4",
  "audio/aac",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/mp4",
  avi: "video/x-msvideo",
  "3gp": "video/3gpp",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

export function resolveFileMime(file: File): string {
  if (file.type && ALLOWED_MEDIA_MIMES.has(file.type)) return file.type
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (ext && EXT_TO_MIME[ext]) return EXT_TO_MIME[ext]
  if (file.type && ALLOWED_MEDIA_MIMES.has(file.type)) return file.type
  return ""
}

export function isAllowedMediaFile(file: File): boolean {
  const mime = resolveFileMime(file)
  return Boolean(mime) && ALLOWED_MEDIA_MIMES.has(mime)
}

export const UNSUPPORTED_MEDIA_MESSAGE =
  "סוג הקובץ לא נתמך. נסה JPEG, PNG, WebP, MP4, WebM, או PDF."

/** Max upload size aligned with bucket limit (50MB). */
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024
