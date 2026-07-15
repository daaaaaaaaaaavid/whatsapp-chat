"use client"

import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

type TypingHandlers = {
  onTyping: (userId: string, typing: boolean) => void
}

export function subscribeTyping(
  conversationId: string,
  currentUserId: string,
  handlers: TypingHandlers,
): RealtimeChannel {
  const supabase = createClient()
  // Public topic (UUID) — private Realtime often fails without dashboard RLS tuning.
  // Call signaling uses the same public fallback when private auth is unavailable.
  const channel = supabase.channel(`typing:${conversationId}`, {
    config: {
      private: false,
      broadcast: { self: false },
    },
  })

  channel
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      const data = payload as { userId?: string; typing?: boolean }
      if (!data?.userId || data.userId === currentUserId) return
      handlers.onTyping(data.userId, Boolean(data.typing))
    })
    .subscribe()

  return channel
}

export async function broadcastTyping(
  channel: RealtimeChannel | null,
  userId: string,
  typing: boolean,
) {
  if (!channel) return
  await channel.send({
    type: "broadcast",
    event: "typing",
    payload: { userId, typing },
  })
}
