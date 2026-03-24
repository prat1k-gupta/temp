import { z } from "zod"

// --- Valid base node types (used for plan validation) ---

export const VALID_BASE_NODE_TYPES = [
  // Interaction
  "question",
  "quickReply",
  "interactiveList",
  "whatsappMessage",
  "instagramDM",
  "instagramStory",
  // Information (flow templates — created as super nodes, migrated to flowTemplate on load)
  "name",
  "email",
  "dob",
  "address",
  // Logic
  "condition",
  // Fulfillment
  "homeDelivery",
  "trackingNotification",
  "event",
  "retailStore",
  // Flow template
  "flowTemplate",
  // Action
  "apiFetch",
  // Flow terminator
  "flowComplete",
  // Integration
  "shopify",
  "metaAudience",
  "stripe",
  "zapier",
  "google",
  "salesforce",
  "mailchimp",
  "twilio",
  "slack",
  "airtable",
] as const

export type ValidBaseNodeType = (typeof VALID_BASE_NODE_TYPES)[number]

// --- Plan interfaces ---

export interface NodeContent {
  label?: string
  question?: string
  text?: string
  buttons?: string[]
  options?: string[]
  listTitle?: string
  comment?: string
  message?: string
  storeAs?: string
  templateId?: string // for flowTemplate nodes — references a template by ID
  // apiFetch fields
  url?: string
  method?: string
  headers?: Record<string, string>
  body?: string
  responseMapping?: Record<string, string>
  fallbackMessage?: string
}

export interface NodeStep {
  step: "node"
  nodeType: string
  content?: NodeContent
}

export interface BranchStep {
  step: "branch"
  buttonIndex: number
  steps: FlowStep[]
}

export type FlowStep = NodeStep | BranchStep

export interface FlowPlan {
  message: string
  steps: FlowStep[]
}

// --- Zod schemas ---

export const nodeContentSchema = z.object({
  label: z.string().optional(),
  question: z.string().optional(),
  text: z.string().optional(),
  buttons: z.array(z.string()).optional(),
  options: z.array(z.string()).optional(),
  listTitle: z.string().optional(),
  comment: z.string().optional(),
  message: z.string().optional(),
  storeAs: z.string().optional(),
  templateId: z.string().optional(),
  // apiFetch fields
  url: z.string().optional(),
  method: z.string().optional(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  responseMapping: z.record(z.string()).optional(),
  fallbackMessage: z.string().optional(),
})

export const nodeStepSchema = z.object({
  step: z.literal("node"),
  nodeType: z.string(),
  content: nodeContentSchema.optional(),
})

// Non-recursive schema: branches contain only node steps (no nested branches).
// This avoids z.lazy recursion which causes "Recursive reference detected" warnings
// and degrades to `any` in the Anthropic API JSON schema output.
export const branchStepSchema = z.object({
  step: z.literal("branch"),
  buttonIndex: z.number().int(),
  steps: z.array(nodeStepSchema),
})

export const flowStepSchema: z.ZodType<FlowStep> = z.discriminatedUnion("step", [
  nodeStepSchema,
  branchStepSchema,
]) as z.ZodType<FlowStep>

export const flowPlanSchema = z.object({
  message: z.string(),
  steps: z.array(flowStepSchema),
})

// --- Edit plan types ---

export interface NodeUpdate {
  nodeId: string
  content: NodeContent
}

export interface EdgeReference {
  source: string
  target: string
  sourceHandle?: string
}

export interface EditChain {
  attachTo: string
  attachHandle?: string
  steps: FlowStep[]
  connectTo?: string
}

export interface NewEdge {
  source: string           // existing or new node ID
  target: string           // existing or new node ID
  sourceButtonIndex?: number  // index into source node's buttons → resolved to button ID
  sourceHandle?: string       // direct handle ID (for non-button connections like "next-step")
}

export interface EditFlowPlan {
  message: string
  chains?: EditChain[]
  nodeUpdates?: NodeUpdate[]
  addEdges?: NewEdge[]
  removeNodeIds?: string[]
  removeEdges?: EdgeReference[]
  description?: string
}

// --- Edit plan zod schemas ---

export const nodeUpdateSchema = z.object({
  nodeId: z.string(),
  content: nodeContentSchema,
})

export const edgeReferenceSchema = z.object({
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
})

export const editChainSchema = z.object({
  attachTo: z.string(),
  attachHandle: z.string().optional(),
  steps: z.array(flowStepSchema),
  connectTo: z.string().optional(),
})

export const newEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  sourceButtonIndex: z.number().int().optional(),
  sourceHandle: z.string().optional(),
})

export const editFlowPlanSchema = z.object({
  message: z.string(),
  chains: z.array(editChainSchema).default([]),
  nodeUpdates: z.array(nodeUpdateSchema).optional(),
  addEdges: z.array(newEdgeSchema).optional(),
  removeNodeIds: z.array(z.string()).optional(),
  removeEdges: z.array(edgeReferenceSchema).optional(),
  description: z.string().optional(),
})
