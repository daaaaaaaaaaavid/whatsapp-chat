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

const VOICE_RECORDER_CANDIDATES = [
  "audio/mp4",
  "audio/aac",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
]

/** Strip codec parameters (`audio/webm;codecs=opus` → `audio/webm`). */
export function normalizeMime(type: string): string {
  return type.split(";")[0]?.trim().toLowerCase() || ""
}

export function resolveFileMime(file: File): string {
  const raw = file.type ? normalizeMime(file.type) : ""
  if (raw && ALLOWED_MEDIA_MIMES.has(raw)) return raw
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (ext && EXT_TO_MIME[ext]) return EXT_TO_MIME[ext]
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

/** Best MediaRecorder MIME the current browser supports. */
export function pickVoiceRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined
  }
  for (const candidate of VOICE_RECORDER_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return undefined
}

export function voiceMimeToExtension(mime: string): string {
  const base = normalizeMime(mime)
  if (base === "audio/mp4" || base === "audio/aac") return "m4a"
  if (base === "audio/ogg") return "ogg"
  if (base === "audio/mpeg") return "mp3"
  if (base === "audio/wav") return "wav"
  return "webm"
}

/** Infer audio MIME for playback when Storage returns an empty/octet-stream type. */
export function inferAudioMimeFromUrl(fileUrl: string | null | undefined): string {
  if (!fileUrl) return "audio/webm"
  const pathOnly = fileUrl.split("#")[0]?.split("?")[0] ?? fileUrl
  const ext = pathOnly.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "m4a" || ext === "mp4" || ext === "aac") return "audio/mp4"
  if (ext === "mp3") return "audio/mpeg"
  if (ext === "ogg" || ext === "oga") return "audio/ogg"
  if (ext === "wav") return "audio/wav"
  if (ext === "webm") return "audio/webm"
  return "audio/webm"
}

/** Build a File from recorder chunks using the recorder's real MIME type. */
export function voiceRecordingFile(chunks: Blob[], recorderMime?: string): File {
  const preferred = recorderMime ? normalizeMime(recorderMime) : ""
  const chunkType = chunks.find((c) => c.type)?.type
  const rawType = preferred || (chunkType ? normalizeMime(chunkType) : "") || "audio/webm"
  const type = ALLOWED_MEDIA_MIMES.has(rawType) ? rawType : "audio/webm"
  const ext = voiceMimeToExtension(type)
  const blob = new Blob(chunks, { type })
  return new File([blob], `voice-${Date.now()}.${ext}`, { type })
}
