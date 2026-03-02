import type { Platform } from "@/types"
import { NODE_TYPE_MAPPINGS, NODE_LABELS, NODE_CONTENT } from "@/constants/node-types"

/**
 * Get the platform-specific node type for a base node type
 */
export const getPlatformSpecificNodeType = (baseType: string, platform: Platform): string => {
  if (platform === "web") return baseType
  
  return NODE_TYPE_MAPPINGS[baseType]?.[platform] || baseType
}

/**
 * Get the platform-specific label for a node type
 */
export const getPlatformSpecificLabel = (nodeType: string, platform: Platform): string => {
  return NODE_LABELS[nodeType]?.[platform] || NODE_LABELS[nodeType]?.web || "Node"
}

/**
 * Get the platform-specific content for a node type
 */
export const getPlatformSpecificContent = (nodeType: string, platform: Platform): string => {
  return NODE_CONTENT[nodeType]?.[platform] || NODE_CONTENT[nodeType]?.web || ""
}

/**
 * Get the reverse mapping from platform-specific type to base type.
 * Uses string matching to cover all node types including platform-specific ones.
 */
export const getBaseNodeType = (platformType: string): string => {
  // Question nodes
  if (platformType.includes("Question") || platformType === "question") {
    return "question"
  }

  // Quick reply nodes
  if (platformType.includes("QuickReply") || platformType === "quickReply") {
    return "quickReply"
  }

  // List nodes
  if (platformType.includes("List") || platformType === "interactiveList") {
    return "list"
  }

  // Comment nodes
  if (platformType === "comment") return "comment"

  // Start nodes
  if (platformType === "start") return "start"

  // Platform-specific message nodes
  if (platformType === "whatsappMessage") return "whatsappMessage"
  if (platformType === "instagramDM") return "instagramDM"
  if (platformType === "instagramStory") return "instagramStory"

  // Tracking notification
  if (platformType === "trackingNotification") return "trackingNotification"

  return platformType
}
