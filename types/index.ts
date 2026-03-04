// Core platform and node types
export type Platform = "web" | "whatsapp" | "instagram"

export type WhatsAppInputType = "none" | "text" | "number" | "email" | "phone" | "date" | "select" | "button"

export interface ValidationConfig {
  regex?: string
  errorMessage?: string
  retryOnInvalid?: boolean
  maxRetries?: number
}

export interface ButtonData {
  text?: string
  label?: string
  id?: string
  value?: string
}

export interface OptionData {
  text: string
  id?: string  // stable handle ID
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
  storeAs?: string
}

export interface QuickReplyNodeData extends BaseNodeData {
  question?: string
  buttons?: ButtonData[]
  storeAs?: string
}

export interface ListNodeData extends BaseNodeData {
  question?: string
  options?: OptionData[]
  storeAs?: string
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

export interface SuperNodeData extends BaseNodeData {
  question?: string
  validationRules?: Record<string, unknown>
  addressComponents?: string[]
  storeAs?: string
}

export interface FulfillmentNodeData extends BaseNodeData {
  description?: string
  vendor?: Record<string, unknown>
  configuration?: Record<string, unknown>
  message?: string
  variableMappings?: Record<string, unknown>
}

export interface IntegrationNodeData extends BaseNodeData {
  description?: string
}

export interface ConditionNodeData extends BaseNodeData {
  conditionLogic?: string
  conditionGroups?: Array<{
    id: string
    label: string
    logic: string
    rules: unknown[]
  }>
}

export interface ApiFetchNodeData extends BaseNodeData {
  url?: string
  method?: string
  headers?: Record<string, string>
  body?: string
  responseMapping?: Record<string, string>
  fallbackMessage?: string
  message?: string
  storeAs?: string
}

export interface TransferNodeData extends BaseNodeData {
  teamId?: string
  teamName?: string
  notes?: string
  message?: string
}

export interface TemplateMessageNodeData extends BaseNodeData {
  templateId?: string
  templateName?: string
  displayName?: string
  language?: string
  category?: string
  headerType?: string
  bodyPreview?: string
  buttons?: Array<{
    id?: string
    type: string
    text: string
    url?: string
    phone_number?: string
  }>
  parameterMappings?: Array<{
    templateVar: string
    flowValue: string
  }>
}

export type NodeData =
  | QuestionNodeData
  | QuickReplyNodeData
  | ListNodeData
  | MessageNodeData
  | CommentNodeData
  | SuperNodeData
  | FulfillmentNodeData
  | IntegrationNodeData
  | ConditionNodeData
  | ApiFetchNodeData
  | TransferNodeData
  | TemplateMessageNodeData

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
  previewUrl?: string
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
