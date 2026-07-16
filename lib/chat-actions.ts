"use client"

import { createClient, ensureSupabaseConfig } from "@/lib/supabase/client"
import { OWN_PROFILE_COLUMNS, PUBLIC_PROFILE_COLUMNS } from "@/lib/profile-fields"
import type { Profile } from "@/lib/types"
import { groupNameSchema, MAX_GROUP_MEMBERS } from "@/lib/validation"

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
  const parsedName = groupNameSchema.safeParse(name)
  if (!parsedName.success) {
    throw new Error(parsedName.error.issues[0]?.message ?? "שם קבוצה לא תקין")
  }
  const members = Array.from(new Set([currentUserId, ...memberIds]))
  if (members.length > MAX_GROUP_MEMBERS) {
    throw new Error(`ניתן להוסיף עד ${MAX_GROUP_MEMBERS} חברים לקבוצה`)
  }

  await ensureSupabaseConfig()
  const supabase = createClient()
  const conversationId = crypto.randomUUID()
  const { error } = await supabase.from("conversations").insert({
    id: conversationId,
    is_group: true,
    name: parsedName.data,
    created_by: currentUserId,
  })
  if (error) {
    throw new Error(errMessage(error, "נכשל ביצירת קבוצה. ודא שהרצת את schema.sql ב־Supabase."))
  }

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
      .select(PUBLIC_PROFILE_COLUMNS)
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

/** Look up a registered user by exact email (server rate-limited; no email returned). */
export async function findUserByEmail(email: string): Promise<Profile | null> {
  const trimmed = email.trim()
  if (!trimmed) return null

  const res = await fetch("/api/users/lookup-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: trimmed }),
  })

  if (res.status === 429) {
    throw new Error("יותר מדי חיפושים. נסה שוב בעוד רגע.")
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    if (body?.error === "invalid_email") throw new Error("כתובת מייל לא תקינה")
    throw new Error("נכשל בחיפוש לפי מייל")
  }

  const body = (await res.json()) as { user?: Profile | null }
  return body.user ?? null
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

export type DmInviteResult =
  | { status: "chat"; conversationId: string }
  | {
      status: "invited"
      inviteUrl: string
      email: string
      emailSent: boolean
      emailChannel: "resend" | "supabase" | null
      emailWarning: string | null
      emailDetail: string | null
      inviterName: string
      resendConfigured: boolean
    }

/** Start a DM if the user exists; otherwise create + email a secure invite. */
export async function startChatOrInviteByEmail(
  currentUserId: string,
  email: string,
): Promise<DmInviteResult> {
  const profile = await findUserByEmail(email)
  if (profile) {
    const conversationId = await getOrCreateDirectConversation(currentUserId, profile.id)
    return { status: "chat", conversationId }
  }

  const res = await fetch("/api/invites/dm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  })

  if (res.status === 429) {
    throw new Error("נשלחו יותר מדי הזמנות. נסה שוב מאוחר יותר.")
  }

  const body = (await res.json().catch(() => null)) as {
    status?: string
    userId?: string
    inviteUrl?: string
    email?: string
    emailSent?: boolean
    emailChannel?: "resend" | "supabase" | null
    emailWarning?: string | null
    emailDetail?: string | null
    inviterName?: string
    resendConfigured?: boolean
    error?: string
    message?: string
  } | null

  if (res.status === 503 && body?.error === "migration_required") {
    throw new Error(body.message || "חסרה טבלת הזמנות. הרץ את migration-dm-invites.sql")
  }

  if (!res.ok) {
    if (body?.error === "cannot_invite_self") throw new Error("לא ניתן להזמין את עצמך")
    if (body?.error === "invalid_email") throw new Error("כתובת מייל לא תקינה")
    throw new Error("נכשל בשליחת הזמנה")
  }

  if (body?.status === "already_registered" && body.userId) {
    const conversationId = await getOrCreateDirectConversation(currentUserId, body.userId)
    return { status: "chat", conversationId }
  }

  if (body?.status === "invited" && body.inviteUrl && body.email) {
    return {
      status: "invited",
      inviteUrl: body.inviteUrl,
      email: body.email,
      emailSent: Boolean(body.emailSent),
      emailChannel: body.emailChannel ?? null,
      emailWarning: body.emailWarning ?? null,
      emailDetail: body.emailDetail ?? null,
      inviterName: body.inviterName || "משתמש",
      resendConfigured: Boolean(body.resendConfigured),
    }
  }

  throw new Error("נכשל בשליחת הזמנה")
}

export async function acceptDmInvite(token: string): Promise<string> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const { data, error } = await supabase.rpc("accept_dm_invite", { p_token: token })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("function") && msg.includes("does not exist")) {
      throw new Error("חסרה פונקציית הזמנה. הרץ את supabase/migration-dm-invites.sql ב־Supabase.")
    }
    if (msg.includes("email mismatch")) {
      throw new Error("יש להתחבר עם אותו מייל שאליו נשלחה ההזמנה")
    }
    if (msg.includes("expired")) {
      throw new Error("ההזמנה פגה. בקש קישור חדש.")
    }
    if (msg.includes("already used")) {
      throw new Error("ההזמנה כבר נוצלה")
    }
    if (msg.includes("not found")) {
      throw new Error("קישור הזמנה לא תקין")
    }
    throw new Error(errMessage(error, "נכשל בהצטרפות להזמנה"))
  }
  return data as string
}

/** Leave a group or remove yourself from a chat. */
export async function leaveConversation(conversationId: string, userId: string): Promise<void> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const { error } = await supabase
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
  if (error) throw new Error(errMessage(error, "נכשל ביציאה מהשיחה"))
}

/** Create (or reuse) an invite link token for a group (admins only). */
export async function createConversationInvite(conversationId: string, createdBy: string): Promise<string> {
  await ensureSupabaseConfig()
  const supabase = createClient()

  const { data: conv } = await supabase
    .from("conversations")
    .select("is_group")
    .eq("id", conversationId)
    .maybeSingle()
  if (!conv?.is_group) {
    throw new Error("קישורי הזמנה זמינים לקבוצות בלבד")
  }

  const { data: existing } = await supabase
    .from("conversation_invites")
    .select("token, expires_at")
    .eq("conversation_id", conversationId)
    .eq("created_by", createdBy)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.token) return existing.token

  // 128-bit hex token (32 chars)
  const secureToken = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`.slice(
    0,
    32,
  )
  const { error } = await supabase.from("conversation_invites").insert({
    conversation_id: conversationId,
    created_by: createdBy,
    token: secureToken,
  })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("conversation_invites") || msg.includes("does not exist")) {
      throw new Error("חסרה טבלת הזמנות. הרץ את supabase/migration-invites-prefs.sql ב־Supabase.")
    }
    if (msg.includes("policy") || msg.includes("row-level")) {
      throw new Error("רק מנהלי הקבוצה יכולים ליצור קישור הזמנה. הרץ גם migration-security-hardening.sql.")
    }
    throw new Error(errMessage(error, "נכשל ביצירת קישור הזמנה"))
  }
  return secureToken
}

export async function joinConversationByInvite(token: string): Promise<string> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const { data, error } = await supabase.rpc("join_conversation_by_invite", { p_token: token })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("function") && msg.includes("does not exist")) {
      throw new Error("חסרה פונקציית הזמנה. הרץ את supabase/migration-invites-prefs.sql ב־Supabase.")
    }
    throw new Error(errMessage(error, "נכשל בהצטרפות דרך הקישור"))
  }
  return data as string
}

export async function blockUser(currentUserId: string, blockedUserId: string): Promise<void> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select(OWN_PROFILE_COLUMNS)
    .eq("id", currentUserId)
    .maybeSingle()

  const current = (profile?.blocked_user_ids as string[] | null) ?? []
  if (current.includes(blockedUserId)) return

  const { error } = await supabase
    .from("profiles")
    .update({ blocked_user_ids: [...current, blockedUserId] })
    .eq("id", currentUserId)

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("blocked_user_ids") || msg.includes("does not exist")) {
      throw new Error("חסרה עמודת חסימה. הרץ את supabase/migration-invites-prefs.sql ב־Supabase.")
    }
    throw new Error(errMessage(error, "נכשל בחסימת המשתמש"))
  }
}

