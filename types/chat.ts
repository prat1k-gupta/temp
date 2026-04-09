export interface Contact {
  id: string
  channel: "whatsapp" | "instagram"
  phone_number: string
  name: string
  profile_name: string
  avatar_url: string
  unread_count: number
  assigned_user_id: string | null
  tags: string[]
  custom_fields: Record<string, any>
  channel_identifier: string
  status: string
  last_message_preview: string
  last_message_at: string
}

export interface Message {
  id: string
  contact_id: string
  channel: "whatsapp" | "instagram"
  direction: "incoming" | "outgoing"
  message_type: MessageType
  content: { body: string }
  media_url: string | null
  status: "sending" | "sent" | "delivered" | "read" | "failed"
  error_message: string | null
  wamid: string | null
  instagram_mid: string | null
  template_name: string | null
  template_params: any | null
  interactive_data: any | null
  is_reply: boolean
  reply_to_message_id: string | null
  reply_to_message: { id: string; content: string | { body: string }; direction: string } | null
  reactions: any[]
  created_at: string
  updated_at: string
}

export type MessageType =
  | "text" | "image" | "video" | "audio" | "document"
  | "template" | "interactive" | "button_reply"
  | "location" | "contacts" | "sticker" | "unsupported"

export type WebSocketEventType =
  | "new_message" | "status_update" | "message_status"
  | "ping" | "pong" | "set_contact"

export interface WebSocketMessage {
  type: WebSocketEventType
  payload?: any
}

export interface ContactsResponse {
  contacts: Contact[]
  total: number
  page: number
  limit: number
}

export interface MessagesResponse {
  messages: Message[]
  has_more: boolean
}
