import type { Platform, ButtonData, OptionData, NodeData } from "@/types"
import { BUTTON_LIMITS } from "@/constants/platform-limits"
import { getPlatformSpecificNodeType, getPlatformSpecificLabel } from "./platform-helpers"
import { isValidNodeId } from "./validation"

/**
 * Create button data with proper structure
 */
export const createButtonData = (text: string, index?: number): ButtonData => ({
  text: text || `Option ${(index || 0) + 1}`
})

/**
 * Create option data with proper structure
 */
export const createOptionData = (text: string, index?: number): OptionData => ({
  text: text || `Option ${(index || 0) + 1}`
})

/**
 * Generate unique node ID
 */
export const generateNodeId = (prefix: string = "node"): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create base node data structure
 */
export const createBaseNodeData = (platform: Platform, nodeType: string): NodeData => ({
  platform,
  label: getPlatformSpecificLabel(nodeType, platform),
  id: generateNodeId(nodeType),
})

/**
 * Check if a node can have more buttons added
 */
export const canAddMoreButtons = (currentButtons: ButtonData[], platform: Platform): boolean => {
  const limit = BUTTON_LIMITS[platform]
  return currentButtons.length < limit
}

/**
 * Get the maximum number of buttons for a platform
 */
export const getMaxButtons = (platform: Platform): number => {
  return BUTTON_LIMITS[platform]
}

/**
 * Determine the next node type when converting (e.g., question -> quickReply -> list)
 */
export const getNextNodeType = (currentType: string, platform: Platform): string => {
  const baseType = currentType.replace(/^(whatsapp|instagram)/, "").toLowerCase()
  
  switch (baseType) {
    case "question":
      return getPlatformSpecificNodeType("quickReply", platform)
    case "quickreply":
      return getPlatformSpecificNodeType("whatsappList", platform)
    default:
      return currentType
  }
}

/**
 * Check if a node type supports buttons
 */
export const supportsButtons = (nodeType: string): boolean => {
  const baseType = nodeType.replace(/^(whatsapp|instagram)/, "").toLowerCase()
  return baseType === "quickreply" || baseType === "question"
}

/**
 * Check if a node type supports options (lists)
 */
export const supportsOptions = (nodeType: string): boolean => {
  const baseType = nodeType.replace(/^(whatsapp|instagram)/, "").toLowerCase()
  return baseType.includes("list")
}
