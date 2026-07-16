import { describe, expect, it } from "vitest"
import {
  buildGoogleChatWebhookBody,
  isValidGoogleChatWebhookUrl,
  truncateGoogleChatText,
} from "@/lib/google-chat-webhook"

describe("google-chat-webhook", () => {
  it("accepts only chat.googleapis.com https webhooks", () => {
    expect(
      isValidGoogleChatWebhookUrl(
        "https://chat.googleapis.com/v1/spaces/AAA/messages?key=x&token=y",
      ),
    ).toBe(true)
    expect(isValidGoogleChatWebhookUrl("https://evil.com/v1/spaces/x")).toBe(false)
    expect(isValidGoogleChatWebhookUrl("http://chat.googleapis.com/v1/x")).toBe(false)
    expect(isValidGoogleChatWebhookUrl(null)).toBe(false)
  })

  it("truncates long text", () => {
    expect(truncateGoogleChatText("hi", 10)).toBe("hi")
    expect(truncateGoogleChatText("abcdefghij", 5)).toBe("abcd…")
  })

  it("builds a readable webhook payload", () => {
    const body = buildGoogleChatWebhookBody({
      senderName: "Dana",
      spaceName: "Product",
      channelName: "כללי",
      preview: "שלום צוות",
      openUrl: "https://example.com/chat?c=1",
    })
    expect(body.text).toContain("Dana")
    expect(body.text).toContain("#כללי")
    expect(body.text).toContain("שלום צוות")
    expect(body.text).toContain("https://example.com/chat?c=1")
  })
})
