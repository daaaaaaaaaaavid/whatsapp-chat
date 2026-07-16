import { describe, expect, it } from "vitest"
import {
  conversationSpace,
  filterConversationsBySpace,
  isWithinQuietHours,
  setConversationSpace,
  shouldSuppressSpaceNotification,
} from "@/lib/chat-space"
import type { ChatPrefs } from "@/lib/chat-prefs"

function prefs(partial: Partial<ChatPrefs> = {}): ChatPrefs {
  return {
    archived: [],
    favorites: [],
    pinned: [],
    muted: [],
    starredMessages: [],
    pinnedMessages: [],
    hiddenMessages: [],
    reactions: {},
    workConversations: [],
    activeSpace: "personal",
    workQuietHoursEnabled: true,
    workQuietStart: "18:00",
    workQuietEnd: "08:00",
    ...partial,
  }
}

describe("chat-space", () => {
  it("tags work without duplicating conversation ids incorrectly", () => {
    const p0 = prefs()
    expect(conversationSpace(p0, "a")).toBe("personal")
    const p1 = setConversationSpace(p0, "a", "work")
    expect(conversationSpace(p1, "a")).toBe("work")
    expect(p1.workConversations).toEqual(["a"])
    const p2 = setConversationSpace(p1, "a", "personal")
    expect(conversationSpace(p2, "a")).toBe("personal")
    expect(p2.workConversations).toEqual([])
  })

  it("filters by space", () => {
    const list = [
      { id: "1" },
      { id: "2" },
      { id: "3", work_space_id: "s1" },
    ]
    const p = prefs({ workConversations: ["2"] })
    expect(filterConversationsBySpace(list, p, "work").map((c) => c.id)).toEqual(["2", "3"])
    expect(filterConversationsBySpace(list, p, "personal").map((c) => c.id)).toEqual(["1"])
  })

  it("handles overnight quiet hours", () => {
    const evening = new Date(2026, 6, 16, 20, 0)
    const morning = new Date(2026, 6, 16, 7, 0)
    const midday = new Date(2026, 6, 16, 12, 0)
    expect(isWithinQuietHours("18:00", "08:00", evening)).toBe(true)
    expect(isWithinQuietHours("18:00", "08:00", morning)).toBe(true)
    expect(isWithinQuietHours("18:00", "08:00", midday)).toBe(false)
  })

  it("suppresses cross-space notifications", () => {
    const p = prefs({
      workConversations: ["w1"],
      activeSpace: "personal",
      workQuietHoursEnabled: false,
    })
    expect(shouldSuppressSpaceNotification(p, "w1")).toBe(true)
    expect(shouldSuppressSpaceNotification(p, "p1")).toBe(false)

    const workFocus = prefs({
      workConversations: ["w1"],
      activeSpace: "work",
      workQuietHoursEnabled: false,
    })
    expect(shouldSuppressSpaceNotification(workFocus, "w1")).toBe(false)
    expect(shouldSuppressSpaceNotification(workFocus, "p1")).toBe(true)
  })
})
