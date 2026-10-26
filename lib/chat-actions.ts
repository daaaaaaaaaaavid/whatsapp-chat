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

  const { error: selfErr } = await supabase.rpc("accept_self_conversation", {
    p_conversation_id: conversationId,
  })
  if (selfErr) {
    const msg = selfErr.message.toLowerCase()
    if (!msg.includes("does not exist") && !msg.includes("could not find")) {
      console.error("accept_self_conversation:", selfErr.message)
    }
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
      const existing = await findExistingDirectConversation(supabase, sharedIds)
      if (existing) {
        if (
          existing.request_status === "declined" &&
          existing.created_by &&
          existing.created_by !== currentUserId
        ) {
          await respondToChatRequest(existing.id, true)
        }
        return existing.id
      }
    }
  }

  // Generate id client-side so we don't need RETURNING (SELECT RLS blocks before we're a participant).
  // New 1:1 chats stay pending until the other person accepts (see migration-chat-requests.sql).
  const conversationId = crypto.randomUUID()
  const { error } = await supabase.from("conversations").insert({
    id: conversationId,
    is_group: false,
    created_by: currentUserId,
    request_status: "pending",
  })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("request_status")) {
      throw new Error(
        "כדי לפתוח שיחה עם מישהו חדש צריך להריץ את supabase/migration-chat-requests.sql ב־Supabase.",
      )
    }
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

type DirectConvRow = { id: string; request_status?: string | null; created_by?: string | null }

async function findExistingDirectConversation(
  supabase: ReturnType<typeof createClient>,
  sharedIds: string[],
): Promise<DirectConvRow | null> {
  const withStatus = await supabase
    .from("conversations")
    .select("id, request_status, created_by")
    .in("id", sharedIds)
    .eq("is_group", false)

  if (withStatus.error) {
    const msg = withStatus.error.message.toLowerCase()
    if (!msg.includes("request_status")) return null
    const plain = await supabase
      .from("conversations")
      .select("id")
      .in("id", sharedIds)
      .eq("is_group", false)
    const id = plain.data?.[0]?.id
    return id ? { id } : null
  }

  const rows = (withStatus.data ?? []) as DirectConvRow[]
  const accepted = rows.find((row) => !row.request_status || row.request_status === "accepted")
  return accepted ?? rows[0] ?? null
}

function requestRpcError(error: { message?: string }, fallback: string): Error {
  const msg = (error.message ?? "").toLowerCase()
  if (msg.includes("does not exist") || msg.includes("could not find the function")) {
    return new Error("הרץ את supabase/migration-chat-requests.sql ב־Supabase.")
  }
  return new Error(errMessage(error, fallback))
}

/** The recipient accepts or declines a new direct chat. */
export async function respondToChatRequest(conversationId: string, accept: boolean): Promise<void> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const { error } = await supabase.rpc("respond_to_chat_request", {
    p_conversation_id: conversationId,
    p_accept: accept,
  })
  if (error) throw requestRpcError(error, accept ? "נכשל באישור השיחה" : "נכשל בדחיית השיחה")
}

/** After a decline, the sender can ask again in the same chat. */
export async function resendChatRequest(conversationId: string): Promise<void> {
  await ensureSupabaseConfig()
  const supabase = createClient()
  const { error } = await supabase.rpc("resend_chat_request", {
    p_conversation_id: conversationId,
  })
  if (error) throw requestRpcError(error, "נכשל בשליחת הבקשה")
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
      shareText: string
      email: string
      inviterName: string
    }

function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase()
}

/** Open a direct chat addressed to an email that is not registered yet. */
export async function getOrCreatePendingEmailConversation(
  currentUserId: string,
  rawEmail: string,
): Promise<{ id: string; created: boolean }> {
  const email = normalizeEmailAddress(rawEmail)
  await ensureSupabaseConfig()
  const supabase = createClient()

  type ExistingChat = {
    id: string
    name: string | null
    request_status?: string | null
  }

  const withStatus = await supabase
    .from("conversations")
    .select("id, name, request_status")
    .eq("created_by", currentUserId)
    .eq("is_group", false)

  let existing: ExistingChat[] | null = (withStatus.data ?? null) as ExistingChat[] | null
  let existingError = withStatus.error

  if (existingError && /request_status/i.test(existingError.message)) {
    const plain = await supabase
      .from("conversations")
      .select("id, name")
      .eq("created_by", currentUserId)
      .eq("is_group", false)
    existing = (plain.data ?? null) as ExistingChat[] | null
    existingError = plain.error
  }

  if (existingError) throw new Error(errMessage(existingError, "נכשל בטעינת שיחות"))

  const found = (existing ?? []).find(
    (row) => (row.name ?? "").trim().toLowerCase() === email,
  )
  if (found?.id) {
    if (found.request_status === "declined") {
      try {
        await resendChatRequest(found.id)
      } catch {
        // The chat is still there; they can try again from the thread.
      }
    }
    return { id: found.id, created: false }
  }

  const conversationId = crypto.randomUUID()
  let payload: Record<string, unknown> = {
    id: conversationId,
    is_group: false,
    created_by: currentUserId,
    name: email,
    request_status: "pending",
    pending_email: email,
  }

  let inserted = false
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.from("conversations").insert(payload)
    if (!error) {
      inserted = true
      break
    }
    const msg = error.message.toLowerCase()
    if (msg.includes("pending_email") && "pending_email" in payload) {
      const { pending_email: _omit, ...rest } = payload
      payload = rest
      continue
    }
    if (msg.includes("request_status") && "request_status" in payload) {
      const { request_status: _omit, ...rest } = payload
      payload = rest
      continue
    }
    throw new Error(errMessage(error, "נכשל ביצירת שיחה"))
  }
  if (!inserted) throw new Error("נכשל ביצירת שיחה")

  const { error: partsError } = await supabase.from("conversation_participants").insert({
    conversation_id: conversationId,
    user_id: currentUserId,
  })
  if (partsError) {
    await supabase.from("conversations").delete().eq("id", conversationId)
    throw new Error(errMessage(partsError, "נכשל בהוספת משתתפים לשיחה"))
  }

  return { id: conversationId, created: true }
}

/** Remember the waiting chat so the person is added to it when they sign in. */
async function linkPendingEmailInvite(
  email: string,
  conversationId: string,
): Promise<{ userId?: string } | null> {
  const res = await fetch("/api/invites/dm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, conversationId }),
  })
  const body = (await res.json().catch(() => null)) as {
    status?: string
    userId?: string
    message?: string
    error?: string
  } | null
  if (!res.ok) {
    console.error("pending email invite:", body?.message || body?.error || res.status)
    return null
  }
  if (body?.status === "already_registered" && body.userId) return { userId: body.userId }
  return null
}

/** Attach the signed-in user to chats that were opened for their email. */
const claimedEmailChats = new Set<string>()

export async function claimPendingEmailChats(userId: string): Promise<void> {
  if (claimedEmailChats.has(userId)) return
  claimedEmailChats.add(userId)
  try {
    const res = await fetch("/api/invites/dm/claim", { method: "POST" })
    if (!res.ok) claimedEmailChats.delete(userId)
  } catch {
    claimedEmailChats.delete(userId)
  }
}

/** Open a chat with this email. If they are not registered yet, the thread still opens. */
export async function startChatOrInviteByEmail(
  currentUserId: string,
  email: string,
): Promise<DmInviteResult> {
  const normalized = normalizeEmailAddress(email)
  await ensureSupabaseConfig()
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user?.email && normalizeEmailAddress(user.email) === normalized) {
    const conversationId = await getOrCreateSelfConversation(currentUserId)
    return { status: "chat", conversationId }
  }

  const profile = await findUserByEmail(normalized)
  if (profile) {
    const conversationId = await getOrCreateDirectConversation(currentUserId, profile.id)
    return { status: "chat", conversationId }
  }

  const pending = await getOrCreatePendingEmailConversation(currentUserId, normalized)
  try {
    const linked = await linkPendingEmailInvite(normalized, pending.id)
    if (linked?.userId) {
      const directId = await getOrCreateDirectConversation(currentUserId, linked.userId)
      if (pending.created && directId !== pending.id) {
        await supabase.from("conversations").delete().eq("id", pending.id)
      }
      return { status: "chat", conversationId: directId }
    }
  } catch (err) {
    console.error("pending email invite:", err instanceof Error ? err.message : err)
  }
  return { status: "chat", conversationId: pending.id }
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
  // .select() so RLS silent no-ops (0 rows) surface as errors instead of fake success
  const { data, error } = await supabase
    .from("conversation_participants")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .select("id")
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("policy") || msg.includes("row-level")) {
      throw new Error(
        "אין הרשאה לצאת מהשיחה. הרץ את supabase/migration-leave-conversation.sql ב־Supabase.",
      )
    }
    throw new Error(errMessage(error, "נכשל ביציאה מהשיחה"))
  }
  if (!data?.length) {
    throw new Error(
      "לא ניתן לצאת מהשיחה. הרץ את supabase/migration-leave-conversation.sql ב־Supabase.",
    )
  }
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

