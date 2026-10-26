import { describe, expect, it } from "vitest"
import { ilikeExactOr, quotePostgrestValue } from "@/lib/postgrest-or"

describe("postgrest or filters", () => {
  it("quotes dots so an email is one value", () => {
    expect(quotePostgrestValue("dc6427874@gmail.com")).toBe('"dc6427874@gmail.com"')
    expect(ilikeExactOr("email", ["dc6427874@gmail.com", "a.b@example.com"])).toBe(
      'email.ilike."dc6427874@gmail.com",email.ilike."a.b@example.com"',
    )
  })

  it("escapes like wildcards inside the quoted value", () => {
    expect(ilikeExactOr("email", ["a_b%c@x.com"])).toBe('email.ilike."a\\_b\\%c@x.com"')
  })
})
