import { describe, expect, it } from "vitest"
import {
  ALLOWED_MEDIA_MIMES,
  isAllowedMediaFile,
  normalizeMime,
  resolveFileMime,
  voiceMimeToExtension,
  voiceRecordingFile,
} from "@/lib/media-mime"

describe("media-mime", () => {
  it("does not allow SVG or octet-stream", () => {
    expect(ALLOWED_MEDIA_MIMES.has("image/svg+xml")).toBe(false)
    expect(ALLOWED_MEDIA_MIMES.has("application/octet-stream")).toBe(false)
  })

  it("resolves jpeg by extension when type empty", () => {
    const file = new File(["x"], "photo.JPG", { type: "" })
    expect(resolveFileMime(file)).toBe("image/jpeg")
    expect(isAllowedMediaFile(file)).toBe(true)
  })

  it("rejects svg files", () => {
    const file = new File(["<svg/>"], "evil.svg", { type: "image/svg+xml" })
    expect(isAllowedMediaFile(file)).toBe(false)
  })

  it("strips codec parameters from mime types", () => {
    expect(normalizeMime("audio/webm;codecs=opus")).toBe("audio/webm")
    const file = new File(["x"], "voice.webm", { type: "audio/webm;codecs=opus" })
    expect(resolveFileMime(file)).toBe("audio/webm")
    expect(isAllowedMediaFile(file)).toBe(true)
  })

  it("builds voice files from recorder mime", () => {
    expect(voiceMimeToExtension("audio/mp4")).toBe("m4a")
    const file = voiceRecordingFile([new Blob(["abc"], { type: "audio/webm;codecs=opus" })], "audio/webm;codecs=opus")
    expect(file.type).toBe("audio/webm")
    expect(file.name.endsWith(".webm")).toBe(true)
    expect(isAllowedMediaFile(file)).toBe(true)
  })

  it("infers audio mime from file url extension", async () => {
    const { inferAudioMimeFromUrl } = await import("@/lib/media-mime")
    expect(inferAudioMimeFromUrl("https://x/media/a/voice.m4a#d=2")).toBe("audio/mp4")
    expect(inferAudioMimeFromUrl("https://x/media/a/voice.webm")).toBe("audio/webm")
  })
})
