import { describe, expect, it } from "vitest"
import { OWN_PROFILE_COLUMNS, PUBLIC_PROFILE_COLUMNS } from "@/lib/profile-fields"

describe("profile field projections", () => {
  it("keeps sensitive fields out of the public projection", () => {
    expect(PUBLIC_PROFILE_COLUMNS).not.toContain("email")
    expect(PUBLIC_PROFILE_COLUMNS).not.toContain("chat_prefs")
    expect(PUBLIC_PROFILE_COLUMNS).not.toContain("blocked_user_ids")
    expect(PUBLIC_PROFILE_COLUMNS).toContain("display_name")
    expect(PUBLIC_PROFILE_COLUMNS).toContain("avatar_url")
  })

  it("includes private fields for the owner projection", () => {
    expect(OWN_PROFILE_COLUMNS).toContain("email")
    expect(OWN_PROFILE_COLUMNS).toContain("chat_prefs")
    expect(OWN_PROFILE_COLUMNS).toContain("blocked_user_ids")
  })
})
