import { describe, expect, it } from "vitest"
import { isStandaloneEmojiText } from "@/lib/message-formatting"

describe("isStandaloneEmojiText", () => {
  it("detects a single emoji", () => {
    expect(isStandaloneEmojiText("😂")).toBe(true)
    expect(isStandaloneEmojiText(" ❤️ ")).toBe(true)
    expect(isStandaloneEmojiText("👍")).toBe(true)
  })

  it("detects ZWJ sequences and flags as one emoji", () => {
    expect(isStandaloneEmojiText("👨‍👩‍👧‍👦")).toBe(true)
    expect(isStandaloneEmojiText("🇮🇱")).toBe(true)
  })

  it("rejects text mixed with emoji or multiple emojis", () => {
    expect(isStandaloneEmojiText("😂😂")).toBe(false)
    expect(isStandaloneEmojiText("hi 😂")).toBe(false)
    expect(isStandaloneEmojiText("hello")).toBe(false)
    expect(isStandaloneEmojiText("")).toBe(false)
  })
})
