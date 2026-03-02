import type { Node } from "@xyflow/react"
import type { FlowData } from "@/utils/flow-storage"
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
  return {
    ...node,
    data: {
      ...node.data,
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
