// Core platform and node types
export type Platform = "web" | "whatsapp" | "instagram"

export interface ButtonData {
  text: string
}

export interface OptionData {
  text: string
}

export interface BaseNodeData extends Record<string, unknown> {
  platform: Platform
  label?: string
  id?: string
  onNodeUpdate?: (nodeId: string, data: any) => void
  onAddButton?: () => void
  onAddOption?: () => void
  onAddConnection?: () => void
  onDelete?: () => void
}

export interface QuestionNodeData extends BaseNodeData {
  question?: string
  characterLimit?: number
}

export interface QuickReplyNodeData extends BaseNodeData {
  question?: string
  buttons?: ButtonData[]
}

export interface ListNodeData extends BaseNodeData {
  question?: string
  options?: OptionData[]
}

export interface MessageNodeData extends BaseNodeData {
  text?: string
}

export interface CommentNodeData extends BaseNodeData {
  comment?: string
  createdBy?: string
  createdAt?: string
  onUpdate?: (updates: any) => void
}

export type NodeData = QuestionNodeData | QuickReplyNodeData | ListNodeData | MessageNodeData | CommentNodeData

// Context menu types
export interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
}

export interface ConnectionMenuState {
  isOpen: boolean
  x: number
  y: number
  sourceNodeId: string | null
  sourceHandleId: string | null
}

// Event coordinate types
export interface Coordinates {
  x: number
  y: number
}
