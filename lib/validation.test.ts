import { describe, expect, it } from "vitest"
import {
  groupNameSchema,
  isValidEmail,
  messageTextSchema,
  pushNotifyBodySchema,
} from "@/lib/validation"

describe("validation", () => {
  it("validates emails", () => {
    expect(isValidEmail("a@b.com")).toBe(true)
    expect(isValidEmail("not-an-email")).toBe(false)
  })

  it("validates group names", () => {
    expect(groupNameSchema.safeParse("חברים").success).toBe(true)
    expect(groupNameSchema.safeParse("").success).toBe(false)
  })

  it("validates message text length", () => {
    expect(messageTextSchema.safeParse("שלום").success).toBe(true)
    expect(messageTextSchema.safeParse("x".repeat(4001)).success).toBe(false)
  })

  it("validates push notify body", () => {
    expect(
      pushNotifyBodySchema.safeParse({
        conversationId: "00000000-0000-4000-8000-000000000001",
        messageId: "00000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(true)
    expect(pushNotifyBodySchema.safeParse({ conversationId: "x" }).success).toBe(false)
  })
})
