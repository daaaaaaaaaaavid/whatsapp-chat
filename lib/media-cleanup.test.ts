import { describe, expect, it } from "vitest"
import { isChatMediaStoragePath, mediaCleanupSummary } from "@/lib/media-cleanup"
import { MEDIA_RETENTION_ENABLED } from "@/lib/media-retention"

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
  it("keeps chat media auto-deletion off", () => {
    expect(MEDIA_RETENTION_ENABLED).toBe(false)
    expect(
      mediaCleanupSummary({
        expiredMessages: 0,
        storageDeleted: 0,
        storageSkipped: 0,
        storageErrors: 0,
        statusesCleaned: 2,
      }),
    ).toContain("chatRetention=off")
  })
})
