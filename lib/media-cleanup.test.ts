import { describe, expect, it } from "vitest"
import { isChatMediaStoragePath } from "@/lib/media-cleanup"

describe("isChatMediaStoragePath", () => {
  it("accepts chat upload paths", () => {
    expect(isChatMediaStoragePath("uid/convid/file.jpg")).toBe(true)
  })

  it("skips avatars and status folders", () => {
    expect(isChatMediaStoragePath("uid/avatar-123.png")).toBe(false)
    expect(isChatMediaStoragePath("uid/status/file.jpg")).toBe(false)
  })
})
