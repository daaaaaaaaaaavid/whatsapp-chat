import { describe, expect, it } from "vitest"
import {
  buildMentionCandidates,
  encodeMentions,
  extractMentions,
  filterMentionCandidates,
  findMentionQuery,
  formatMentionToken,
  mentionTokensToAtNames,
} from "@/lib/mentions"
import { splitTextWithLinks } from "@/lib/message-content"
import { plainMessageText } from "@/lib/message-formatting"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const GROUP_ID = "22222222-2222-4222-8222-222222222222"

describe("mentions", () => {
  it("formats and extracts mention tokens", () => {
    const token = formatMentionToken({ kind: "user", id: USER_ID, label: "יוסי" })
    expect(token).toBe(`@[יוסי](user:${USER_ID})`)
    expect(extractMentions(`שלום ${token} וגם @[צוות](group:${GROUP_ID})`)).toEqual([
      { label: "יוסי", kind: "user", id: USER_ID },
      { label: "צוות", kind: "group", id: GROUP_ID },
    ])
  })

  it("converts tokens to readable @names", () => {
    expect(mentionTokensToAtNames(`היי @[יוסי](user:${USER_ID})`)).toBe("היי @יוסי")
  })

  it("encodes plain @labels into tokens", () => {
    const encoded = encodeMentions("שלום @יוסי מה נשמע", [
      { kind: "user", id: USER_ID, label: "יוסי" },
    ])
    expect(encoded).toBe(`שלום @[יוסי](user:${USER_ID}) מה נשמע`)
  })

  it("does not treat emails as mention queries", () => {
    expect(findMentionQuery("כתוב user@gma", 12)).toBeNull()
    const sample = "היי @יו"
    expect(findMentionQuery(sample, sample.length)).toEqual({ start: 4, query: "יו" })
  })

  it("filters candidates by query", () => {
    const list = filterMentionCandidates(
      [
        { kind: "user", id: USER_ID, label: "יוסי כהן" },
        { kind: "group", id: GROUP_ID, label: "משפחה" },
        { kind: "user", id: "33333333-3333-4333-8333-333333333333", label: "דני" },
      ],
      "יו",
    )
    expect(list.map((c) => c.label)).toEqual(["יוסי כהן"])
  })

  it("builds candidates from participants and groups", () => {
    const candidates = buildMentionCandidates({
      currentUserId: "00000000-0000-4000-8000-000000000000",
      participants: [
        {
          user_id: USER_ID,
          profile: { display_name: "יוסי", avatar_url: null },
        },
      ],
      conversations: [
        {
          id: GROUP_ID,
          is_group: true,
          name: "עבודה",
          avatar_url: null,
        },
      ],
    })
    expect(candidates).toEqual([
      { kind: "user", id: USER_ID, label: "יוסי", avatarUrl: null },
      { kind: "group", id: GROUP_ID, label: "עבודה", avatarUrl: null },
    ])
  })
})

describe("splitTextWithLinks mentions", () => {
  it("parses mention tokens alongside emails", () => {
    expect(
      splitTextWithLinks(`תייג @[יוסי](user:${USER_ID}) ומייל a@example.com`),
    ).toEqual([
      { type: "text", value: "תייג " },
      { type: "mention", value: "יוסי", mentionKind: "user", mentionId: USER_ID },
      { type: "text", value: " ומייל " },
      { type: "email", value: "a@example.com" },
    ])
  })
})

describe("plainMessageText mentions", () => {
  it("strips mention tokens for previews", () => {
    expect(plainMessageText(`שלום @[יוסי](user:${USER_ID})`)).toBe("שלום @יוסי")
  })
})
