import { describe, expect, it } from "vitest"
import { buildDmInviteEmail } from "@/lib/dm-invite-email"

describe("buildDmInviteEmail", () => {
  it("includes inviter name and invite URL", () => {
    const { subject, text, html } = buildDmInviteEmail({
      inviterName: "יוסי כהן",
      inviteeEmail: "a@b.com",
      inviteUrl: "https://example.com/invite/dm_abc",
    })
    expect(subject).toContain("יוסי כהן")
    expect(subject).toContain("WhaChat")
    expect(text).toContain("לכניסה")
    expect(text).toContain("https://example.com/invite/dm_abc")
    expect(html).toContain("יוסי כהן הזמין אותך לשיחה")
    expect(html).toContain("https://example.com/invite/dm_abc")
  })
})
