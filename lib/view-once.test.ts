import { describe, expect, it } from "vitest"
import {
  isViewOnceMessage,
  isViewOnceOpened,
  viewOncePreviewLabel,
} from "@/lib/view-once"

describe("view-once helpers", () => {
  it("detects view-once messages", () => {
    expect(isViewOnceMessage({ view_once: true })).toBe(true)
    expect(isViewOnceMessage({ view_once: false })).toBe(false)
  })

  it("detects opened state", () => {
    expect(
      isViewOnceOpened({ view_once: true, file_url: null, deleted_at: null }),
    ).toBe(true)
    expect(
      isViewOnceOpened({ view_once: true, file_url: "https://x", deleted_at: null }),
    ).toBe(false)
  })

  it("builds preview labels", () => {
    expect(
      viewOncePreviewLabel({
        type: "image",
        view_once: true,
        file_url: "https://x",
        deleted_at: null,
      }),
    ).toContain("תמונה")
    expect(
      viewOncePreviewLabel({
        type: "video",
        view_once: true,
        file_url: null,
        deleted_at: null,
      }),
    ).toContain("נצפה")
  })
})
