import { describe, expect, it } from "vitest"
import { splitTextWithLinks } from "@/lib/message-content"

describe("splitTextWithLinks", () => {
  it("detects email addresses inside message text", () => {
    expect(splitTextWithLinks("כתבו אל user@example.com בבקשה")).toEqual([
      { type: "text", value: "כתבו אל " },
      { type: "email", value: "user@example.com" },
      { type: "text", value: " בבקשה" },
    ])
  })

  it("keeps punctuation outside email addresses", () => {
    expect(splitTextWithLinks("המייל הוא hello+chat@example.co.il.")).toEqual([
      { type: "text", value: "המייל הוא " },
      { type: "email", value: "hello+chat@example.co.il" },
      { type: "text", value: "." },
    ])
  })

  it("detects multiple emails and links without treating URL contents as email", () => {
    expect(
      splitTextWithLinks("a@example.com https://example.com/contact/b@example.com b@example.com"),
    ).toEqual([
      { type: "email", value: "a@example.com" },
      { type: "text", value: " " },
      { type: "link", value: "https://example.com/contact/b@example.com" },
      { type: "text", value: " " },
      { type: "email", value: "b@example.com" },
    ])
  })

  it("detects gmail addresses used in chat", () => {
    expect(splitTextWithLinks("dc6427874@gmail.com")).toEqual([
      { type: "email", value: "dc6427874@gmail.com" },
    ])
  })
})
