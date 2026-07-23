import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearSignedMediaUrlCacheForTests,
  invalidateMediaDisplayUrl,
  parseMediaStoragePath,
  parseMediaDurationHint,
  peekCachedMediaDisplayUrl,
  resolveMediaDisplayUrl,
  withMediaDurationHint,
} from "@/lib/media-url"

afterEach(() => {
  clearSignedMediaUrlCacheForTests()
})

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

function mockSupabase(createSignedUrl: ReturnType<typeof vi.fn>) {
  return {
    storage: {
      from: () => ({ createSignedUrl }),
    },
  } as never
}

describe("resolveMediaDisplayUrl cache", () => {
  const fileUrl = "https://xyz.supabase.co/storage/v1/object/public/media/user1/avatar.png"
  const withHash = `${fileUrl}#d=2.5`

  it("caches signed URLs and dedupes in-flight requests", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://signed.example/avatar?token=1" },
      error: null,
    })
    const supabase = mockSupabase(createSignedUrl)

    const [a, b] = await Promise.all([
      resolveMediaDisplayUrl(supabase, fileUrl),
      resolveMediaDisplayUrl(supabase, withHash),
    ])

    expect(createSignedUrl).toHaveBeenCalledTimes(1)
    expect(a).toBe("https://signed.example/avatar?token=1")
    expect(b).toBe("https://signed.example/avatar?token=1#d=2.5")
    expect(peekCachedMediaDisplayUrl(withHash)).toBe(
      "https://signed.example/avatar?token=1#d=2.5",
    )

    await resolveMediaDisplayUrl(supabase, fileUrl)
    expect(createSignedUrl).toHaveBeenCalledTimes(1)
  })

  it("bypasses cache after invalidate", async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValueOnce({
        data: { signedUrl: "https://signed.example/a?token=1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { signedUrl: "https://signed.example/a?token=2" },
        error: null,
      })
    const supabase = mockSupabase(createSignedUrl)

    await resolveMediaDisplayUrl(supabase, fileUrl)
    invalidateMediaDisplayUrl(fileUrl)
    expect(peekCachedMediaDisplayUrl(fileUrl)).toBeNull()

    const next = await resolveMediaDisplayUrl(supabase, fileUrl)
    expect(createSignedUrl).toHaveBeenCalledTimes(2)
    expect(next).toBe("https://signed.example/a?token=2")
  })
})
