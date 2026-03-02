import type { Node } from "@xyflow/react"
import type { FlowData } from "@/utils/flow-storage"
import type { ButtonData, OptionData } from "@/types"
import { updateFlow } from "@/utils/flow-storage"

interface NodeCallbacks {
  updateNodeData: (nodeId: string, updates: any, shouldFocus?: boolean) => void
  addButtonToNode: (nodeId: string) => void
  addConnectedNode: (sourceNodeId: string) => void
  deleteNode: (nodeId: string) => void
  convertNode: (nodeId: string, newNodeType: string, updatedData: any) => void
}

interface FlowContext {
  flowId: string
  currentFlow: FlowData | null
  setCurrentFlow: React.Dispatch<React.SetStateAction<FlowData | null>>
}

/**
 * Injects callback functions into a node's data for use by node components.
 * Handles the start node special case (flowDescription + onFlowUpdate).
 */
export function injectNodeCallbacks(
  node: Node,
  callbacks: NodeCallbacks,
  flowContext?: FlowContext
): Node {
  // Ensure stable IDs exist for buttons/options (migration for legacy data)
  const data = { ...node.data }
  if (Array.isArray(data.buttons)) {
    let needsUpdate = false
    data.buttons = (data.buttons as ButtonData[]).map((btn, i) => {
      if (btn.id) return btn
      needsUpdate = true
      return { ...btn, id: `btn-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}` }
    })
    if (needsUpdate) node = { ...node, data }
  }
  if (Array.isArray(data.options)) {
    let needsUpdate = false
    data.options = (data.options as OptionData[]).map((opt, i) => {
      if (opt.id) return opt
      needsUpdate = true
      return { ...opt, id: `opt-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}` }
    })
    if (needsUpdate) node = { ...node, data }
  }

  return {
    ...node,
    data: {
      ...data,
      id: node.id,
      onNodeUpdate: callbacks.updateNodeData,
      onAddButton: () => callbacks.addButtonToNode(node.id),
      onAddOption: () => callbacks.addButtonToNode(node.id),
      onAddConnection: () => callbacks.addConnectedNode(node.id),
      onDelete: () => callbacks.deleteNode(node.id),
      onConvert: callbacks.convertNode,
      ...(node.type === "start" && flowContext && {
        flowDescription: flowContext.currentFlow?.description || "",
        onFlowUpdate: (updates: { description?: string }) => {
          if (updates.description !== undefined && flowContext.flowId) {
            updateFlow(flowContext.flowId, { description: updates.description })
            flowContext.setCurrentFlow((prev) => (prev ? { ...prev, description: updates.description } : null))
          }
        },
      }),
    },
  }
}
