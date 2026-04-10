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

export interface Reaction {
  emoji: string
  from_phone?: string
  from_user?: string
}

export interface CannedResponse {
  id: string
  name: string
  shortcut: string
  content: string
  category: string
  is_active: boolean
  usage_count: number
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
  reactions: Reaction[]
  created_at: string
  updated_at: string
}

export type MessageType =
  | "text" | "image" | "video" | "audio" | "document"
  | "template" | "interactive" | "button_reply"
  | "location" | "contacts" | "sticker" | "unsupported"

export type WebSocketEventType =
  | "new_message" | "status_update" | "message_status"
  | "ping" | "pong" | "set_contact" | "reaction_update"

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

export interface PanelFieldConfig {
  key: string
  label: string
  order: number
  display_type?: "text" | "badge" | "tag"
  color?: "default" | "success" | "warning" | "error" | "info"
}

export interface PanelSection {
  id: string
  label: string
  columns: number
  collapsible: boolean
  default_collapsed: boolean
  order: number
  fields: PanelFieldConfig[]
}

export interface PanelConfig {
  sections: PanelSection[]
}

export interface SessionData {
  session_id?: string
  flow_id?: string
  flow_name?: string
  session_data: Record<string, any>
  panel_config?: PanelConfig
}

export interface ContactVariable {
  variable_name: string
  value: string
  updated_at: string
}

export interface ContactFilter {
  // Leaf condition fields
  type?: "tag" | "flow" | "variable"
  op?: string
  value?: string
  values?: string[]
  flowSlug?: string
  flowName?: string  // display only
  name?: string

  // Group fields (recursive)
  logic?: "and" | "or"
  filters?: ContactFilter[]
}
