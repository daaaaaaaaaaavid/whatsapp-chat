import type { Profile } from "@/lib/types"
import type { User } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import {
  avatarFromUser,
  displayNameFromUser,
  profileFromUser,
} from "@/lib/ensure-profile-client"

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
