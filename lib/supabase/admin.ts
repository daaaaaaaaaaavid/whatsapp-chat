import { createClient } from "@supabase/supabase-js"
import { getSupabaseEnv } from "@/lib/supabase/env"

/** Admin client for reading other users' push subscriptions (server only). */
export function createServiceClient() {
  const { url } = getSupabaseEnv()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ""
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
