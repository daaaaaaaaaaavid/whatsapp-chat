import type { Profile } from "@/lib/types"
import type { User } from "@supabase/supabase-js"
import { createClient as createBrowserClient, ensureSupabaseConfig } from "@/lib/supabase/client"
import { createClient as createServerClient } from "@/lib/supabase/server"

function displayNameFromUser(user: User) {
  return (
    (user.user_metadata?.display_name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "משתמש"
  )
}

export function profileFromUser(user: User, row?: Partial<Profile> | null): Profile {
  return {
    id: user.id,
    email: row?.email ?? user.email ?? null,
    display_name: row?.display_name ?? displayNameFromUser(user),
    avatar_url: row?.avatar_url ?? null,
    about: row?.about ?? "זמין",
    last_seen: row?.last_seen ?? null,
    created_at: row?.created_at ?? new Date().toISOString(),
  }
}

/** Ensure the signed-in user has a row in public.profiles (server). */
export async function ensureProfileServer(user: User): Promise<Profile> {
  const supabase = await createServerClient()
  const payload = {
    id: user.id,
    email: user.email ?? null,
    display_name: displayNameFromUser(user),
    about: "זמין",
    last_seen: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single()

  if (error) {
    // Table may not exist yet — return a local profile so the UI still loads
    console.error("ensureProfileServer:", error.message)
    return profileFromUser(user)
  }

  return profileFromUser(user, data)
}

/** Ensure profile exists from the browser (after ensureSupabaseConfig). */
export async function ensureProfileClient(user: {
  id: string
  email?: string | null
  display_name?: string | null
}): Promise<Profile | null> {
  await ensureSupabaseConfig()
  const supabase = createBrowserClient()
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name: user.display_name ?? user.email?.split("@")[0] ?? "משתמש",
        about: "זמין",
        last_seen: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("*")
    .single()

  if (error) {
    console.error("ensureProfileClient:", error.message)
    return null
  }
  return data as Profile
}
