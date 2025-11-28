// Core platform and node types
export type Platform = "web" | "whatsapp" | "instagram"

export interface ButtonData {
  text?: string
  label?: string
  id?: string
  value?: string
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

// Version history types
export interface FlowVersion {
  id: string
  version: number
  name: string
  description?: string
  nodes: any[]
  edges: any[]
  platform: Platform
  createdAt: string
  publishedAt?: string
  isPublished: boolean
  changes: FlowChange[]
}

export interface FlowChange {
  id: string
  type: 'node_add' | 'node_delete' | 'node_update' | 'edge_add' | 'edge_delete' | 'edge_update' | 'platform_change' | 'flow_import'
  timestamp: string
  data: any
  description: string
}

export interface EditModeState {
  isEditMode: boolean
  hasUnsavedChanges: boolean
  currentVersion: FlowVersion | null
  draftChanges: FlowChange[]
}

// AI Node Suggestions
export interface SuggestedNode {
  type: string
  label: string
  reason: string
  description: string
  previewContent?: string // Preview of the generated content
  generatedContent?: {
    question?: string
    buttons?: Array<{ text: string; label?: string }>
    options?: Array<{ text: string }>
    text?: string
    [key: string]: any
  }
}
