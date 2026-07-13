import type { Profile } from "@/lib/types"
import type { User } from "@supabase/supabase-js"
import { createClient as createBrowserClient, ensureSupabaseConfig } from "@/lib/supabase/client"

function displayNameFromUser(user: User) {
  const meta = user.user_metadata ?? {}
  return (
    (meta.display_name as string | undefined)?.trim() ||
    (meta.full_name as string | undefined)?.trim() ||
    (meta.name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "משתמש"
  )
}

function avatarFromUser(user: User) {
  const meta = user.user_metadata ?? {}
  return (
    (meta.avatar_url as string | undefined)?.trim() ||
    (meta.picture as string | undefined)?.trim() ||
    null
  )
}

export function profileFromUser(user: User, row?: Partial<Profile> | null): Profile {
  return {
    id: user.id,
    email: row?.email ?? user.email ?? null,
    display_name: row?.display_name ?? displayNameFromUser(user),
    avatar_url: row?.avatar_url ?? avatarFromUser(user),
    about: row?.about ?? "זמין",
    last_seen: row?.last_seen ?? null,
    created_at: row?.created_at ?? new Date().toISOString(),
  }
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
