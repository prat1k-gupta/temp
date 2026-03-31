/**
 * Client-side wrappers for fs-whatsapp chatbot endpoints.
 * These replace the old Next.js proxy routes (api/whatsapp/*) that did
 * path translation and response shaping.
 */

import { apiClient } from "./api-client"

export interface ChatbotFlow {
  id: string
  name: string
  flowSlug: string
  variables: string[]
  triggerKeywords: string[]
  triggerMatchType: string
  triggerRef: string
}

/**
 * Publish a flow to fs-whatsapp (create or update chatbot flow).
 * Replaces api/whatsapp/publish/route.ts
 */
export async function publishFlowToWhatsApp(
  flowData: Record<string, any>,
  publishedFlowId?: string,
): Promise<{ success: boolean; flowId: string; flowSlug?: string; updated: boolean }> {
  const isUpdate = !!publishedFlowId
  const path = isUpdate
    ? `/api/chatbot/flows/${publishedFlowId}`
    : "/api/chatbot/flows"

  const result = isUpdate
    ? await apiClient.put<any>(path, flowData)
    : await apiClient.post<any>(path, flowData)

  const flowId = result?.id || result?.flow_id || publishedFlowId
  const flowSlug = result?.flow_slug || undefined
  return { success: true, flowId, flowSlug, updated: isUpdate }
}

/**
 * Get all chatbot flows (published runtime flows).
 * Replaces api/whatsapp/flows/route.ts
 */
export async function getChatbotFlows(): Promise<{ flows: ChatbotFlow[] }> {
  const result = await apiClient.get<any>("/api/chatbot/flows")
  const rawFlows = result?.flows || []
  const flows = rawFlows.map((f: any) => ({
    id: f.id,
    name: f.name,
    flowSlug: f.flow_slug,
    variables: f.variables || [],
    triggerKeywords: f.trigger_keywords || [],
    triggerMatchType: f.trigger_match_type || "contains_whole_word",
    triggerRef: f.trigger_ref || "",
  }))
  return { flows }
}

/**
 * Get a single chatbot flow's slug.
 * Replaces api/whatsapp/flows/[flowId]/route.ts
 */
export async function getChatbotFlowSlug(
  flowId: string,
): Promise<{ flowSlug?: string }> {
  const result = await apiClient.get<any>(`/api/chatbot/flows/${flowId}`)
  return { flowSlug: result?.flow_slug }
}

/**
 * Get global variables from chatbot settings.
 * Replaces api/whatsapp/settings/route.ts
 */
export async function getGlobalVariables(): Promise<{
  globalVariables: Record<string, string>
}> {
  const result = await apiClient.get<any>("/api/chatbot/settings")
  const settings = result?.settings || result
  return { globalVariables: settings?.global_variables || {} }
}

/**
 * Update trigger keywords/match type/ref on a published chatbot flow.
 * Replaces api/whatsapp/update-keywords/route.ts
 */
export async function updateFlowKeywords(
  flowId: string,
  params: {
    triggerKeywords?: string[]
    triggerMatchType?: string
    triggerRef?: string
  },
): Promise<void> {
  const payload: Record<string, any> = {}
  if (Array.isArray(params.triggerKeywords)) {
    payload.trigger_keywords = params.triggerKeywords
  }
  if (params.triggerMatchType !== undefined) {
    payload.trigger_match_type = params.triggerMatchType
  }
  if (params.triggerRef !== undefined) {
    payload.trigger_ref = params.triggerRef
  }

  if (Object.keys(payload).length === 0) return

  await apiClient.put(`/api/chatbot/flows/${flowId}`, payload)
}
