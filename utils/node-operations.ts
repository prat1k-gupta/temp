import type { Platform, ChoiceData, NodeData } from "@/types"
import { BUTTON_LIMITS } from "@/constants/platform-limits"
import { getPlatformSpecificNodeType, getPlatformSpecificLabel } from "./platform-helpers"
import { isValidNodeId } from "./validation"

/**
 * Create choice data — canonical factory for whatsappQuickReply /
 * whatsappInteractiveList / web choice nodes. All choice-bearing node
 * types store their items in the unified `data.choices` field.
 */
export const createChoiceData = (text: string, index?: number): ChoiceData => ({
  text: text || `Option ${(index || 0) + 1}`,
  id: `choice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
export const canAddMoreButtons = (currentButtons: ChoiceData[], platform: Platform): boolean => {
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
      return getPlatformSpecificNodeType("interactiveList", platform)
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

/**
 * Platforms that support auto-converting quickReply → interactiveList.
 * Web has no interactiveList — buttons get trimmed to 10 instead.
 */
const LIST_CONVERSION_PLATFORMS: Platform[] = ["whatsapp", "instagram"]

/**
 * Check if a quickReply should auto-convert to interactiveList.
 * Returns conversion metadata when buttonCount exceeds the platform's button limit
 * and the platform supports interactiveList.
 */
export function shouldConvertToList(
  buttonCount: number,
  platform: Platform
): { shouldConvert: boolean; newNodeType: string; newLabel: string } {
  const limit = BUTTON_LIMITS[platform]

  if (buttonCount <= limit || !LIST_CONVERSION_PLATFORMS.includes(platform)) {
    return { shouldConvert: false, newNodeType: "", newLabel: "" }
  }

  return {
    shouldConvert: true,
    newNodeType: getPlatformSpecificNodeType("interactiveList", platform),
    newLabel: getPlatformSpecificLabel("interactiveList", platform),
  }
}

