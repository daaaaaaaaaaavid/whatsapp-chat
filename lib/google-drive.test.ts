import { describe, expect, it } from "vitest"
import {
  driveCopyKey,
  driveMediaKindHint,
  driveMediaReferenceUrl,
  isDriveMediaUrl,
  parseDriveMediaRef,
  withDriveMediaHash,
} from "@/lib/google-drive"

const OWNER = "11111111-1111-4111-8111-111111111111"
const FILE = "1AbCDefGhIjkLmnopQRstuVWXyz012345"

describe("drive media refs", () => {
  it("round-trips owner and file id", () => {
    const url = driveMediaReferenceUrl(OWNER, FILE, "whachat=video")
    expect(isDriveMediaUrl(url)).toBe(true)
    expect(parseDriveMediaRef(url)).toEqual({
      ownerId: OWNER,
      fileId: FILE,
      hash: "whachat=video",
    })
    expect(driveCopyKey(OWNER, FILE)).toBe(`${OWNER}/${FILE}`)
  })

  it("rejects supabase and junk urls", () => {
    expect(parseDriveMediaRef("https://xyz.supabase.co/storage/v1/object/public/media/a/b.jpg")).toBeNull()
    expect(parseDriveMediaRef(`gdrive:not-a-uuid/${FILE}`)).toBeNull()
    expect(parseDriveMediaRef(`gdrive:${OWNER}/nope*`)).toBeNull()
    expect(isDriveMediaUrl(null)).toBe(false)
  })

  it("keeps duration hints on drive urls", () => {
    const url = driveMediaReferenceUrl(OWNER, FILE)
    const withHint = withDriveMediaHash(url, "d=12.3")
    expect(withHint).toBe(`gdrive:${OWNER}/${FILE}#d=12.3`)
    expect(driveMediaKindHint(`${url}#whachat=video`)).toBe("video")
    expect(driveMediaKindHint(`${url}#whachat=image`)).toBe("image")
  })
})
