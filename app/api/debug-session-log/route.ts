import { NextResponse } from "next/server"
import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"

export const dynamic = "force-dynamic"

/** Same-origin debug ingest (CSP blocks http://127.0.0.1 from the browser). */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  let line: string
  try {
    const body = await req.text()
    line = body.trim()
    if (!line) {
      return NextResponse.json({ ok: false, error: "empty" }, { status: 400 })
    }
    // Ensure single-line NDJSON
    JSON.parse(line)
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
  }

  const dir = path.join(process.cwd(), ".cursor")
  await mkdir(dir, { recursive: true })
  await appendFile(path.join(dir, "debug-29c9b8.log"), `${line}\n`, "utf8")
  return NextResponse.json({ ok: true })
}
