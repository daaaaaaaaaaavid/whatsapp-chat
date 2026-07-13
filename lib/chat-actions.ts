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

// Find an existing 1-on-1 conversation between two users, or create one.
export async function getOrCreateDirectConversation(currentUserId: string, otherUserId: string): Promise<string> {
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

export async function fetchAllUsers(currentUserId: string): Promise<FetchUsersResult> {
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
