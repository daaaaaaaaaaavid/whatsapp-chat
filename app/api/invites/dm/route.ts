import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { checkRateLimitAsync } from "@/lib/rate-limit"
import { emailSchema } from "@/lib/validation"
import { buildDmInviteShareText, dmInvitePageUrl } from "@/lib/dm-invite-email"
import { withMinLatency } from "@/lib/timing-pad"

export const dynamic = "force-dynamic"

function makeDmToken(): string {
  const hex = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`.slice(
    0,
    32,
  )
  return `dm_${hex}`
}

async function lookupExistingUserId(email: string): Promise<string | null> {
  const admin = createServiceClient()
  const client = admin ?? (await createClient())

  const lookup = await client.rpc("find_user_by_email_safe", { p_email: email })
  if (!lookup.error) {
    return (lookup.data as { id: string }[] | null)?.[0]?.id ?? null
  }
  const legacy = await client.rpc("find_user_by_email", { p_email: email })
  return (legacy.data as { id: string }[] | null)?.[0]?.id ?? null
}

export async function POST(req: Request) {
  return withMinLatency(320, async () => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const limited = await checkRateLimitAsync(`dm-invite:${user.id}`, 30, 60 * 60_000)
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

    const conversationIdRaw =
      body && typeof body === "object" && "conversationId" in body
        ? String((body as { conversationId?: unknown }).conversationId ?? "").trim()
        : ""
    let conversationId: string | null = null
    if (conversationIdRaw) {
      if (!/^[0-9a-f-]{36}$/i.test(conversationIdRaw)) {
        return NextResponse.json({ error: "invalid_conversation" }, { status: 400 })
      }
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .select("id, created_by, is_group, name")
        .eq("id", conversationIdRaw)
        .maybeSingle()
      if (convError || !conv || conv.created_by !== user.id || conv.is_group) {
        return NextResponse.json({ error: "invalid_conversation" }, { status: 400 })
      }
      if ((conv.name ?? "").trim().toLowerCase() !== email) {
        return NextResponse.json({ error: "invalid_conversation" }, { status: 400 })
      }
      conversationId = conv.id
    }

    const existingId = await lookupExistingUserId(email)
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

    const { data: existingInvite } = await supabase
      .from("dm_invites")
      .select("id, token, expires_at, conversation_id")
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
        ...(conversationId ? { conversation_id: conversationId } : {}),
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
    } else if (
      conversationId &&
      existingInvite?.id &&
      existingInvite.conversation_id !== conversationId
    ) {
      const patch = { conversation_id: conversationId }
      const updated = await supabase
        .from("dm_invites")
        .update(patch)
        .eq("id", existingInvite.id)
        .eq("inviter_id", user.id)
      if (updated.error) {
        const admin = createServiceClient()
        if (admin) {
          await admin.from("dm_invites").update(patch).eq("id", existingInvite.id)
        }
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
  })
}
