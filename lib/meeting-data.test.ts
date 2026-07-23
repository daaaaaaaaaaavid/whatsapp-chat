import { describe, expect, it } from "vitest"
import {
  encodeMeetingData,
  parseMeetingData,
  initialsFromName,
  participantDisplayName,
} from "./meeting-data"

describe("meeting-data", () => {
  it("round-trips reaction messages", () => {
    const msg = {
      type: "reaction" as const,
      id: "abc",
      emoji: "🔥",
      by: "u1",
      byName: "Dana",
    }
    expect(parseMeetingData(encodeMeetingData(msg))).toEqual(msg)
  })

  it("round-trips hand messages", () => {
    const msg = { type: "hand" as const, raised: true, by: "u2" }
    expect(parseMeetingData(encodeMeetingData(msg))).toEqual(msg)
  })

  it("rejects invalid payloads", () => {
    expect(parseMeetingData(new TextEncoder().encode("{nope}"))).toBeNull()
    expect(parseMeetingData(new TextEncoder().encode(JSON.stringify({ type: "x" })))).toBeNull()
  })

  it("formats display names and initials", () => {
    expect(participantDisplayName("  Dana  ", "id")).toBe("Dana")
    expect(participantDisplayName(undefined, "abcdefghijk")).toBe("abcdefgh")
    expect(initialsFromName("Dana Cohen")).toBe("DC")
    expect(initialsFromName("Solo")).toBe("SO")
  })
})
