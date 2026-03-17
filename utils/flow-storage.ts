import type { Node, Edge } from "@xyflow/react"
import type { Platform, TemplateAIMetadata } from "@/types"

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
  publishedFlowId?: string // fs-whatsapp flow ID after first publish
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

/**
 * Get all flows metadata (without full node/edge data)
 */
export function getAllFlows(): FlowMetadata[] {
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

/**
 * Get a specific flow by ID
 */
export function getFlow(flowId: string): FlowData | null {
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

/**
 * Create a new flow
 */
export function createFlow(
  name: string,
  description?: string,
  platform: Platform = "web",
  triggerId?: string,
  triggerKeywords?: string[],
  waAccountId?: string
): FlowData {
  const newFlow: FlowData = {
    id: `flow-${Date.now()}`,
    name,
    description,
    platform,
    triggerId,
    triggerIds: triggerId ? [triggerId] : [],
    triggerKeywords: triggerKeywords || [],
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
        },
        draggable: false,
        selectable: true, // Allow selection to edit triggers
      },
    ],
    edges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  
  saveFlow(newFlow)
  return newFlow
}

/**
 * Save or update a flow
 */
export function saveFlow(flow: FlowData): void {
  if (typeof window === "undefined") return
  
  try {
    const stored = localStorage.getItem(FLOWS_STORAGE_KEY)
    let flows: FlowData[] = stored ? JSON.parse(stored) : []
    
    // Update timestamp
    flow.updatedAt = new Date().toISOString()
    
    // Find and update or append
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

/**
 * Update flow metadata (name, description, platform, nodes, edges)
 */
export function updateFlow(
  flowId: string, 
  updates: Partial<Omit<FlowData, 'id' | 'createdAt'>>
): FlowData | null {
  if (typeof window === "undefined") return null
  
  try {
    const flow = getFlow(flowId)
    if (!flow) return null
    
    const updatedFlow: FlowData = {
      ...flow,
      ...updates,
      id: flow.id, // Preserve ID
      createdAt: flow.createdAt, // Preserve creation date
      updatedAt: new Date().toISOString(),
    }
    
    saveFlow(updatedFlow)
    return updatedFlow
  } catch (error) {
    console.error("Error updating flow:", error)
    return null
  }
}

/**
 * Delete a flow
 */
export function deleteFlow(flowId: string): boolean {
  if (typeof window === "undefined") return false
  
  try {
    const stored = localStorage.getItem(FLOWS_STORAGE_KEY)
    if (!stored) return false
    
    const flows: FlowData[] = JSON.parse(stored)
    const filtered = flows.filter(f => f.id !== flowId)
    
    if (filtered.length === flows.length) {
      return false // Flow not found
    }
    
    localStorage.setItem(FLOWS_STORAGE_KEY, JSON.stringify(filtered))
    
    // Clear current flow if it was deleted
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

/**
 * Duplicate a flow
 */
export function duplicateFlow(flowId: string, newName?: string): FlowData | null {
  if (typeof window === "undefined") return null
  
  try {
    const flow = getFlow(flowId)
    if (!flow) return null
    
    const duplicatedFlow: FlowData = {
      ...flow,
      id: `flow-${Date.now()}`,
      name: newName || `${flow.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    saveFlow(duplicatedFlow)
    return duplicatedFlow
  } catch (error) {
    console.error("Error duplicating flow:", error)
    return null
  }
}

/**
 * Set the current flow ID (for context)
 */
export function setCurrentFlowId(flowId: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(CURRENT_FLOW_KEY, flowId)
}

/**
 * Get the current flow ID
 */
export function getCurrentFlowId(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(CURRENT_FLOW_KEY)
}

/**
 * Clear the current flow ID
 */
export function clearCurrentFlowId(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(CURRENT_FLOW_KEY)
}

/**
 * Get all shared flows from the database (Redis via API)
 */
export async function getSharedFlows(): Promise<FlowMetadata[]> {
  try {
    const response = await fetch('/api/flows')
    if (!response.ok) {
      console.error('Failed to fetch shared flows:', response.statusText)
      return []
    }
    
    const flows: FlowMetadata[] = await response.json()
    // Sort flows by updatedAt (newest first)
    return flows.sort((a, b) => {
      const dateA = new Date(a.updatedAt).getTime()
      const dateB = new Date(b.updatedAt).getTime()
      return dateB - dateA // Descending order (newest first)
    })
  } catch (error) {
    console.error('Error fetching shared flows:', error)
    return []
  }
}

/**
 * Delete a shared flow from the database (Redis via API)
 */
export async function deleteSharedFlow(flowId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/flows/${flowId}`, {
      method: 'DELETE',
    })
    
    if (!response.ok) {
      console.error('Failed to delete shared flow:', response.statusText)
      return false
    }
    
    return true
  } catch (error) {
    console.error('Error deleting shared flow:', error)
    return false
  }
}

/**
 * Create a new template
 */
export function createTemplate(
  name: string,
  description?: string,
  platform: Platform = "whatsapp",
  nodes: Node[] = [],
  edges: Edge[] = [],
  aiMetadata?: TemplateAIMetadata,
): FlowData {
  const newTemplate: FlowData = {
    id: `template-${Date.now()}`,
    name,
    description,
    platform,
    type: "template",
    nodes,
    edges,
    ...(aiMetadata ? { aiMetadata } : {}),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  saveFlow(newTemplate)
  return newTemplate
}

/**
 * Get all templates metadata
 */
export function getAllTemplates(): FlowMetadata[] {
  if (typeof window === "undefined") return []

  try {
    const stored = localStorage.getItem(FLOWS_STORAGE_KEY)
    if (!stored) return []

    const flows: FlowData[] = JSON.parse(stored)
    return flows
      .filter(flow => flow.type === "template")
      .map(flow => ({
        id: flow.id,
        name: flow.name,
        description: flow.description,
        platform: flow.platform,
        type: flow.type,
        aiMetadata: flow.aiMetadata,
        thumbnail: flow.thumbnail,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
        nodeCount: flow.nodes.length,
        edgeCount: flow.edges.length,
      }))
  } catch (error) {
    console.error("Error loading templates:", error)
    return []
  }
}

/**
 * Update AI metadata on a template
 */
export function updateTemplateMetadata(
  templateId: string,
  aiMetadata: TemplateAIMetadata
): void {
  if (typeof window === "undefined") return

  try {
    const stored = localStorage.getItem(FLOWS_STORAGE_KEY)
    if (!stored) return

    const flows: FlowData[] = JSON.parse(stored)
    const idx = flows.findIndex(f => f.id === templateId && f.type === "template")
    if (idx < 0) return

    flows[idx] = { ...flows[idx], aiMetadata, updatedAt: new Date().toISOString() }
    localStorage.setItem(FLOWS_STORAGE_KEY, JSON.stringify(flows))
  } catch (error) {
    console.error("Error updating template metadata:", error)
  }
}

/**
 * Generate a thumbnail for a flow (placeholder for now)
 */
export function generateThumbnail(nodes: Node[], edges: Edge[]): string {
  // This is a placeholder - in a real implementation, you might:
  // 1. Render the flow to a canvas
  // 2. Generate a data URL
  // 3. Return that URL
  // For now, we'll just return a placeholder based on node count
  return `https://via.placeholder.com/300x200/6366f1/ffffff?text=${nodes.length}+nodes`
}

