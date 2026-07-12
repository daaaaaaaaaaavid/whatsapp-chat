export type Profile = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  about: string | null
  last_seen: string | null
  created_at: string
}

export type MessageType = "text" | "image" | "file" | "audio" | "video"

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
  sender?: Profile
  reads?: MessageRead[]
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
