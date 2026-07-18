import { describe, expect, it } from "vitest"
import { parseYoutubeVideoId, youtubeWatchUrl } from "@/lib/youtube"

describe("parseYoutubeVideoId", () => {
  it("parses watch URLs", () => {
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(parseYoutubeVideoId("https://youtube.com/watch?v=dQw4w9WgXcQ&t=12")).toBe("dQw4w9WgXcQ")
  })

  it("parses short and embed URLs", () => {
    expect(parseYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(parseYoutubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(parseYoutubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("accepts bare ids", () => {
    expect(parseYoutubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("rejects invalid input", () => {
    expect(parseYoutubeVideoId("https://example.com")).toBeNull()
    expect(parseYoutubeVideoId("")).toBeNull()
  })

  it("builds watch url", () => {
    expect(youtubeWatchUrl("dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  })
})
