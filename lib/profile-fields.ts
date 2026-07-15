/** Columns safe to expose for other users (identity / presence). */
export const PUBLIC_PROFILE_COLUMNS =
  "id, display_name, avatar_url, about, last_seen, created_at" as const

/** Columns for the signed-in user's own profile row. */
export const OWN_PROFILE_COLUMNS =
  "id, email, display_name, avatar_url, about, last_seen, created_at, chat_prefs, blocked_user_ids, google_contacts_synced_at" as const
