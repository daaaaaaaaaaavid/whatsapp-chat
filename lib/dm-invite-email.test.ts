import { describe, expect, it } from "vitest"
import { buildDmInviteShareText } from "@/lib/dm-invite-email"

describe("buildDmInviteShareText", () => {
  it("includes inviter name and invite URL", () => {
    const text = buildDmInviteShareText({
      inviterName: "יוסי כהן",
      inviteUrl: "https://example.com/invite/dm_abc",
    })
    expect(text).toContain("יוסי כהן")
    expect(text).toContain("WhaChat")
    expect(text).toContain("לכניסה לחץ כאן")
    expect(text).toContain("https://example.com/invite/dm_abc")
  })
})
