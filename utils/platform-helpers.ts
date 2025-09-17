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
 * Get the reverse mapping from platform-specific type to base type
 */
export const getBaseNodeType = (platformType: string): string => {
  for (const [baseType, platformMap] of Object.entries(NODE_TYPE_MAPPINGS)) {
    for (const [platform, type] of Object.entries(platformMap)) {
      if (type === platformType) {
        return baseType
      }
    }
  }
  return platformType
}
