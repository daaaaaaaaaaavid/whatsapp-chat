import { describe, expect, it } from "vitest"
import { isSafeRedirectPath, safeRedirectPath } from "@/lib/safe-redirect"

describe("isSafeRedirectPath", () => {
  it("allows normal relative paths", () => {
    expect(isSafeRedirectPath("/chat")).toBe(true)
    expect(isSafeRedirectPath("/chat?c=abc")).toBe(true)
    expect(isSafeRedirectPath("/invite/token-123")).toBe(true)
  })

  it("rejects open redirects", () => {
    expect(isSafeRedirectPath("//evil.com")).toBe(false)
    expect(isSafeRedirectPath("/\\evil.com")).toBe(false)
    expect(isSafeRedirectPath("https://evil.com")).toBe(false)
    expect(isSafeRedirectPath("evil.com")).toBe(false)
  })
})

describe("safeRedirectPath", () => {
  it("falls back when unsafe", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/chat")
    expect(safeRedirectPath(null)).toBe("/chat")
  })
})
