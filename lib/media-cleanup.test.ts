import { describe, expect, it } from "vitest"
import { isChatMediaStoragePath, mediaCleanupSummary } from "@/lib/media-cleanup"
import {
  MEDIA_RETENTION_DAYS,
  MEDIA_RETENTION_ENABLED,
  isOlderThanRetention,
  mediaRetentionCutoffIso,
} from "@/lib/media-retention"

describe("isChatMediaStoragePath", () => {
  it("accepts chat upload paths", () => {
    expect(isChatMediaStoragePath("uid/convid/file.jpg")).toBe(true)
  })

  it("skips avatars and status folders", () => {
    expect(isChatMediaStoragePath("uid/avatar-123.png")).toBe(false)
    expect(isChatMediaStoragePath("uid/status/file.jpg")).toBe(false)
  })
})

describe("chat media retention", () => {
  it("keeps a 4-day retention window enabled", () => {
    expect(MEDIA_RETENTION_ENABLED).toBe(true)
    expect(MEDIA_RETENTION_DAYS).toBe(4)
    expect(
      mediaCleanupSummary({
        expiredMessages: 1,
        storageDeleted: 1,
        storageSkipped: 0,
        storageErrors: 0,
        statusesCleaned: 2,
      }),
    ).toContain("chatRetention=4d")
  })

  it("does not treat fresh media as expired", () => {
    const now = new Date("2026-07-16T12:00:00.000Z")
    expect(isOlderThanRetention(now.toISOString(), now)).toBe(false)
    expect(isOlderThanRetention("2026-07-15T12:00:00.000Z", now)).toBe(false)
    expect(isOlderThanRetention("2026-07-12T11:59:00.000Z", now)).toBe(true)
  })

  it("computes cutoff ~4 UTC days before now", () => {
    const now = new Date("2026-07-16T12:00:00.000Z")
    expect(mediaRetentionCutoffIso(now)).toBe("2026-07-12T12:00:00.000Z")
  })
})
