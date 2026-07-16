import { describe, expect, it } from "vitest"
import {
  buildPollPayload,
  encodePollPayload,
  parsePollPayload,
  pollPreviewLabel,
} from "@/lib/poll"

describe("poll helpers", () => {
  it("builds and parses a poll payload", () => {
    const built = buildPollPayload({
      question: "מה נאכל?",
      optionTexts: ["פיצה", "סושי", ""],
      allowMultiple: true,
    })
    expect(built).not.toBeNull()
    expect(built!.options).toHaveLength(2)
    expect(built!.allowMultiple).toBe(true)

    const encoded = encodePollPayload(built!)
    const parsed = parsePollPayload(encoded)
    expect(parsed?.question).toBe("מה נאכל?")
    expect(parsed?.options.map((o) => o.text)).toEqual(["פיצה", "סושי"])
    expect(pollPreviewLabel(parsed!)).toContain("סקר")
  })

  it("rejects too few options", () => {
    expect(
      buildPollPayload({
        question: "שאלה",
        optionTexts: ["רק אחת"],
      }),
    ).toBeNull()
  })

  it("returns null for non-poll content", () => {
    expect(parsePollPayload("שלום")).toBeNull()
    expect(parsePollPayload('{"kind":"call","event":"ended","video":false}')).toBeNull()
  })
})
