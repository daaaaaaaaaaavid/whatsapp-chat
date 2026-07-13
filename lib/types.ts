export type Profile = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  about: string | null
  last_seen: string | null
  created_at: string
  google_contacts_synced_at?: string | null
}

/** Imported Google contact row (private to the signed-in user). */
export type GoogleContact = {
  id: string
  google_resource_name: string
  display_name: string | null
  email: string | null
  photo_url: string | null
  matched_profile_id: string | null
}

export type MessageType = "text" | "image" | "file" | "audio" | "video" | "system"

/** Structured payload for system call messages (stored as JSON in content). */
export type CallSystemPayload = {
  kind: "call"
  event: "incoming" | "outgoing" | "ended" | "missed" | "rejected"
  video: boolean
  durationSec?: number
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  type: MessageType
  file_url: string | null
  file_name: string | null
  file_size: number | null
  created_at: string
  deleted_at?: string | null
  reply_to_id?: string | null
  /** Client-only: optimistic bubble not yet confirmed by the server */
  pending?: boolean
  sender?: Profile
  reads?: MessageRead[]
  reply_to?: Message | null
}

export type MessageRead = {
  id: string
  message_id: string
  user_id: string
  read_at: string
}

export type Participant = {
  id: string
  conversation_id: string
  user_id: string
  is_admin: boolean
  joined_at: string
  profile?: Profile
}

export type Conversation = {
  id: string
  is_group: boolean
  name: string | null
  avatar_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  participants?: Participant[]
  last_message?: Message | null
  unread_count?: number
}

export type Status = {
  id: string
  user_id: string
  content: string | null
  media_url: string | null
  background_color: string
  created_at: string
  expires_at: string
  profile?: Profile
  viewed?: boolean
}

export type StatusReply = {
  id: string
  status_id: string
  user_id: string
  content: string
  created_at: string
  profile?: Profile
}
