import { describe, expect, it } from "vitest"
import { canComposeInConversation, chatRequestView } from "@/lib/chat-request"
import type { Conversation } from "@/lib/types"

function conv(partial: Partial<Conversation>): Conversation {
  return {
    id: "c1",
    is_group: false,
    name: null,
    avatar_url: null,
    created_by: "alice",
    created_at: "",
    updated_at: "",
    participants: [
      { id: "p1", conversation_id: "c1", user_id: "alice", is_admin: false, joined_at: "" },
      { id: "p2", conversation_id: "c1", user_id: "bob", is_admin: false, joined_at: "" },
    ],
    ...partial,
  }
}

describe("chatRequestView", () => {
  it("treats existing and group chats as normal", () => {
    expect(chatRequestView(conv({ request_status: "accepted" }), "bob")).toBe("none")
    expect(chatRequestView(conv({ request_status: null }), "bob")).toBe("none")
    expect(chatRequestView(conv({ is_group: true, request_status: "pending" }), "bob")).toBe("none")
  })

  it("keeps notes-to-self out of the request flow", () => {
    expect(
      chatRequestView(
        conv({
          request_status: "pending",
          created_by: "alice",
          participants: [
            { id: "p1", conversation_id: "c1", user_id: "alice", is_admin: false, joined_at: "" },
          ],
        }),
        "alice",
      ),
    ).toBe("none")
  })

  it("shows a pending request to the recipient and a waiting state to the sender", () => {
    const pending = conv({ request_status: "pending", created_by: "alice" })
    expect(chatRequestView(pending, "alice")).toBe("outgoing")
    expect(chatRequestView(pending, "bob")).toBe("incoming")
    expect(canComposeInConversation(pending, "alice")).toBe(true)
    expect(canComposeInConversation(pending, "bob")).toBe(false)
  })

  it("hides a declined request from the person who said no", () => {
    const declined = conv({ request_status: "declined", created_by: "alice" })
    expect(chatRequestView(declined, "alice")).toBe("declined")
    expect(chatRequestView(declined, "bob")).toBe("hidden")
    expect(canComposeInConversation(declined, "alice")).toBe(false)
  })
})
