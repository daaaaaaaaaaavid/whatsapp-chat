import { describe, expect, it } from "vitest"
import { buildStatusFeed, firstUnviewedIndex } from "@/lib/status-feed"
import type { Profile, Status } from "@/lib/types"

function profile(id: string): Profile {
  return { id, display_name: id } as Profile
}

function status(id: string, userId: string, minute: number): Status {
  return {
    id,
    user_id: userId,
    content: id,
    media_url: null,
    background_color: "#000",
    created_at: new Date(Date.UTC(2026, 0, 1, 10, minute)).toISOString(),
    expires_at: new Date(Date.UTC(2026, 0, 1, 22, minute)).toISOString(),
    audience_mode: "contacts",
    audience_user_ids: [],
    profile: profile(userId),
  }
}

describe("buildStatusFeed", () => {
  const statuses = [
    status("a2", "alice", 20),
    status("me1", "me", 5),
    status("a1", "alice", 1),
    status("b1", "bob", 30),
    status("c1", "carol", 40),
  ]

  it("separates my statuses and orders each group oldest first", () => {
    const feed = buildStatusFeed(statuses, "me", new Set())
    expect(feed.mine.map((s) => s.id)).toEqual(["me1"])
    const alice = feed.recent.find((g) => g.profile.id === "alice")
    expect(alice?.statuses.map((s) => s.id)).toEqual(["a1", "a2"])
  })

  it("orders contacts by their newest status", () => {
    const feed = buildStatusFeed(statuses, "me", new Set())
    expect(feed.recent.map((g) => g.profile.id)).toEqual(["carol", "bob", "alice"])
  })

  it("moves a contact to viewed only when every status was seen", () => {
    const feed = buildStatusFeed(statuses, "me", new Set(["a1", "b1"]))
    expect(feed.recent.map((g) => g.profile.id)).toEqual(["carol", "alice"])
    expect(feed.viewed.map((g) => g.profile.id)).toEqual(["bob"])
  })
})

describe("firstUnviewedIndex", () => {
  it("resumes at the first unseen status", () => {
    const group = { profile: profile("alice"), statuses: [status("a1", "alice", 1), status("a2", "alice", 2)] }
    expect(firstUnviewedIndex(group, new Set(["a1"]))).toBe(1)
    expect(firstUnviewedIndex(group, new Set(["a1", "a2"]))).toBe(0)
  })
})
