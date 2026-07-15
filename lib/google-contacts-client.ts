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

/** True if name or email contains the search query (case-insensitive). Empty query matches all. */
export function contactMatchesQuery(
  name: string | null | undefined,
  email: string | null | undefined,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const n = (name ?? "").toLowerCase()
  const e = (email ?? "").toLowerCase()
  return n.includes(q) || e.includes(q)
}

/** Lower score = better match (prefer starts-with, then includes). */
export function contactMatchScore(
  name: string | null | undefined,
  email: string | null | undefined,
  query: string,
): number {
  const q = query.trim().toLowerCase()
  if (!q) return 50
  const n = (name ?? "").toLowerCase()
  const e = (email ?? "").toLowerCase()
  if (e === q || n === q) return 0
  if (e.startsWith(q) || n.startsWith(q)) return 1
  if (n.includes(q)) return 2
  if (e.includes(q)) return 3
  return 99
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
    const matchedIds = Array.from(
      new Set(
        contacts
          .map((c) => c.matched_profile_id)
          .filter((id): id is string => Boolean(id)),
      ),
    )
    if (matchedIds.length) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, about, last_seen, created_at")
        .in("id", matchedIds)
      if (profilesError) {
        return {
          matched: [],
          unmatched: contacts.filter((c) => !c.matched_profile_id),
          syncedAt: null,
          error: profilesError.message,
        }
      }
      matched = (profiles ?? []) as Profile[]
    }

    const matchedSet = new Set(matched.map((p) => p.id))
    const unmatched = contacts.filter(
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
