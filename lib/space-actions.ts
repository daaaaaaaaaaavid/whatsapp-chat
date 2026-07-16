"use client"

import { createClient, ensureSupabaseConfig } from "@/lib/supabase/client"
import { PUBLIC_PROFILE_COLUMNS } from "@/lib/profile-fields"
import type { Profile, WorkSpace, WorkSpaceMember } from "@/lib/types"
import { channelNameSchema, spaceNameSchema } from "@/lib/validation"
import { isValidGoogleChatWebhookUrl } from "@/lib/google-chat-webhook"

function errMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as { message?: string }).message || "")
    if (msg) return msg
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function missingTableHint(error: unknown): string | null {
  const msg = errMessage(error, "").toLowerCase()
  if (msg.includes("work_spaces") || msg.includes("does not exist") || msg.includes("42p01")) {
    return "חסרות טבלאות Spaces. הרץ את supabase/migration-work-spaces.sql ב־Supabase."
  }
  return null
}

/** Create a Work Space + default #כללי channel. Returns { spaceId, channelId }. */
export async function createWorkSpace(
  currentUserId: string,
  name: string,
  description?: string,
): Promise<{ spaceId: string; channelId: string }> {
  const parsed = spaceNameSchema.safeParse(name)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "שם Space לא תקין")
  }

  await ensureSupabaseConfig()
  const supabase = createClient()
  const spaceId = crypto.randomUUID()

  const { error: spaceErr } = await supabase.from("work_spaces").insert({
    id: spaceId,
    name: parsed.data,
    description: description?.trim() || null,
    created_by: currentUserId,
  })
  if (spaceErr) {
    throw new Error(missingTableHint(spaceErr) ?? errMessage(spaceErr, "נכשל ביצירת Space"))
  }

  const { error: memberErr } = await supabase.from("work_space_members").insert({
    space_id: spaceId,
    user_id: currentUserId,
    role: "admin",
  })
  if (memberErr) {
    await supabase.from("work_spaces").delete().eq("id", spaceId)
    throw new Error(errMessage(memberErr, "נכשל בהוספת חבר ל־Space"))
  }

  const channelId = await createSpaceChannel(currentUserId, spaceId, "כללי")
  return { spaceId, channelId }
}

/** Create a channel (group conversation) inside a space; adds all space members. */
export async function createSpaceChannel(
  currentUserId: string,
  spaceId: string,
  name: string,
): Promise<string> {
  const parsed = channelNameSchema.safeParse(name)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "שם ערוץ לא תקין")
  }

  await ensureSupabaseConfig()
  const supabase = createClient()

  const { data: members, error: memErr } = await supabase
    .from("work_space_members")
    .select("user_id")
    .eq("space_id", spaceId)
  if (memErr) {
    throw new Error(missingTableHint(memErr) ?? errMessage(memErr, "נכשל בטעינת חברי Space"))
  }
  if (!(members ?? []).some((m) => m.user_id === currentUserId)) {
    throw new Error("אינך חבר ב־Space הזה")
  }

  const memberIds = Array.from(new Set((members ?? []).map((m) => m.user_id)))
  const conversationId = crypto.randomUUID()

  const { error: convErr } = await supabase.from("conversations").insert({
    id: conversationId,
    is_group: true,
    name: parsed.data,
    created_by: currentUserId,
    work_space_id: spaceId,
  })
  if (convErr) {
    const hint = missingTableHint(convErr)
    if (hint || convErr.message?.toLowerCase().includes("work_space_id")) {
      throw new Error(
        hint ?? "חסרה עמודת work_space_id. הרץ את supabase/migration-work-spaces.sql ב־Supabase.",
      )
    }
    throw new Error(errMessage(convErr, "נכשל ביצירת ערוץ"))
  }

  const { error: partsErr } = await supabase.from("conversation_participants").insert(
    memberIds.map((uid) => ({
      conversation_id: conversationId,
      user_id: uid,
      is_admin: uid === currentUserId,
    })),
  )
  if (partsErr) {
    await supabase.from("conversations").delete().eq("id", conversationId)
    throw new Error(errMessage(partsErr, "נכשל בהוספת חברים לערוץ"))
  }

  return conversationId
}

export async function fetchMyWorkSpaces(currentUserId: string): Promise<{
  spaces: WorkSpace[]
  error: string | null
}> {
  try {
    await ensureSupabaseConfig()
    const supabase = createClient()

    const { data: memberships, error: memErr } = await supabase
      .from("work_space_members")
      .select("space_id, role")
      .eq("user_id", currentUserId)

    if (memErr) {
      return {
        spaces: [],
        error: missingTableHint(memErr) ?? memErr.message,
      }
    }

    const ids = (memberships ?? []).map((m) => m.space_id)
    if (!ids.length) return { spaces: [], error: null }

    const roleMap = new Map((memberships ?? []).map((m) => [m.space_id, m.role as WorkSpace["role"]]))

    const { data: spaces, error: spaceErr } = await supabase
      .from("work_spaces")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: true })

    if (spaceErr) {
      return { spaces: [], error: missingTableHint(spaceErr) ?? spaceErr.message }
    }

    const { data: allMembers } = await supabase
      .from("work_space_members")
      .select("space_id")
      .in("space_id", ids)

    const { data: channels } = await supabase
      .from("conversations")
      .select("work_space_id")
      .in("work_space_id", ids)
      .eq("is_group", true)

    const memberCount = new Map<string, number>()
    for (const row of allMembers ?? []) {
      memberCount.set(row.space_id, (memberCount.get(row.space_id) ?? 0) + 1)
    }
    const channelCount = new Map<string, number>()
    for (const row of channels ?? []) {
      if (!row.work_space_id) continue
      channelCount.set(row.work_space_id, (channelCount.get(row.work_space_id) ?? 0) + 1)
    }

    const enriched: WorkSpace[] = (spaces ?? []).map((s) => {
      const role = roleMap.get(s.id)
      const rawUrl =
        typeof (s as { google_chat_webhook_url?: string | null }).google_chat_webhook_url === "string"
          ? (s as { google_chat_webhook_url: string }).google_chat_webhook_url
          : null
      const forwardEnabled = Boolean(
        (s as { google_chat_forward_enabled?: boolean }).google_chat_forward_enabled,
      )
      const base: WorkSpace = {
        id: s.id,
        name: s.name,
        description: s.description ?? null,
        avatar_url: s.avatar_url ?? null,
        created_by: s.created_by ?? null,
        created_at: s.created_at,
        role,
        member_count: memberCount.get(s.id) ?? 0,
        channel_count: channelCount.get(s.id) ?? 0,
        google_chat_forward_enabled: forwardEnabled,
        google_chat_webhook_configured: Boolean(rawUrl),
      }
      // Only admins receive the raw webhook URL
      if (role === "admin") {
        base.google_chat_webhook_url = rawUrl
      }
      return base
    })

    return { spaces: enriched, error: null }
  } catch (err) {
    return {
      spaces: [],
      error: err instanceof Error ? err.message : "שגיאה בטעינת Spaces",
    }
  }
}

export async function fetchSpaceMembers(spaceId: string): Promise<WorkSpaceMember[]> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const { data: rows, error } = await supabase
    .from("work_space_members")
    .select("*")
    .eq("space_id", spaceId)
    .order("joined_at", { ascending: true })
  if (error) throw new Error(missingTableHint(error) ?? errMessage(error, "נכשל בטעינת חברים"))

  const userIds = (rows ?? []).map((r) => r.user_id)
  if (!userIds.length) return []

  const { data: profiles } = await supabase
    .from("profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .in("id", userIds)
  const map = new Map((profiles ?? []).map((p) => [p.id, p as Profile]))

  return (rows ?? []).map((r) => ({
    ...(r as WorkSpaceMember),
    profile: map.get(r.user_id),
  }))
}

export async function createWorkSpaceInvite(spaceId: string, createdBy: string): Promise<string> {
  await ensureSupabaseConfig()
  const supabase = createClient()

  const { data: existing } = await supabase
    .from("work_space_invites")
    .select("token, expires_at")
    .eq("space_id", spaceId)
    .eq("created_by", createdBy)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.token) return existing.token

  const token = `ws_${crypto.randomUUID().replace(/-/g, "")}`
  const { error } = await supabase.from("work_space_invites").insert({
    space_id: spaceId,
    created_by: createdBy,
    token,
  })
  if (error) {
    throw new Error(missingTableHint(error) ?? errMessage(error, "נכשל ביצירת הזמנה"))
  }
  return token
}

export async function joinWorkSpaceByInvite(token: string): Promise<string> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const { data, error } = await supabase.rpc("join_work_space_by_invite", { p_token: token })
  if (error) {
    throw new Error(missingTableHint(error) ?? errMessage(error, "ההצטרפות ל־Space נכשלה"))
  }
  return data as string
}

export async function leaveWorkSpace(spaceId: string, userId: string): Promise<void> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const { data, error } = await supabase
    .from("work_space_members")
    .delete()
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .select("id")
  if (error) throw new Error(errMessage(error, "יציאה מה־Space נכשלה"))
  if (!data?.length) {
    throw new Error("לא ניתן לצאת מה־Space — ייתכן שכבר יצאת או שאין הרשאה")
  }
}

export type UpdateGoogleChatForwardInput = {
  spaceId: string
  enabled: boolean
  webhookUrl: string | null
}

/** Admin-only: save Google Chat incoming webhook settings for a Work Space. */
export async function updateWorkSpaceGoogleChatForward(
  input: UpdateGoogleChatForwardInput,
): Promise<void> {
  const url = input.webhookUrl?.trim() || null
  if (input.enabled) {
    if (!url || !isValidGoogleChatWebhookUrl(url)) {
      throw new Error(
        "כתובת Webhook לא תקינה. חייבת להתחיל ב־https://chat.googleapis.com/",
      )
    }
  } else if (url && !isValidGoogleChatWebhookUrl(url)) {
    throw new Error(
      "כתובת Webhook לא תקינה. חייבת להתחיל ב־https://chat.googleapis.com/",
    )
  }

  await ensureSupabaseConfig()
  const supabase = createClient()
  const { error } = await supabase
    .from("work_spaces")
    .update({
      google_chat_forward_enabled: input.enabled,
      google_chat_webhook_url: url,
    })
    .eq("id", input.spaceId)

  if (error) {
    const hint = missingTableHint(error)
    if (hint || /google_chat/i.test(error.message)) {
      throw new Error(
        hint ??
          "חסרות עמודות Google Chat. הרץ את supabase/migration-google-chat-webhook.sql ב־Supabase.",
      )
    }
    throw new Error(errMessage(error, "שמירת הגדרות Google Chat נכשלה"))
  }
}
