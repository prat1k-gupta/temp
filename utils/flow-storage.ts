import type { Node, Edge } from "@xyflow/react"
import type { Platform, TemplateAIMetadata } from "@/types"
import { isApiStorage } from "@/lib/feature-flags"
import { apiClient } from "@/lib/api-client"

export interface FlowMetadata {
  id: string
  name: string
  description?: string
  platform: Platform
  type?: "flow" | "template" // defaults to "flow" for backward compat
  triggerId?: string // Backwards compatibility
  triggerIds?: string[] // Multiple triggers support
  aiMetadata?: TemplateAIMetadata // AI metadata for templates
  thumbnail?: string
  hasDraft?: boolean
  hasPublished?: boolean
  createdAt: string
  updatedAt: string
  nodeCount: number
  edgeCount: number
}

export interface FlowData {
  id: string
  name: string
  description?: string
  platform: Platform
  type?: "flow" | "template" // defaults to "flow" for backward compat
  triggerId?: string // Backwards compatibility
  triggerIds?: string[] // Multiple triggers support
  triggerKeywords?: string[] // Custom keywords that trigger this flow (WhatsApp)
  triggerMatchType?: string // How keywords are matched: exact, contains, contains_whole_word, starts_with
  triggerRef?: string // Unique ref keyword for wa.me link trigger
  publishedFlowId?: string // fs-whatsapp flow ID after first publish
  flowSlug?: string // Flow slug from fs-whatsapp (frozen after first publish)
  waAccountId?: string // Selected WhatsApp Business account ID
  waPhoneNumber?: string // WhatsApp Business phone number for wa.me preview link
  aiMetadata?: TemplateAIMetadata // AI metadata for templates
  nodes: Node[]
  edges: Edge[]
  thumbnail?: string
  createdAt: string
  updatedAt: string
}

const FLOWS_STORAGE_KEY = "magic-flow-flows"
const CURRENT_FLOW_KEY = "magic-flow-current-flow-id"

// ---------------------------------------------------------------------------
// API response → FlowData / FlowMetadata mappers
// ---------------------------------------------------------------------------

/**
 * Map a backend project response to FlowMetadata.
 * Backend uses snake_case; frontend uses camelCase.
 */
export function mapProjectToMetadata(p: any): FlowMetadata {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    platform: p.platform,
    type: p.type || "flow",
    aiMetadata: p.ai_metadata || p.aiMetadata,
    hasDraft: p.has_draft ?? false,
    hasPublished: p.has_published ?? !!(p.published_flow_id || p.publishedFlowId),
    createdAt: p.created_at || p.createdAt,
    updatedAt: p.updated_at || p.updatedAt,
    nodeCount: p.node_count ?? p.nodeCount ?? 0,
    edgeCount: p.edge_count ?? p.edgeCount ?? 0,
  }
}

/**
 * Map a backend project response (with version/draft data) to FlowData.
 * The backend embeds the latest published version and draft inside the
 * project payload. Prefer draft nodes/edges when available.
 */
export function mapProjectToFlowData(p: any): FlowData {
  // Draft takes priority over published version
  const draft = p.draft
  const latestVersion = p.latest_version || p.latestVersion
  const source = draft || latestVersion || {}

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    platform: p.platform,
    type: p.type || "flow",
    triggerId: p.trigger_id || p.triggerId,
    triggerIds: p.trigger_ids || p.triggerIds || [],
    triggerKeywords: p.trigger_keywords || p.triggerKeywords || [],
    triggerMatchType: p.trigger_match_type || p.triggerMatchType,
    triggerRef: p.trigger_ref || p.triggerRef,
    publishedFlowId: p.published_flow_id || p.publishedFlowId,
    flowSlug: p.flow_slug || p.flowSlug,
    waAccountId: p.wa_account_id || p.waAccountId,
    waPhoneNumber: p.wa_phone_number || p.waPhoneNumber,
    aiMetadata: p.ai_metadata || p.aiMetadata,
    nodes: source.nodes || p.nodes || [],
    edges: source.edges || p.edges || [],
    createdAt: p.created_at || p.createdAt,
    updatedAt: p.updated_at || p.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// Private localStorage implementations (fallback when feature flag = "local")
// ---------------------------------------------------------------------------

function _localGetAllFlows(): FlowMetadata[] {
  if (typeof window === "undefined") return []

  try {
    const stored = localStorage.getItem(FLOWS_STORAGE_KEY)
    if (!stored) return []

    const flows: FlowData[] = JSON.parse(stored)
    return flows
      .filter(flow => (flow.type || "flow") === "flow")
      .map(flow => ({
        id: flow.id,
        name: flow.name,
        description: flow.description,
        platform: flow.platform,
        type: flow.type,
        thumbnail: flow.thumbnail,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
        nodeCount: flow.nodes.length,
        edgeCount: flow.edges.length,
      }))
  } catch (error) {
    console.error("Error loading flows:", error)
    return []
  }
}

function _localGetFlow(flowId: string): FlowData | null {
  if (typeof window === "undefined") return null

  try {
    const stored = localStorage.getItem(FLOWS_STORAGE_KEY)
    if (!stored) return null

    const flows: FlowData[] = JSON.parse(stored)
    return flows.find(f => f.id === flowId) || null
  } catch (error) {
    console.error("Error loading flow:", error)
    return null
  }
}

function _localSaveFlow(flow: FlowData): void {
  if (typeof window === "undefined") return

  try {
    const stored = localStorage.getItem(FLOWS_STORAGE_KEY)
    let flows: FlowData[] = stored ? JSON.parse(stored) : []

    flow.updatedAt = new Date().toISOString()

    const existingIndex = flows.findIndex(f => f.id === flow.id)
    if (existingIndex >= 0) {
      flows[existingIndex] = flow
    } else {
      flows.push(flow)
    }

    localStorage.setItem(FLOWS_STORAGE_KEY, JSON.stringify(flows))
  } catch (error) {
    console.error("Error saving flow:", error)
  }
}

function _localCreateFlow(
  name: string,
  description?: string,
  platform: Platform = "web",
  triggerId?: string,
  triggerKeywords?: string[],
  waAccountId?: string,
  triggerMatchType?: string,
  triggerRef?: string,
): FlowData {
  const newFlow: FlowData = {
    id: `flow-${Date.now()}`,
    name,
    description,
    platform,
    triggerId,
    triggerIds: triggerId ? [triggerId] : [],
    triggerKeywords: triggerKeywords || [],
    triggerMatchType: triggerMatchType || "contains_whole_word",
    triggerRef: triggerRef || "",
    ...(waAccountId ? { waAccountId } : {}),
    nodes: [
      {
        id: "1",
        type: "start",
        position: { x: 250, y: 25 },
        data: {
          label: "Start",
          platform,
          triggerId,
          triggerIds: triggerId ? [triggerId] : [],
          triggerKeywords: triggerKeywords || [],
          triggerMatchType: triggerMatchType || "contains_whole_word",
          triggerRef: triggerRef || "",
        },
        draggable: false,
        selectable: true,
      },
    ],
    edges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  _localSaveFlow(newFlow)
  return newFlow
}

function _localUpdateFlow(
  flowId: string,
  updates: Partial<Omit<FlowData, 'id' | 'createdAt'>>
): FlowData | null {
  if (typeof window === "undefined") return null

  try {
    const flow = _localGetFlow(flowId)
    if (!flow) return null

    const updatedFlow: FlowData = {
      ...flow,
      ...updates,
      id: flow.id,
      createdAt: flow.createdAt,
      updatedAt: new Date().toISOString(),
    }

    _localSaveFlow(updatedFlow)
    return updatedFlow
  } catch (error) {
    console.error("Error updating flow:", error)
    return null
  }
}

function _localDeleteFlow(flowId: string): boolean {
  if (typeof window === "undefined") return false

  try {
    const stored = localStorage.getItem(FLOWS_STORAGE_KEY)
    if (!stored) return false

    const flows: FlowData[] = JSON.parse(stored)
    const filtered = flows.filter(f => f.id !== flowId)

    if (filtered.length === flows.length) {
      return false
    }

    localStorage.setItem(FLOWS_STORAGE_KEY, JSON.stringify(filtered))

    const currentFlowId = getCurrentFlowId()
    if (currentFlowId === flowId) {
      clearCurrentFlowId()
    }

    return true
  } catch (error) {
    console.error("Error deleting flow:", error)
    return false
  }
}

function _localDuplicateFlow(flowId: string, newName?: string): FlowData | null {
  if (typeof window === "undefined") return null

  try {
    const flow = _localGetFlow(flowId)
    if (!flow) return null

    const duplicatedFlow: FlowData = {
      ...flow,
      id: `flow-${Date.now()}`,
      name: newName || `${flow.name} (Copy)`,
      publishedFlowId: undefined,
      flowSlug: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    _localSaveFlow(duplicatedFlow)
    return duplicatedFlow
  } catch (error) {
    console.error("Error duplicating flow:", error)
    return null
  }
}

// ---------------------------------------------------------------------------
// Public async API (delegates to API or localStorage based on feature flag)
// ---------------------------------------------------------------------------

/**
 * Get all flows metadata (without full node/edge data)
 */
export async function getAllFlows(): Promise<FlowMetadata[]> {
  if (!isApiStorage()) return _localGetAllFlows()

  try {
    const data = await apiClient.get<any>("/api/magic-flow/projects")
    const projects = data?.projects || data || []
    if (!Array.isArray(projects)) return []
    return projects.map(mapProjectToMetadata)
  } catch (error) {
    console.error("Error loading flows from API:", error)
    return []
  }
}

/**
 * Get a specific flow by ID
 */
export async function getFlow(flowId: string): Promise<FlowData | null> {
  if (!isApiStorage()) return _localGetFlow(flowId)

  try {
    const data = await apiClient.get<any>(`/api/magic-flow/projects/${flowId}`)
    if (!data) return null
    const project = data.project || data
    return mapProjectToFlowData(project)
  } catch (error) {
    console.error("Error loading flow from API:", error)
    return null
  }
}

/**
 * Create a new flow
 */
export async function createFlow(
  name: string,
  description?: string,
  platform: Platform = "web",
  triggerId?: string,
  triggerKeywords?: string[],
  waAccountId?: string,
  triggerMatchType?: string,
  triggerRef?: string,
): Promise<FlowData> {
  if (!isApiStorage()) {
    return _localCreateFlow(name, description, platform, triggerId, triggerKeywords, waAccountId, triggerMatchType, triggerRef)
  }

  const startNode = {
    id: "1",
    type: "start",
    position: { x: 250, y: 25 },
    data: {
      label: "Start",
      platform,
      triggerId,
      triggerIds: triggerId ? [triggerId] : [],
      triggerKeywords: triggerKeywords || [],
      triggerMatchType: triggerMatchType || "contains_whole_word",
      triggerRef: triggerRef || "",
    },
    draggable: false,
    selectable: true,
  }

  const body = {
    name,
    description,
    platform,
    trigger_id: triggerId,
    trigger_ids: triggerId ? [triggerId] : [],
    trigger_keywords: triggerKeywords || [],
    trigger_match_type: triggerMatchType || "contains_whole_word",
    trigger_ref: triggerRef || "",
    ...(waAccountId ? { wa_account_id: waAccountId } : {}),
    nodes: [startNode],
    edges: [],
  }

  const data = await apiClient.post<any>("/api/magic-flow/projects", body)
  const project = data.project || data
  // Merge latest_version into project if returned at top level
  if (data.latest_version && !project.latest_version) {
    project.latest_version = data.latest_version
  }
  return mapProjectToFlowData(project)
}

/**
 * Update flow metadata and/or canvas data.
 * In API mode: metadata goes to the project endpoint.
 */
export async function updateFlow(
  flowId: string,
  updates: Partial<Omit<FlowData, 'id' | 'createdAt'>>
): Promise<FlowData | null> {
  if (!isApiStorage()) return _localUpdateFlow(flowId, updates)

  try {
    // Map camelCase to snake_case for the backend
    const body: Record<string, any> = {}
    if (updates.name !== undefined) body.name = updates.name
    if (updates.description !== undefined) body.description = updates.description
    if (updates.platform !== undefined) body.platform = updates.platform
    if (updates.triggerId !== undefined) body.trigger_id = updates.triggerId
    if (updates.triggerIds !== undefined) body.trigger_ids = updates.triggerIds
    if (updates.triggerKeywords !== undefined) body.trigger_keywords = updates.triggerKeywords
    if (updates.triggerMatchType !== undefined) body.trigger_match_type = updates.triggerMatchType
    if (updates.triggerRef !== undefined) body.trigger_ref = updates.triggerRef
    if (updates.publishedFlowId !== undefined) body.published_flow_id = updates.publishedFlowId
    if (updates.flowSlug !== undefined) body.flow_slug = updates.flowSlug
    if (updates.waAccountId !== undefined) body.wa_account_id = updates.waAccountId
    if (updates.waPhoneNumber !== undefined) body.wa_phone_number = updates.waPhoneNumber
    if (updates.nodes !== undefined) body.nodes = updates.nodes
    if (updates.edges !== undefined) body.edges = updates.edges

    const data = await apiClient.put<any>(`/api/magic-flow/projects/${flowId}`, body)
    const project = data?.project || data
    return mapProjectToFlowData(project)
  } catch (error) {
    console.error("Error updating flow via API:", error)
    return null
  }
}

/**
 * Delete a flow
 */
export async function deleteFlow(flowId: string): Promise<boolean> {
  if (!isApiStorage()) return _localDeleteFlow(flowId)

  try {
    await apiClient.delete(`/api/magic-flow/projects/${flowId}`)
    return true
  } catch (error) {
    console.error("Error deleting flow via API:", error)
    return false
  }
}

/**
 * Duplicate a flow
 */
export async function duplicateFlow(flowId: string, newName?: string): Promise<FlowData | null> {
  if (!isApiStorage()) return _localDuplicateFlow(flowId, newName)

  try {
    const original = await getFlow(flowId)
    if (!original) return null

    const body = {
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      platform: original.platform,
      trigger_id: original.triggerId,
      trigger_ids: original.triggerIds || [],
      trigger_keywords: original.triggerKeywords || [],
      trigger_match_type: original.triggerMatchType,
      trigger_ref: "", // Don't copy ref — must be unique
      wa_account_id: original.waAccountId,
      nodes: original.nodes,
      edges: original.edges,
    }

    const data = await apiClient.post<any>("/api/magic-flow/projects", body)
    const project = data.project || data
    if (data.latest_version && !project.latest_version) {
      project.latest_version = data.latest_version
    }
    return mapProjectToFlowData(project)
  } catch (error) {
    console.error("Error duplicating flow via API:", error)
    return null
  }
}

/**
 * Save draft canvas data (nodes, edges, platform) for auto-save during editing.
 */
export async function saveDraft(
  flowId: string,
  nodes: Node[],
  edges: Edge[],
  platform: Platform,
): Promise<void> {
  if (!isApiStorage()) {
    // In local mode, just save via localStorage update
    _localUpdateFlow(flowId, { nodes, edges, platform })
    return
  }

  await apiClient.put(`/api/magic-flow/projects/${flowId}/draft`, {
    nodes,
    edges,
    platform,
  })
}

// ---------------------------------------------------------------------------
// Current flow ID (always localStorage — session-level)
// ---------------------------------------------------------------------------

export function setCurrentFlowId(flowId: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(CURRENT_FLOW_KEY, flowId)
}

export function getCurrentFlowId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(CURRENT_FLOW_KEY)
}

export function clearCurrentFlowId(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(CURRENT_FLOW_KEY)
}

// ---------------------------------------------------------------------------
// Templates (async API — same backend as flows, with type=template)
// ---------------------------------------------------------------------------

/**
 * Get a template by ID.
 */
export async function getTemplate(templateId: string): Promise<FlowData | null> {
  try {
    const data = await apiClient.get<any>(`/api/magic-flow/projects/${templateId}`)
    if (!data) return null
    const project = data.project || data
    return mapProjectToFlowData(project)
  } catch (error) {
    console.error("Error loading template from API:", error)
    return null
  }
}

/**
 * Update a template.
 */
export async function updateTemplate(
  templateId: string,
  updates: Partial<Omit<FlowData, 'id' | 'createdAt'>>
): Promise<FlowData | null> {
  try {
    const body: Record<string, any> = {}
    if (updates.name !== undefined) body.name = updates.name
    if (updates.description !== undefined) body.description = updates.description
    if (updates.platform !== undefined) body.platform = updates.platform
    if (updates.nodes !== undefined) body.nodes = updates.nodes
    if (updates.edges !== undefined) body.edges = updates.edges
    if (updates.aiMetadata !== undefined) body.ai_metadata = updates.aiMetadata

    const data = await apiClient.put<any>(`/api/magic-flow/projects/${templateId}`, body)
    const project = data?.project || data
    return mapProjectToFlowData(project)
  } catch (error) {
    console.error("Error updating template via API:", error)
    return null
  }
}

/**
 * Delete a template.
 */
export async function deleteTemplate(templateId: string): Promise<boolean> {
  try {
    await apiClient.delete(`/api/magic-flow/projects/${templateId}`)
    return true
  } catch (error) {
    console.error("Error deleting template via API:", error)
    return false
  }
}

/**
 * Duplicate a template.
 */
export async function duplicateTemplate(templateId: string, newName?: string): Promise<FlowData | null> {
  try {
    const original = await getTemplate(templateId)
    if (!original) return null

    const body = {
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      platform: original.platform,
      type: "template",
      nodes: original.nodes,
      edges: original.edges,
      ai_metadata: original.aiMetadata,
    }

    const data = await apiClient.post<any>("/api/magic-flow/projects", body)
    const project = data.project || data
    if (data.latest_version && !project.latest_version) {
      project.latest_version = data.latest_version
    }
    return mapProjectToFlowData(project)
  } catch (error) {
    console.error("Error duplicating template via API:", error)
    return null
  }
}

/**
 * Create a new template.
 */
export async function createTemplate(
  name: string,
  description?: string,
  platform: Platform = "whatsapp",
  nodes: Node[] = [],
  edges: Edge[] = [],
  aiMetadata?: TemplateAIMetadata,
): Promise<FlowData> {
  const body: Record<string, any> = {
    name,
    description,
    platform,
    type: "template",
    nodes,
    edges,
  }
  if (aiMetadata) body.ai_metadata = aiMetadata

  const data = await apiClient.post<any>("/api/magic-flow/projects", body)
  const project = data.project || data
  if (data.latest_version && !project.latest_version) {
    project.latest_version = data.latest_version
  }
  return mapProjectToFlowData(project)
}

/**
 * Get all templates metadata.
 */
export async function getAllTemplates(): Promise<FlowMetadata[]> {
  try {
    const data = await apiClient.get<any>("/api/magic-flow/projects?type=template")
    const projects = data?.projects || data || []
    if (!Array.isArray(projects)) return []
    return projects.map(mapProjectToMetadata)
  } catch (error) {
    console.error("Error loading templates from API:", error)
    return []
  }
}

/**
 * Update AI metadata on a template.
 */
export async function updateTemplateMetadata(
  templateId: string,
  aiMetadata: TemplateAIMetadata
): Promise<void> {
  try {
    await apiClient.put(`/api/magic-flow/projects/${templateId}`, {
      ai_metadata: aiMetadata,
    })
  } catch (error) {
    console.error("Error updating template metadata via API:", error)
  }
}

/**
 * Generate a thumbnail for a flow (placeholder for now)
 */
export function generateThumbnail(nodes: Node[], edges: Edge[]): string {
  return `https://via.placeholder.com/300x200/6366f1/ffffff?text=${nodes.length}+nodes`
}
