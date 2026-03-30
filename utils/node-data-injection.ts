import type { Node } from "@xyflow/react"
import type { FlowData } from "@/utils/flow-storage"
import type { ButtonData, OptionData } from "@/types"
import { collectFlowVariables, collectFlowVariablesRich } from "@/utils/flow-variables"

interface NodeCallbacks {
  updateNodeData: (nodeId: string, updates: any, shouldFocus?: boolean) => void
  addButtonToNode: (nodeId: string) => void
  addConnectedNode: (sourceNodeId: string) => void
  deleteNode: (nodeId: string) => void
  convertNode: (nodeId: string, newNodeType: string, updatedData: any) => void
  openFlowBuilder?: (nodeId: string, mode: "create" | "edit") => void
}

interface WhatsAppFlowContext {
  availableFlows: any[]
}

interface FlowContext {
  flowId: string
  currentFlow: FlowData | null
  setCurrentFlow: React.Dispatch<React.SetStateAction<FlowData | null>>
  saveFlowFields?: (updates: Record<string, any>) => void
}

import type { FlowVariable } from "@/utils/flow-variables"

// Stable empty arrays to avoid creating new references on every render
const EMPTY_STRINGS: string[] = []
const EMPTY_FLOW_VARS: FlowVariable[] = []
const EMPTY_KEYWORDS: string[] = []

/**
 * Injects callback functions into a node's data for use by node components.
 * Handles the start node special case (flowDescription + onFlowUpdate).
 */
export function injectNodeCallbacks(
  node: Node,
  callbacks: NodeCallbacks,
  flowContext?: FlowContext,
  allNodes?: Node[],
  whatsAppFlowContext?: WhatsAppFlowContext
): Node {
  // Ensure stable IDs exist for buttons/options (migration for legacy data)
  const data = { ...node.data }
  if (Array.isArray(data.buttons)) {
    const allHaveIds = (data.buttons as ButtonData[]).every((btn) => !!btn.id)
    if (!allHaveIds) {
      data.buttons = (data.buttons as ButtonData[]).map((btn, i) => {
        if (btn.id) return btn
        return { ...btn, id: `btn-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}` }
      })
      node = { ...node, data }
    }
  }
  if (Array.isArray(data.options)) {
    const allHaveIds = (data.options as OptionData[]).every((opt) => !!opt.id)
    if (!allHaveIds) {
      data.options = (data.options as OptionData[]).map((opt, i) => {
        if (opt.id) return opt
        return { ...opt, id: `opt-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}` }
      })
      node = { ...node, data }
    }
  }

  const flowVariables = allNodes ? collectFlowVariables(allNodes) : EMPTY_STRINGS
  const flowVariablesRich = allNodes ? collectFlowVariablesRich(allNodes) : EMPTY_FLOW_VARS

  return {
    ...node,
    data: {
      ...data,
      id: node.id,
      flowVariables,
      flowVariablesRich,
      onNodeUpdate: callbacks.updateNodeData,
      onAddButton: () => callbacks.addButtonToNode(node.id),
      onAddOption: () => callbacks.addButtonToNode(node.id),
      onAddConnection: () => callbacks.addConnectedNode(node.id),
      onDelete: () => callbacks.deleteNode(node.id),
      onConvert: callbacks.convertNode,
      ...(node.type === "whatsappFlow" && {
        onOpenFlowBuilder: callbacks.openFlowBuilder,
        availableWhatsAppFlows: whatsAppFlowContext?.availableFlows || [],
      }),
      ...(node.type === "start" && flowContext && {
        flowDescription: flowContext.currentFlow?.description || "",
        triggerKeywords: ((data.triggerKeywords as string[])?.length ? data.triggerKeywords as string[] : undefined) ?? flowContext.currentFlow?.triggerKeywords ?? EMPTY_KEYWORDS,
        triggerMatchType: (data.triggerMatchType as string) || flowContext.currentFlow?.triggerMatchType || "contains_whole_word",
        triggerRef: (data.triggerRef as string) || flowContext.currentFlow?.triggerRef || "",
        publishedFlowId: flowContext.currentFlow?.publishedFlowId || "",
        waPhoneNumber: flowContext.currentFlow?.waPhoneNumber || "",
        onFlowUpdate: (updates: { description?: string; triggerKeywords?: string[]; triggerMatchType?: string; triggerRef?: string }) => {
          if (flowContext.flowId) {
            const flowUpdates: Record<string, any> = {}
            if (updates.description !== undefined) flowUpdates.description = updates.description
            if (updates.triggerKeywords !== undefined) flowUpdates.triggerKeywords = updates.triggerKeywords
            if (updates.triggerMatchType !== undefined) flowUpdates.triggerMatchType = updates.triggerMatchType
            if (updates.triggerRef !== undefined) flowUpdates.triggerRef = updates.triggerRef
            if (Object.keys(flowUpdates).length > 0) {
              flowContext.setCurrentFlow((prev) => (prev ? { ...prev, ...flowUpdates } : null))
              if (flowContext.saveFlowFields) {
                flowContext.saveFlowFields(flowUpdates)
              }
              // Sync trigger fields to fs-whatsapp if flow is published
              if (
                flowContext.currentFlow?.publishedFlowId &&
                flowContext.currentFlow?.platform === "whatsapp"
              ) {
                const syncPayload: Record<string, any> = {
                  flowId: flowContext.currentFlow.publishedFlowId,
                }
                if (updates.triggerKeywords !== undefined) syncPayload.triggerKeywords = updates.triggerKeywords
                if (updates.triggerMatchType !== undefined) syncPayload.triggerMatchType = updates.triggerMatchType
                if (updates.triggerRef !== undefined) syncPayload.triggerRef = updates.triggerRef
                if (Object.keys(syncPayload).length > 1) {
                  fetch("/api/whatsapp/update-keywords", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(syncPayload),
                  }).catch(() => {})
                }
              }
            }
          }
        },
      }),
    },
  }
}
