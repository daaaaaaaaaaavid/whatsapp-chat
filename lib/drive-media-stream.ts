import { NextResponse } from "next/server"

const DRIVE_MEDIA = "https://www.googleapis.com/drive/v3/files"

export function driveMediaUnavailable() {
  return NextResponse.json({ error: "unavailable" }, { status: 404 })
}

/** Stream a Drive file with the owner's token. Nothing is copied to the viewer. */
export async function proxyDriveMedia(
  req: Request,
  accessToken: string,
  fileId: string,
): Promise<NextResponse> {
  const range = req.headers.get("range")
  let upstream: Response
  try {
    upstream = await fetch(`${DRIVE_MEDIA}/${encodeURIComponent(fileId)}?alt=media`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(range ? { Range: range } : {}),
      },
    })
  } catch (err) {
    console.error("drive media fetch:", err instanceof Error ? err.message : err)
    return driveMediaUnavailable()
  }

  if (upstream.status === 404 || upstream.status === 403 || upstream.status === 401) {
    return driveMediaUnavailable()
  }
  if (!upstream.ok && upstream.status !== 206) {
    console.error("drive media stream:", upstream.status)
    return driveMediaUnavailable()
  }

  const headers = new Headers()
  headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream")
  headers.set("Content-Disposition", "inline")
  headers.set("Cache-Control", "private, no-store")
  headers.set("Accept-Ranges", "bytes")
  headers.set("X-Content-Type-Options", "nosniff")
  const length = upstream.headers.get("content-length")
  if (length) headers.set("Content-Length", length)
  const contentRange = upstream.headers.get("content-range")
  if (contentRange) headers.set("Content-Range", contentRange)

  return new NextResponse(upstream.body, { status: upstream.status, headers })
}
