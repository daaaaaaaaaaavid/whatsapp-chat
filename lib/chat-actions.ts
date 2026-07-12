"use client"

import { createClient, ensureSupabaseConfig } from "@/lib/supabase/client"
import type { Profile } from "@/lib/types"

// Find an existing 1-on-1 conversation between two users, or create one.
export async function getOrCreateDirectConversation(currentUserId: string, otherUserId: string): Promise<string> {
  await ensureSupabaseConfig()
  const supabase = createClient()

  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", currentUserId)
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

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ is_group: false, created_by: currentUserId })
    .select()
    .single()
  if (error || !conv) throw error ?? new Error("נכשל ביצירת שיחה. ודא שהרצת את schema.sql ב־Supabase.")

  const { error: partsError } = await supabase.from("conversation_participants").insert([
    { conversation_id: conv.id, user_id: currentUserId },
    { conversation_id: conv.id, user_id: otherUserId },
  ])
  if (partsError) throw partsError

  return conv.id
}

export async function createGroupConversation(
  currentUserId: string,
  name: string,
  memberIds: string[],
): Promise<string> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ is_group: true, name, created_by: currentUserId })
    .select()
    .single()
  if (error || !conv) throw error ?? new Error("נכשל ביצירת קבוצה. ודא שהרצת את schema.sql ב־Supabase.")

  const members = Array.from(new Set([currentUserId, ...memberIds]))
  const { error: partsError } = await supabase.from("conversation_participants").insert(
    members.map((uid) => ({
      conversation_id: conv.id,
      user_id: uid,
      is_admin: uid === currentUserId,
    })),
  )
  if (partsError) throw partsError

  return conv.id
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
