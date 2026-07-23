import { describe, expect, it, vi } from "vitest"
import { withMinLatency } from "@/lib/timing-pad"

describe("withMinLatency", () => {
  it("pads fast work to at least minMs", async () => {
    vi.useFakeTimers()
    const p = withMinLatency(200, async () => "ok")
    await vi.advanceTimersByTimeAsync(200)
    await expect(p).resolves.toBe("ok")
    vi.useRealTimers()
  })

  it("does not delay slow work", async () => {
    const started = Date.now()
    const result = await withMinLatency(10, async () => {
      await new Promise((r) => setTimeout(r, 30))
      return 1
    })
    expect(result).toBe(1)
    expect(Date.now() - started).toBeGreaterThanOrEqual(25)
  })
})
