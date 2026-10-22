import type { Profile } from "@/lib/types"
import type { User } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { OWN_PROFILE_COLUMNS } from "@/lib/profile-fields"
import {
  avatarFromUser,
  displayNameFromUser,
  profileFromUser,
} from "@/lib/ensure-profile-client"

/**
 * Ensure the signed-in user has a row in public.profiles (server).
 * Never overwrites fields the user edited — only creates the row or fills empty ones.
 */
export async function ensureProfileServer(user: User): Promise<Profile> {
  const supabase = await createServerClient()

  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select(OWN_PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle()

  if (selectError) {
    console.error("ensureProfileServer:", selectError.message)
    return profileFromUser(user)
  }

  if (existing) {
    const missing: Partial<Pick<Profile, "display_name" | "avatar_url">> = {}
    if (!existing.display_name) missing.display_name = displayNameFromUser(user)
    if (!existing.avatar_url) {
      const avatar = avatarFromUser(user)
      if (avatar) missing.avatar_url = avatar
    }
    if (!Object.keys(missing).length) return profileFromUser(user, existing)

    const { data: filled, error: fillError } = await supabase
      .from("profiles")
      .update(missing)
      .eq("id", user.id)
      .select(OWN_PROFILE_COLUMNS)
      .single()
    if (fillError) console.error("ensureProfileServer:", fillError.message)
    return profileFromUser(user, filled ?? existing)
  }

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        display_name: displayNameFromUser(user),
        avatar_url: avatarFromUser(user),
        about: "זמין",
        last_seen: new Date().toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select(OWN_PROFILE_COLUMNS)
    .maybeSingle()

  if (insertError) {
    console.error("ensureProfileServer:", insertError.message)
    return profileFromUser(user)
  }
  if (created) return profileFromUser(user, created)

  // Row was created concurrently (e.g. auth trigger) — read it back.
  const { data: raced } = await supabase
    .from("profiles")
    .select(OWN_PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle()
  return profileFromUser(user, raced)
}

export { profileFromUser } from "@/lib/ensure-profile-client"
