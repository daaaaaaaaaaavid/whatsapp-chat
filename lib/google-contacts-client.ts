"use client"

import { createClient, ensureSupabaseConfig } from "@/lib/supabase/client"
import type { GoogleContact, Profile } from "@/lib/types"

export type GoogleContactsResult = {
  matched: Profile[]
  unmatched: GoogleContact[]
  syncedAt: string | null
  error: string | null
}

export type SyncGoogleContactsResult = {
  matched: Profile[]
  unmatched: GoogleContact[]
  syncedAt: string
  importedCount: number
}

function errMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as { message?: string }).message || "")
    if (msg) return msg
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/** Load previously synced Google contacts + matched WhaChat profiles. */
export async function fetchGoogleContacts(): Promise<GoogleContactsResult> {
  try {
    await ensureSupabaseConfig()
    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { matched: [], unmatched: [], syncedAt: null, error: "לא מחובר" }
    }

    const { data: rows, error } = await supabase
      .from("google_contacts")
      .select("id, google_resource_name, display_name, email, photo_url, matched_profile_id")
      .eq("user_id", user.id)
      .order("display_name", { ascending: true })

    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes("google_contacts") || msg.includes("does not exist") || error.code === "42P01") {
        return {
          matched: [],
          unmatched: [],
          syncedAt: null,
          error:
            "חסרה טבלת אנשי קשר מגוגל. הרץ את supabase/migration-google-contacts.sql ב־Supabase.",
        }
      }
      return { matched: [], unmatched: [], syncedAt: null, error: error.message }
    }

    const contacts = (rows ?? []) as GoogleContact[]

    let matched: Profile[] = []
    if (contacts.length) {
      const { data: profiles, error: profilesError } = await supabase.rpc(
        "match_my_google_contacts",
      )
      if (profilesError) {
        const msg = profilesError.message.toLowerCase()
        if (msg.includes("function") && msg.includes("does not exist")) {
          return {
            matched: [],
            unmatched: contacts,
            syncedAt: null,
            error:
              "חסרה פונקציית התאמה. הרץ את supabase/migration-google-contacts.sql ב־Supabase.",
          }
        }
        return {
          matched: [],
          unmatched: contacts.filter((c) => !c.matched_profile_id),
          syncedAt: null,
          error: profilesError.message,
        }
      }
      matched = (profiles ?? []) as Profile[]
    }

    // Refresh contact rows after rematch so unmatched reflects latest matched_profile_id
    const { data: refreshed } = await supabase
      .from("google_contacts")
      .select("id, google_resource_name, display_name, email, photo_url, matched_profile_id")
      .eq("user_id", user.id)
      .order("display_name", { ascending: true })

    const latest = (refreshed ?? contacts) as GoogleContact[]
    const matchedSet = new Set(matched.map((p) => p.id))
    const unmatched = latest.filter(
      (c) => !c.matched_profile_id || !matchedSet.has(c.matched_profile_id),
    )

    const { data: me } = await supabase
      .from("profiles")
      .select("google_contacts_synced_at")
      .eq("id", user.id)
      .maybeSingle()

    return {
      matched,
      unmatched,
      syncedAt: (me?.google_contacts_synced_at as string | null) ?? null,
      error: null,
    }
  } catch (err) {
    return {
      matched: [],
      unmatched: [],
      syncedAt: null,
      error: err instanceof Error ? err.message : "שגיאה בטעינת אנשי קשר מגוגל",
    }
  }
}

/** Sync using a Google OAuth provider_token (People API). */
export async function syncGoogleContacts(
  providerToken: string,
): Promise<SyncGoogleContactsResult> {
  const res = await fetch("/api/contacts/google-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider_token: providerToken }),
  })

  const data = (await res.json()) as {
    ok?: boolean
    error?: string
    message?: string
    matched?: Profile[]
    unmatched?: GoogleContact[]
    syncedAt?: string
    importedCount?: number
  }

  if (!res.ok || !data.ok) {
    const err = new Error(data.message || errMessage(data, "נכשל בסנכרון אנשי קשר מגוגל")) as Error & {
      code?: string
    }
    err.code = data.error
    throw err
  }

  return {
    matched: data.matched ?? [],
    unmatched: (data.unmatched ?? []) as GoogleContact[],
    syncedAt: data.syncedAt ?? new Date().toISOString(),
    importedCount: data.importedCount ?? 0,
  }
}

/** Prefer an existing session provider_token; otherwise start contacts OAuth. */
export async function syncGoogleContactsOrConnect(): Promise<
  SyncGoogleContactsResult | "redirecting"
> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const token = session?.provider_token
  if (token) {
    try {
      return await syncGoogleContacts(token)
    } catch (err) {
      const code = (err as Error & { code?: string })?.code
      const msg = err instanceof Error ? err.message : ""
      const needsReauth =
        code === "needs_reauth" || /הרשאה מחדש|insufficient|scope/i.test(msg)
      if (!needsReauth) throw err
    }
  }

  const { connectGoogleContacts } = await import("@/lib/auth-google")
  await connectGoogleContacts("/chat?google_contacts=1")
  return "redirecting"
}
