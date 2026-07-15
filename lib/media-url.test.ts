import { describe, expect, it } from "vitest"
import { parseMediaStoragePath } from "@/lib/media-url"

describe("parseMediaStoragePath", () => {
  it("parses public media URLs", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/public/media/user1/conv1/file.jpg"
    expect(parseMediaStoragePath(url)).toBe("user1/conv1/file.jpg")
  })

  it("parses signed media URLs", () => {
    const url =
      "https://xyz.supabase.co/storage/v1/object/sign/media/user1/conv1/file.jpg?token=abc"
    expect(parseMediaStoragePath(url)).toBe("user1/conv1/file.jpg")
  })

  it("accepts raw paths", () => {
    expect(parseMediaStoragePath("user1/avatar-1.png")).toBe("user1/avatar-1.png")
  })
})
