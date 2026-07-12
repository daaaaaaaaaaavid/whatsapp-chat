"use client"

import { createClient } from "@/lib/supabase/client"

// Find an existing 1-on-1 conversation between two users, or create one.
export async function getOrCreateDirectConversation(currentUserId: string, otherUserId: string): Promise<string> {
  const supabase = createClient()

  // conversations I'm in
  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", currentUserId)
  const myConvIds = (mine ?? []).map((p) => p.conversation_id)

  if (myConvIds.length) {
    // conversations the other user is in, intersect, that are not groups
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

  // create new direct conversation
  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ is_group: false, created_by: currentUserId })
    .select()
    .single()
  if (error || !conv) throw error ?? new Error("failed to create conversation")

  await supabase.from("conversation_participants").insert([
    { conversation_id: conv.id, user_id: currentUserId },
    { conversation_id: conv.id, user_id: otherUserId },
  ])

  return conv.id
}

export async function createGroupConversation(
  currentUserId: string,
  name: string,
  memberIds: string[],
): Promise<string> {
  const supabase = createClient()
  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ is_group: true, name, created_by: currentUserId })
    .select()
    .single()
  if (error || !conv) throw error ?? new Error("failed to create group")

  const members = Array.from(new Set([currentUserId, ...memberIds]))
  await supabase.from("conversation_participants").insert(
    members.map((uid) => ({
      conversation_id: conv.id,
      user_id: uid,
      is_admin: uid === currentUserId,
    })),
  )

  return conv.id
}

export async function fetchAllUsers(currentUserId: string) {
  const supabase = createClient()
  const { data } = await supabase.from("profiles").select("*").neq("id", currentUserId).order("display_name")
  return data ?? []
}
