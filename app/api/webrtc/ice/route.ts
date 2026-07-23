import { createHmac } from "crypto"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimitAsync } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

type IceServerJson = {
  urls: string | string[]
  username?: string
  credential?: string
}

const STUN_SERVERS: IceServerJson[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
]

const DEFAULT_TTL_SEC = 60 * 60 // 1 hour

function parseTurnUrls(): string[] {
  const raw = process.env.TURN_URLS || process.env.NEXT_PUBLIC_TURN_URLS || ""
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * coturn static-auth-secret style:
 * username = `${expiryUnix}:${userId}`
 * credential = base64(hmac-sha1(secret, username))
 */
function timeLimitedTurnCredential(
  userId: string,
  secret: string,
  ttlSec: number,
): { username: string; credential: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSec
  const username = `${expiresAt}:${userId}`
  const credential = createHmac("sha1", secret).update(username).digest("base64")
  return { username, credential, expiresAt }
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limited = await checkRateLimitAsync(`webrtc-ice:${user.id}`, 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    )
  }

  const iceServers: IceServerJson[] = [...STUN_SERVERS]
  const turnUrls = parseTurnUrls()
  let expiresAt: number | null = null

  if (turnUrls.length) {
    const secret = process.env.TURN_AUTH_SECRET?.trim()
    if (secret) {
      const creds = timeLimitedTurnCredential(user.id, secret, DEFAULT_TTL_SEC)
      expiresAt = creds.expiresAt
      iceServers.push({
        urls: turnUrls.length === 1 ? turnUrls[0]! : turnUrls,
        username: creds.username,
        credential: creds.credential,
      })
    } else {
      const username =
        process.env.TURN_USERNAME?.trim() ||
        process.env.NEXT_PUBLIC_TURN_USERNAME?.trim() ||
        ""
      const credential =
        process.env.TURN_CREDENTIAL?.trim() ||
        process.env.NEXT_PUBLIC_TURN_CREDENTIAL?.trim() ||
        ""
      if (username && credential) {
        iceServers.push({
          urls: turnUrls.length === 1 ? turnUrls[0]! : turnUrls,
          username,
          credential,
        })
        expiresAt = Math.floor(Date.now() / 1000) + DEFAULT_TTL_SEC
      }
    }
  }

  return NextResponse.json({
    iceServers,
    iceCandidatePoolSize: 8,
    expiresAt,
  })
}
