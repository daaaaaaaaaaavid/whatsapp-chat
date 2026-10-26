import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/admin"
import { ilikeExactOr } from "@/lib/postgrest-or"
import type { Profile } from "@/lib/types"

type ContactRow = { id: string; email: string | null }

type Hit = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  about: string | null
  last_seen: string | null
  created_at: string
}

const PROFILE_COLUMNS = "id, email, display_name, avatar_url, about, last_seen, created_at"

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase()
  return email ? email : null
}

function toProfile(hit: Hit, email: string): Profile {
  return {
    id: hit.id,
    email,
    display_name: hit.display_name,
    avatar_url: hit.avatar_url,
    about: hit.about,
    last_seen: hit.last_seen,
    created_at: hit.created_at || new Date(0).toISOString(),
  }
}

async function loadViaAdmin(
  admin: NonNullable<ReturnType<typeof createServiceClient>>,
  emails: string[],
  userId: string,
): Promise<Map<string, Hit>> {
  const found = new Map<string, Hit>()
  const chunkSize = 30
  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize)
    const { data, error } = await admin
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .or(ilikeExactOr("email", chunk))
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as Hit[]) {
      if (row.id === userId) continue
      const email = normalizeEmail(row.email)
      if (!email || !chunk.includes(email)) continue
      found.set(email, row)
    }
  }
  return found
}

async function lookupOne(
  supabase: SupabaseClient,
  email: string,
): Promise<Hit | null> {
  const safe = await supabase.rpc("find_user_by_email_safe", { p_email: email })
  const safeRow = !safe.error ? ((safe.data as Hit[] | null)?.[0] ?? null) : null
  if (safeRow?.id) {
    return { ...safeRow, email, created_at: safeRow.created_at || new Date(0).toISOString() }
  }

  const legacy = await supabase.rpc("find_user_by_email", { p_email: email })
  if (legacy.error) {
    if (safe.error) throw new Error(safe.error.message || legacy.error.message)
    return null
  }
  const row = (legacy.data as Hit[] | null)?.[0]
  if (!row?.id) return null
  return { ...row, email, created_at: row.created_at || new Date(0).toISOString() }
}

async function loadViaRpc(
  supabase: SupabaseClient,
  emails: string[],
  userId: string,
): Promise<Map<string, Hit>> {
  const found = new Map<string, Hit>()
  const concurrency = 8
  let cursor = 0

  async function worker() {
    while (cursor < emails.length) {
      const email = emails[cursor++]
      const hit = await lookupOne(supabase, email)
      if (hit && hit.id !== userId) found.set(email, hit)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, emails.length) }, () => worker()))
  return found
}

/**
 * Link imported Google emails to WhaChat profiles.
 * The database function names its result column `id`, which Postgres treats as
 * ambiguous inside the function body. When that happens, match here instead.
 */
export async function matchStoredGoogleContacts(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | null,
): Promise<Profile[]> {
  const rpc = await supabase.rpc("match_my_google_contacts")
  if (!rpc.error) {
    return (rpc.data ?? []) as Profile[]
  }

  const msg = rpc.error.message.toLowerCase()
  const brokenFunction =
    msg.includes("ambiguous") ||
    msg.includes("does not exist") ||
    msg.includes("could not find") ||
    msg.includes("match_my_google_contacts")
  if (!brokenFunction) {
    throw new Error(rpc.error.message)
  }

  const { data: rows, error: rowsError } = await supabase
    .from("google_contacts")
    .select("id, email")
    .eq("user_id", userId)
  if (rowsError) throw new Error(rowsError.message)

  const own = normalizeEmail(userEmail)
  const idsByEmail = new Map<string, string[]>()
  for (const row of (rows ?? []) as ContactRow[]) {
    const email = normalizeEmail(row.email)
    if (!email || email === own) continue
    const list = idsByEmail.get(email) ?? []
    list.push(row.id)
    idsByEmail.set(email, list)
  }

  const { error: clearError } = await supabase
    .from("google_contacts")
    .update({ matched_profile_id: null })
    .eq("user_id", userId)
  if (clearError) throw new Error(clearError.message)

  const emails = [...idsByEmail.keys()]
  let hits = new Map<string, Hit>()
  if (emails.length) {
    const admin = createServiceClient()
    if (admin) {
      try {
        hits = await loadViaAdmin(admin, emails, userId)
      } catch (err) {
        console.error("google contacts match:", err instanceof Error ? err.message : err)
        hits = await loadViaRpc(supabase, emails, userId)
      }
    } else {
      hits = await loadViaRpc(supabase, emails, userId)
    }
  }

  const matched: Profile[] = []
  for (const [email, hit] of hits) {
    const contactIds = idsByEmail.get(email)
    if (!contactIds?.length) continue
    const { error: linkError } = await supabase
      .from("google_contacts")
      .update({ matched_profile_id: hit.id })
      .eq("user_id", userId)
      .in("id", contactIds)
    if (linkError) throw new Error(linkError.message)
    matched.push(toProfile(hit, email))
  }

  const { error: stampError } = await supabase
    .from("profiles")
    .update({ google_contacts_synced_at: new Date().toISOString() })
    .eq("id", userId)
  if (stampError) throw new Error(stampError.message)

  return matched
}
