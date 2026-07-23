import { describe, expect, it } from "vitest"
import { checkRateLimit, checkRateLimitMemory } from "@/lib/rate-limit"

describe("checkRateLimit", () => {
  it("allows under the limit and blocks over", () => {
    const key = `test-${Math.random()}`
    expect(checkRateLimit(key, 2, 60_000).ok).toBe(true)
    expect(checkRateLimitMemory(key, 2, 60_000).ok).toBe(true)
    const blocked = checkRateLimit(key, 2, 60_000)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })
})
