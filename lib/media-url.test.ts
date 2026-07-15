import { describe, expect, it } from "vitest"
import { parseMediaStoragePath, parseMediaDurationHint, withMediaDurationHint } from "@/lib/media-url"

describe("parseMediaStoragePath", () => {
  it("parses public media URLs", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/public/media/user1/conv1/file.jpg"
    expect(parseMediaStoragePath(url)).toBe("user1/conv1/file.jpg")
  })

  it("parses signed media URLs", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/sign/media/user1/conv1/file.jpg?token=abc"
    expect(parseMediaStoragePath(url)).toBe("user1/conv1/file.jpg")
  })

  it("accepts raw paths", () => {
    expect(parseMediaStoragePath("user1/avatar-1.png")).toBe("user1/avatar-1.png")
  })

  it("ignores duration hash when parsing path from public URL", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/public/media/user1/conv1/voice.webm#d=3.5"
    expect(parseMediaStoragePath(url)).toBe("user1/conv1/voice.webm")
  })
})

describe("media duration hint", () => {
  it("reads and writes #d= hints", () => {
    const withHint = withMediaDurationHint(
      "https://xyz.supabase.co/storage/v1/object/public/media/a/b/voice.m4a",
      12.34,
    )
    expect(withHint).toContain("#d=12.3")
    expect(parseMediaDurationHint(withHint)).toBe(12.3)
    expect(parseMediaDurationHint("https://example.com/x.webm")).toBeNull()
  })
})
