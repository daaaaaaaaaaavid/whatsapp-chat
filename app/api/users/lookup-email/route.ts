import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { emailSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

type SafeProfile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  about: string | null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limited = checkRateLimit(`lookup-email:${user.id}`, 20, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
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

  const { data, error } = await supabase.rpc("find_user_by_email_safe", {
    p_email: parsed.data,
  })

  if (error) {
    // Fall back to hardened legacy RPC if safe one isn't migrated yet
    const legacy = await supabase.rpc("find_user_by_email", { p_email: parsed.data })
    if (legacy.error) {
      console.error("lookup-email:", error.message)
      return NextResponse.json({ error: "lookup_failed" }, { status: 500 })
    }
    const row = (legacy.data as SafeProfile[] | null)?.[0]
    if (!row) return NextResponse.json({ user: null })
    return NextResponse.json({
      user: {
        id: row.id,
        display_name: row.display_name ?? null,
        avatar_url: row.avatar_url ?? null,
        about: row.about ?? null,
        email: null,
        last_seen: null,
        created_at: new Date(0).toISOString(),
      },
    })
  }

  const row = (data as SafeProfile[] | null)?.[0]
  if (!row) return NextResponse.json({ user: null })

  return NextResponse.json({
    user: {
      id: row.id,
      display_name: row.display_name ?? null,
      avatar_url: row.avatar_url ?? null,
      about: row.about ?? null,
      email: null,
      last_seen: null,
      created_at: new Date(0).toISOString(),
    },
  })
}
