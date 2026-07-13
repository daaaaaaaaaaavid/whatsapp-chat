import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fetchGooglePeopleConnections } from "@/lib/google-contacts"
import type { Profile } from "@/lib/types"

type Body = {
  provider_token?: string
}

export async function POST(req: Request) {
  let payload: Body
  try {
    payload = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const providerToken = payload.provider_token?.trim()
  if (!providerToken) {
    return NextResponse.json(
      { error: "missing_token", message: "חסר טוקן Google. נסה לסנכרן שוב." },
      { status: 400 },
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let contacts
  try {
    contacts = await fetchGooglePeopleConnections(providerToken)
  } catch (err) {
    const message = err instanceof Error ? err.message : "נכשל בטעינת אנשי קשר מגוגל"
    const needsReauth =
      /insufficient|permission|scope|auth|401|403/i.test(message) ||
      message.toLowerCase().includes("request had insufficient authentication scopes")
    return NextResponse.json(
      {
        error: needsReauth ? "needs_reauth" : "google_api_error",
        message: needsReauth
          ? "נדרשת הרשאה מחדש לאנשי הקשר של Google."
          : message,
      },
      { status: needsReauth ? 403 : 502 },
    )
  }

  const syncedAt = new Date().toISOString()

  if (contacts.length > 0) {
    const rows = contacts.map((c) => ({
      user_id: user.id,
      google_resource_name: c.google_resource_name,
      display_name: c.display_name,
      email: c.email,
      photo_url: c.photo_url,
      matched_profile_id: null as string | null,
      synced_at: syncedAt,
    }))

    const { error: upsertError } = await supabase
      .from("google_contacts")
      .upsert(rows, { onConflict: "user_id,google_resource_name" })

    if (upsertError) {
      const msg = upsertError.message.toLowerCase()
      if (msg.includes("google_contacts") || msg.includes("does not exist")) {
        return NextResponse.json(
          {
            error: "missing_table",
            message:
              "חסרה טבלת אנשי קשר. הרץ את supabase/migration-google-contacts.sql ב־SQL Editor של Supabase.",
          },
          { status: 500 },
        )
      }
      return NextResponse.json(
        { error: "upsert_failed", message: upsertError.message },
        { status: 500 },
      )
    }
  }

  const { error: deleteError } = await supabase
    .from("google_contacts")
    .delete()
    .eq("user_id", user.id)
    .lt("synced_at", syncedAt)

  if (deleteError) {
    const msg = deleteError.message.toLowerCase()
    if (msg.includes("google_contacts") || msg.includes("does not exist")) {
      return NextResponse.json(
        {
          error: "missing_table",
          message:
            "חסרה טבלת אנשי קשר. הרץ את supabase/migration-google-contacts.sql ב־SQL Editor של Supabase.",
        },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: "delete_failed", message: deleteError.message }, { status: 500 })
  }

  const { data: matchedRows, error: matchError } = await supabase.rpc("match_my_google_contacts")
  if (matchError) {
    const msg = matchError.message.toLowerCase()
    if (msg.includes("function") && msg.includes("does not exist")) {
      return NextResponse.json(
        {
          error: "missing_rpc",
          message:
            "חסרה פונקציית התאמה. הרץ את supabase/migration-google-contacts.sql ב־SQL Editor של Supabase.",
        },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: "match_failed", message: matchError.message }, { status: 500 })
  }

  const matched = (matchedRows ?? []) as Profile[]
  const matchedIds = new Set(matched.map((p) => p.id))

  const { data: stored } = await supabase
    .from("google_contacts")
    .select("id, display_name, email, photo_url, matched_profile_id, google_resource_name")
    .eq("user_id", user.id)
    .order("display_name", { ascending: true })

  const unmatched = (stored ?? []).filter(
    (row) => !row.matched_profile_id || !matchedIds.has(row.matched_profile_id),
  )

  return NextResponse.json({
    ok: true,
    syncedAt,
    matched,
    unmatched,
    importedCount: contacts.length,
  })
}
