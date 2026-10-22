// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { CopyFailedError, copyTextWhenReady } from "@/lib/copy-text"

class FakeClipboardItem {
  constructor(private readonly data: Record<string, Promise<Blob> | Blob>) {}
  getType(type: string) {
    return Promise.resolve(this.data[type]).then((value) => {
      if (!value) throw new Error("missing clipboard type")
      return value
    })
  }
}

function installClipboard(write: ReturnType<typeof vi.fn>, writeText: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("ClipboardItem", FakeClipboardItem)
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true })
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { write, writeText },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("copyTextWhenReady", () => {
  it("starts clipboard.write before the text promise resolves", async () => {
    let resolved = false
    let captured = ""
    const write = vi.fn(async (items: FakeClipboardItem[]) => {
      expect(resolved).toBe(false)
      const blob = await items[0].getType("text/plain")
      captured = await blob.text()
    })
    installClipboard(write, vi.fn())

    const pending = copyTextWhenReady(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => {
            resolved = true
            resolve("https://example.com/invite/abc")
          }, 20)
        }),
    )

    expect(write).toHaveBeenCalledOnce()
    expect(resolved).toBe(false)
    await pending
    expect(captured).toBe("https://example.com/invite/abc")
  })

  it("falls back to execCommand when the async clipboard API rejects", async () => {
    const write = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError")
    })
    const writeText = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError")
    })
    installClipboard(write, writeText)
    const exec = vi.fn(() => true)
    document.execCommand = exec as Document["execCommand"]

    await copyTextWhenReady(async () => "https://example.com/invite/fallback")

    expect(exec).toHaveBeenCalledWith("copy")
  })

  it("returns the text when every copy method fails", async () => {
    installClipboard(
      vi.fn(async () => {
        throw new DOMException("denied", "NotAllowedError")
      }),
      vi.fn(async () => {
        throw new DOMException("denied", "NotAllowedError")
      }),
    )
    document.execCommand = vi.fn(() => false) as Document["execCommand"]

    const err = await copyTextWhenReady(async () => "https://example.com/invite/manual").catch(
      (caught: unknown) => caught,
    )

    expect(err).toBeInstanceOf(CopyFailedError)
    expect((err as CopyFailedError).text).toBe("https://example.com/invite/manual")
  })

  it("surfaces invite creation errors instead of a clipboard failure", async () => {
    const write = vi.fn(async (items: FakeClipboardItem[]) => {
      await items[0].getType("text/plain")
    })
    installClipboard(write, vi.fn())

    await expect(
      copyTextWhenReady(async () => {
        throw new Error("קישורי הזמנה זמינים לקבוצות בלבד")
      }),
    ).rejects.toThrow("קישורי הזמנה זמינים לקבוצות בלבד")
  })
})
