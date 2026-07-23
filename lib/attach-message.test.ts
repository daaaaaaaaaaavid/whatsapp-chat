import { describe, expect, it } from "vitest"
import {
  buildContactPayload,
  encodeContactPayload,
  parseContactPayload,
  contactPreviewLabel,
} from "@/lib/contact-message"
import {
  buildEventPayload,
  encodeEventPayload,
  parseEventPayload,
  eventPreviewLabel,
  eventCalendarUrl,
} from "@/lib/event-message"
import {
  encodeStickerPayload,
  parseStickerPayload,
  isStickerMessage,
} from "@/lib/sticker-message"

describe("contact helpers", () => {
  it("builds and parses a contact payload", () => {
    const built = buildContactPayload({
      displayName: "יוסי",
      email: "yossi@example.com",
      matchedProfileId: "abc",
    })
    expect(built).not.toBeNull()
    const encoded = encodeContactPayload(built!)
    const parsed = parseContactPayload(encoded)
    expect(parsed?.displayName).toBe("יוסי")
    expect(parsed?.email).toBe("yossi@example.com")
    expect(contactPreviewLabel(parsed!)).toContain("איש קשר")
  })

  it("rejects empty name", () => {
    expect(buildContactPayload({ displayName: "  " })).toBeNull()
  })
})

describe("event helpers", () => {
  it("builds and parses an event payload", () => {
    const startsAt = "2026-07-23T15:00:00.000Z"
    const built = buildEventPayload({
      title: "פגישה",
      startsAt,
      location: "תל אביב",
    })
    expect(built).not.toBeNull()
    const encoded = encodeEventPayload(built!)
    const parsed = parseEventPayload(encoded)
    expect(parsed?.title).toBe("פגישה")
    expect(parsed?.location).toBe("תל אביב")
    expect(eventPreviewLabel(parsed!)).toContain("אירוע")
    expect(eventCalendarUrl(parsed!)).toContain("calendar.google.com")
  })

  it("rejects missing title", () => {
    expect(buildEventPayload({ title: "", startsAt: "2026-07-23T15:00:00.000Z" })).toBeNull()
  })
})

describe("sticker helpers", () => {
  it("encodes and parses sticker marker", () => {
    const encoded = encodeStickerPayload()
    expect(parseStickerPayload(encoded)?.kind).toBe("sticker")
    expect(isStickerMessage({ type: "sticker", content: null })).toBe(true)
    expect(isStickerMessage({ type: "image", content: encoded })).toBe(true)
    expect(isStickerMessage({ type: "text", content: "hi" })).toBe(false)
  })
})
