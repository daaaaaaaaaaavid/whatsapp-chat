import type { Profile } from "@/lib/types"
import type { User } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { profileFromUser } from "@/lib/ensure-profile-client"

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

/** Ensure the signed-in user has a row in public.profiles (server). */
export async function ensureProfileServer(user: User): Promise<Profile> {
  const supabase = await createServerClient()
  const payload = {
    id: user.id,
    email: user.email ?? null,
    display_name: displayNameFromUser(user),
    avatar_url: avatarFromUser(user),
    about: "זמין",
    last_seen: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single()

  if (error) {
    console.error("ensureProfileServer:", error.message)
    return profileFromUser(user)
  }

  return profileFromUser(user, data)
}

export { profileFromUser } from "@/lib/ensure-profile-client"
