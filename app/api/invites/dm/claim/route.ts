import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

type InviteRow = {
  id: string
  conversation_id: string | null
  inviter_id: string
}

type ConvRow = {
  id: string
  created_by: string | null
  is_group: boolean
  name: string | null
  pending_email?: string | null
}

function targetEmail(conv: ConvRow): string {
  return (conv.pending_email || conv.name || "").trim().toLowerCase()
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const email = user.email?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: true, claimed: 0 })
  }

  const admin = createServiceClient()
  if (!admin) {
    const { error } = await supabase.rpc("claim_pending_email_chats")
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes("does not exist") || msg.includes("could not find")) {
        return NextResponse.json({ ok: true, claimed: 0, pendingMigration: true })
      }
      console.error("claim_pending_email_chats:", error.message)
      return NextResponse.json({ ok: false }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const { data: invites, error: inviteError } = await admin
    .from("dm_invites")
    .select("id, conversation_id, inviter_id")
    .ilike("invitee_email", email)
    .is("accepted_at", null)

  if (inviteError) {
    const msg = inviteError.message.toLowerCase()
    if (msg.includes("dm_invites") || msg.includes("does not exist")) {
      return NextResponse.json({ ok: true, claimed: 0, pendingMigration: true })
    }
    console.error("claim invites:", inviteError.message)
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  let claimed = 0
  for (const invite of (invites ?? []) as InviteRow[]) {
    if (!invite.conversation_id || invite.inviter_id === user.id) continue

    let convResult = await admin
      .from("conversations")
      .select("id, created_by, is_group, name, pending_email")
      .eq("id", invite.conversation_id)
      .maybeSingle()

    if (convResult.error && /pending_email/i.test(convResult.error.message)) {
      convResult = await admin
        .from("conversations")
        .select("id, created_by, is_group, name")
        .eq("id", invite.conversation_id)
        .maybeSingle()
    }

    const conv = convResult.data as ConvRow | null
    if (!conv || conv.is_group || conv.created_by !== invite.inviter_id) continue
    if (targetEmail(conv) !== email) continue

    const { error: joinError } = await admin.from("conversation_participants").upsert(
      {
        conversation_id: conv.id,
        user_id: user.id,
        is_admin: false,
      },
      { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
    )
    if (!joinError) claimed += 1
  }

  return NextResponse.json({ ok: true, claimed })
}
