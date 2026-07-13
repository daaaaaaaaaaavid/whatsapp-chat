"use client"

import { createClient, ensureSupabaseConfig } from "@/lib/supabase/client"
import type { Profile } from "@/lib/types"

function errMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as { message?: string }).message || "")
    if (msg) return msg
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/** Find or create a notes-to-self conversation (single participant: you). */
export async function getOrCreateSelfConversation(currentUserId: string): Promise<string> {
  await ensureSupabaseConfig()
  const supabase = createClient()

  const { data: mine, error: mineErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", currentUserId)
  if (mineErr) throw new Error(errMessage(mineErr, "נכשל בטעינת שיחות"))

  const myConvIds = (mine ?? []).map((p) => p.conversation_id)

  if (myConvIds.length) {
    const { data: allParts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", myConvIds)

    const byConv = new Map<string, string[]>()
    for (const row of allParts ?? []) {
      const list = byConv.get(row.conversation_id) ?? []
      list.push(row.user_id)
      byConv.set(row.conversation_id, list)
    }

    const soloIds = [...byConv.entries()]
      .filter(([, users]) => users.length === 1 && users[0] === currentUserId)
      .map(([id]) => id)

    if (soloIds.length) {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, is_group")
        .in("id", soloIds)
        .eq("is_group", false)
      if (convs && convs.length) return convs[0].id
    }
  }

  const conversationId = crypto.randomUUID()
  const { error } = await supabase.from("conversations").insert({
    id: conversationId,
    is_group: false,
    created_by: currentUserId,
  })
  if (error) {
    throw new Error(
      errMessage(error, "נכשל ביצירת שיחה. ודא שהרצת את schema.sql ב־Supabase."),
    )
  }

  const { error: partsError } = await supabase.from("conversation_participants").insert({
    conversation_id: conversationId,
    user_id: currentUserId,
  })
  if (partsError) {
    await supabase.from("conversations").delete().eq("id", conversationId)
    throw new Error(errMessage(partsError, "נכשל בהוספת משתתפים לשיחה"))
  }

  return conversationId
}

// Find an existing 1-on-1 conversation between two users, or create one.
export async function getOrCreateDirectConversation(currentUserId: string, otherUserId: string): Promise<string> {
  if (otherUserId === currentUserId) {
    return getOrCreateSelfConversation(currentUserId)
  }

  await ensureSupabaseConfig()
  const supabase = createClient()

  const { data: mine, error: mineErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", currentUserId)
  if (mineErr) throw new Error(errMessage(mineErr, "נכשל בטעינת שיחות"))

  const myConvIds = (mine ?? []).map((p) => p.conversation_id)

  if (myConvIds.length) {
    const { data: theirs } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", otherUserId)
      .in("conversation_id", myConvIds)

    const sharedIds = (theirs ?? []).map((p) => p.conversation_id)
    if (sharedIds.length) {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, is_group")
        .in("id", sharedIds)
        .eq("is_group", false)
      if (convs && convs.length) return convs[0].id
    }
  }

  // Generate id client-side so we don't need RETURNING (SELECT RLS blocks before we're a participant)
  const conversationId = crypto.randomUUID()
  const { error } = await supabase.from("conversations").insert({
    id: conversationId,
    is_group: false,
    created_by: currentUserId,
  })
  if (error) {
    throw new Error(
      errMessage(error, "נכשל ביצירת שיחה. ודא שהרצת את schema.sql ב־Supabase."),
    )
  }

  const { error: partsError } = await supabase.from("conversation_participants").insert([
    { conversation_id: conversationId, user_id: currentUserId },
    { conversation_id: conversationId, user_id: otherUserId },
  ])
  if (partsError) {
    // Cleanup orphan conversation if participants failed
    await supabase.from("conversations").delete().eq("id", conversationId)
    throw new Error(errMessage(partsError, "נכשל בהוספת משתתפים לשיחה"))
  }

  return conversationId
}

export async function createGroupConversation(
  currentUserId: string,
  name: string,
  memberIds: string[],
): Promise<string> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const conversationId = crypto.randomUUID()
  const { error } = await supabase.from("conversations").insert({
    id: conversationId,
    is_group: true,
    name,
    created_by: currentUserId,
  })
  if (error) {
    throw new Error(errMessage(error, "נכשל ביצירת קבוצה. ודא שהרצת את schema.sql ב־Supabase."))
  }

  const members = Array.from(new Set([currentUserId, ...memberIds]))
  const { error: partsError } = await supabase.from("conversation_participants").insert(
    members.map((uid) => ({
      conversation_id: conversationId,
      user_id: uid,
      is_admin: uid === currentUserId,
    })),
  )
  if (partsError) {
    await supabase.from("conversations").delete().eq("id", conversationId)
    throw new Error(errMessage(partsError, "נכשל בהוספת חברים לקבוצה"))
  }

  return conversationId
}

export type FetchUsersResult = {
  users: Profile[]
  error: string | null
}

/** People you already share a conversation with (RLS-enforced). */
export async function fetchContacts(currentUserId: string): Promise<FetchUsersResult> {
  try {
    await ensureSupabaseConfig()
    const supabase = createClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .neq("id", currentUserId)
      .order("display_name")

    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes("relation") || msg.includes("does not exist") || error.code === "42P01") {
        return {
          users: [],
          error: "טבלת הפרופילים עדיין לא קיימת. הרץ את הקובץ supabase/schema.sql ב־SQL Editor של Supabase.",
        }
      }
      return { users: [], error: error.message }
    }

    return { users: (data ?? []) as Profile[], error: null }
  } catch (err) {
    return {
      users: [],
      error: err instanceof Error ? err.message : "שגיאה בטעינת אנשי קשר",
    }
  }
}

/** @deprecated Use fetchContacts — directory listing is no longer allowed. */
export const fetchAllUsers = fetchContacts

/** Look up a registered user by exact email (for starting a new chat). */
export async function findUserByEmail(email: string): Promise<Profile | null> {
  const trimmed = email.trim()
  if (!trimmed) return null

  await ensureSupabaseConfig()
  const supabase = createClient()
  const { data, error } = await supabase.rpc("find_user_by_email", {
    p_email: trimmed,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("function") && msg.includes("does not exist")) {
      throw new Error(
        "חסרה פונקציית חיפוש מייל. הרץ את supabase/migration-contacts-privacy.sql ב־SQL Editor של Supabase.",
      )
    }
    throw new Error(errMessage(error, "נכשל בחיפוש לפי מייל"))
  }

  const rows = (data ?? []) as Profile[]
  return rows[0] ?? null
}

export async function startChatByEmail(
  currentUserId: string,
  email: string,
): Promise<string> {
  const profile = await findUserByEmail(email)
  if (!profile) {
    throw new Error("לא נמצא משתמש עם המייל הזה. ודא שהמייל מעודכן ונכון.")
  }
  return getOrCreateDirectConversation(currentUserId, profile.id)
}
