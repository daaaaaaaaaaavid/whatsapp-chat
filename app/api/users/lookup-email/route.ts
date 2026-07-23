import { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { checkRateLimitAsync } from "@/lib/rate-limit"
import { emailSchema } from "@/lib/validation"
import { withMinLatency } from "@/lib/timing-pad"

export const dynamic = "force-dynamic"

type SafeProfile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  about: string | null
}

const LOOKUP_MIN_MS = 320

function toSafeUser(row: SafeProfile | null | undefined) {
  if (!row) return null
  return {
    id: row.id,
    display_name: row.display_name ?? null,
    avatar_url: row.avatar_url ?? null,
    about: row.about ?? null,
    email: null,
    last_seen: null,
    created_at: new Date(0).toISOString(),
  }
}

function emailsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a.trim().toLowerCase())
  const right = Buffer.from(b.trim().toLowerCase())
  if (left.length !== right.length) return false
  try {
    return timingSafeEqual(left, right)
  } catch {
    return false
  }
}

async function lookupProfile(email: string): Promise<SafeProfile | null> {
  // Prefer service role so RPCs can be revoked from authenticated clients
  const admin = createServiceClient()
  const client = admin ?? (await createClient())

  const { data, error } = await client.rpc("find_user_by_email_safe", {
    p_email: email,
  })
  if (!error) {
    return (data as SafeProfile[] | null)?.[0] ?? null
  }

  const legacy = await client.rpc("find_user_by_email", { p_email: email })
  if (legacy.error) {
    throw new Error(error.message || legacy.error.message)
  }
  return (legacy.data as SafeProfile[] | null)?.[0] ?? null
}

export async function POST(req: Request) {
  return withMinLatency(LOOKUP_MIN_MS, async () => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const perMinute = await checkRateLimitAsync(`lookup-email:${user.id}`, 8, 60_000)
    if (!perMinute.ok) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec: perMinute.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(perMinute.retryAfterSec) } },
      )
    }

    const perHour = await checkRateLimitAsync(`lookup-email-hour:${user.id}`, 40, 60 * 60_000)
    if (!perHour.ok) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec: perHour.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(perHour.retryAfterSec) } },
      )
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }

    const rawEmail =
      body && typeof body === "object" && "email" in body
        ? String((body as { email?: unknown }).email ?? "")
        : ""
    const parsed = emailSchema.safeParse(rawEmail.trim())
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 })
    }

    if (user.email && emailsEqual(user.email, parsed.data)) {
      return NextResponse.json({ user: null })
    }

    try {
      const row = await lookupProfile(parsed.data)
      return NextResponse.json({ user: toSafeUser(row) })
    } catch (err) {
      console.error("lookup-email:", err instanceof Error ? err.message : err)
      return NextResponse.json({ error: "lookup_failed" }, { status: 500 })
    }
  })
}
