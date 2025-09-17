import type { Node } from "@xyflow/react"
import type { Platform, NodeData, ButtonData, OptionData } from "@/types"
import { 
  getPlatformSpecificNodeType, 
  getPlatformSpecificLabel, 
  getPlatformSpecificContent 
} from "./platform-helpers"
import { generateNodeId, createButtonData, createOptionData } from "./node-operations"

interface NodePosition {
  x: number
  y: number
}

/**
 * Create a question node with platform-specific configuration
 */
export const createQuestionNode = (
  platform: Platform, 
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("question")
  return {
    id: nodeId,
    type: getPlatformSpecificNodeType("question", platform),
    position,
    data: {
      platform,
      label: getPlatformSpecificLabel("question", platform),
      question: getPlatformSpecificContent("question", platform),
    } as NodeData,
  }
}

/**
 * Create a quick reply node with platform-specific configuration
 */
export const createQuickReplyNode = (
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("quickReply")
  return {
    id: nodeId,
    type: getPlatformSpecificNodeType("quickReply", platform),
    position,
    data: {
      platform,
      label: getPlatformSpecificLabel("quickReply", platform),
      question: getPlatformSpecificContent("quickReply", platform),
      buttons: [createButtonData("Action 1")],
    } as NodeData,
  }
}

/**
 * Create a list node with platform-specific configuration
 */
export const createListNode = (
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("list")
  return {
    id: nodeId,
    type: getPlatformSpecificNodeType("whatsappList", platform),
    position,
    data: {
      platform,
      label: getPlatformSpecificLabel("whatsappList", platform),
      question: getPlatformSpecificContent("whatsappList", platform),
      options: [createOptionData("Option 1")],
    } as NodeData,
  }
}

/**
 * Create a comment node
 */
export const createCommentNode = (
  platform: Platform,
  position: NodePosition,
  customId?: string,
  onUpdate?: (updates: any) => void,
  onDelete?: () => void
): Node => {
  const nodeId = customId || generateNodeId("comment")
  return {
    id: nodeId,
    type: "comment",
    position,
    data: {
      platform,
      comment: "Add your comment here...",
      createdBy: "You",
      createdAt: new Date().toISOString(),
      onUpdate,
      onDelete,
    } as NodeData,
  }
}

/**
 * Factory function to create any node type
 */
export const createNode = (
  nodeType: string,
  platform: Platform,
  position: NodePosition,
  customId?: string,
  additionalData?: Partial<NodeData>
): Node => {
  let node: Node

  switch (nodeType) {
    case "question":
      node = createQuestionNode(platform, position, customId)
      break
    case "quickReply":
      node = createQuickReplyNode(platform, position, customId)
      break
    case "whatsappList":
      node = createListNode(platform, position, customId)
      break
    case "comment":
      node = createCommentNode(platform, position, customId)
      break
    default:
      throw new Error(`Unknown node type: ${nodeType}`)
  }

  // Merge additional data if provided
  if (additionalData) {
    node.data = { ...node.data, ...additionalData }
  }

  return node
}
