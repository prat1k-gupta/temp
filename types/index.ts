import type { Node, Edge } from "@xyflow/react"

// Core platform and node types
export type Platform = "web" | "whatsapp" | "instagram"

export interface TemplateAIMetadata {
  description: string        // What the template does (shown to AI)
  whenToUse: string          // When AI should use this template
  selectionRule?: string     // Short imperative rule for AI cheatsheet
  contentFields?: string     // What content fields the template accepts
}

export type TemplateResolver = (templateId: string) => { nodes: Node[], edges: Edge[] } | null

/**
 * A Meta-approved WhatsApp template, in the shape the flow builder resolves
 * templateMessage nodes against. Mirrors `ShapedTemplate` in
 * `lib/ai/tools/list-templates.ts` — kept in sync by using the same
 * fetcher (fetchApprovedTemplates) at session start. Plan builders look up
 * by (name, language) against the current account's catalog so the AI can't
 * hallucinate bodyPreview / templateId / parameterMappings.
 */
export interface ApprovedTemplate {
  id: string
  name: string
  displayName?: string
  language: string
  category: string
  // Present when the catalog includes non-APPROVED statuses (e.g. the
  // AI-session catalog fetched for flow-plan-builder). Plan-builder uses
  // this to warn that a referenced template won't broadcast until Meta
  // approves. Undefined for legacy list-templates responses that don't set it.
  status?: string
  headerType?: string
  body: string
  variables: string[]
  buttons: Array<{ type: string; text: string; url?: string }>
}

export type WhatsAppInputType = "none" | "text" | "number" | "email" | "phone" | "date" | "select" | "button" | "whatsapp_flow"

export interface ValidationConfig {
  regex?: string
  errorMessage?: string
  retryOnInvalid?: boolean
  maxRetries?: number
}

/**
 * Unified shape for whatsappQuickReply / whatsappInteractiveList / web choice
 * nodes. Both node types now store their items in `data.choices`. The node
 * type itself (quickReply vs interactiveList) determines render style, but
 * the underlying data shape is the same.
 */
export interface ChoiceData {
  text?: string
  id?: string  // stable handle ID
  label?: string  // alias for text used by some AI-generated flows
  value?: string  // backend value, preserved for converter round-trip
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
  validation?: ValidationConfig
  media?: MediaAttachment
}

export interface QuickReplyNodeData extends BaseNodeData {
  question?: string
  choices?: ChoiceData[]
  storeAs?: string
  validation?: ValidationConfig
  media?: MediaAttachment
}

export interface ListNodeData extends BaseNodeData {
  question?: string
  choices?: ChoiceData[]
  storeAs?: string
  validation?: ValidationConfig
  media?: MediaAttachment
}

export interface MessageNodeData extends BaseNodeData {
  text?: string
  media?: MediaAttachment
}

export interface MediaAttachment {
  type: 'image' | 'video' | 'audio' | 'document'
  url: string
}

export type MediaType = MediaAttachment['type']

export interface CommentNodeData extends BaseNodeData {
  comment?: string
  createdBy?: string
  createdAt?: string
  onUpdate?: (updates: any) => void
}

export interface FlowTemplateNodeData extends BaseNodeData {
  sourceTemplateId?: string    // which template this was copied from
  templateName: string         // display name on collapsed node
  internalNodes: Node[]        // deep-copied internal nodes
  internalEdges: Edge[]        // deep-copied internal edges
  nodeCount: number            // count for badge display
}

export interface FlowCompleteNodeData extends BaseNodeData {}

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
  | FlowTemplateNodeData
  | FlowCompleteNodeData
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
  userId?: string
  userEmail?: string
  userName?: string
  /** Who originated this change — user action or an AI edit. Defaults to 'user' when unset (backward compat with historical changes that have no source field). */
  source?: 'user' | 'ai'
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
    choices?: Array<{ text: string; label?: string }>
    text?: string
    [key: string]: any
  }
}
