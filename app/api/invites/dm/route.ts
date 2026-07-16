import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { emailSchema } from "@/lib/validation"
import { buildDmInviteShareText, dmInvitePageUrl } from "@/lib/dm-invite-email"

export const dynamic = "force-dynamic"

function makeDmToken(): string {
  const hex = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`.slice(
    0,
    32,
  )
  return `dm_${hex}`
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limited = checkRateLimit(`dm-invite:${user.id}`, 30, 60 * 60_000)
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
  const parsed = emailSchema.safeParse(rawEmail.trim().toLowerCase())
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 })
  }

  const email = parsed.data
  if (user.email && email === user.email.trim().toLowerCase()) {
    return NextResponse.json({ error: "cannot_invite_self" }, { status: 400 })
  }

  // If already registered — open chat instead of inviting
  const lookup = await supabase.rpc("find_user_by_email_safe", { p_email: email })
  let existingId: string | null = null
  if (!lookup.error) {
    const row = (lookup.data as { id: string }[] | null)?.[0]
    existingId = row?.id ?? null
  } else {
    const legacy = await supabase.rpc("find_user_by_email", { p_email: email })
    existingId = (legacy.data as { id: string }[] | null)?.[0]?.id ?? null
  }

  if (existingId) {
    return NextResponse.json({
      status: "already_registered",
      userId: existingId,
    })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle()

  const inviterName =
    profile?.display_name?.trim() ||
    user.user_metadata?.display_name ||
    profile?.email ||
    user.email ||
    "משתמש"

  // Reuse open invite if present
  const { data: existingInvite } = await supabase
    .from("dm_invites")
    .select("token, expires_at")
    .eq("inviter_id", user.id)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .ilike("invitee_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let token = existingInvite?.token as string | undefined
  if (!token) {
    token = makeDmToken()
    const { error: insertError } = await supabase.from("dm_invites").insert({
      token,
      inviter_id: user.id,
      invitee_email: email,
    })
    if (insertError) {
      const msg = insertError.message.toLowerCase()
      if (msg.includes("dm_invites") || msg.includes("does not exist")) {
        return NextResponse.json(
          { error: "migration_required", message: "הרץ את supabase/migration-dm-invites.sql" },
          { status: 503 },
        )
      }
      console.error("dm_invites insert:", insertError.message)
      return NextResponse.json({ error: "create_failed" }, { status: 500 })
    }
  }

  const inviteUrl = dmInvitePageUrl(token)
  const shareText = buildDmInviteShareText({
    inviterName: String(inviterName),
    inviteUrl,
  })

  return NextResponse.json({
    status: "invited",
    token,
    inviteUrl,
    shareText,
    email,
    inviterName: String(inviterName),
  })
}
