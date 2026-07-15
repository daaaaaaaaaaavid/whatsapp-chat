import { describe, expect, it } from "vitest"
import { ALLOWED_MEDIA_MIMES, isAllowedMediaFile, resolveFileMime } from "@/lib/media-mime"

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
})
