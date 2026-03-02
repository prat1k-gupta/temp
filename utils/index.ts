// Export all utilities from a centralized location
export * from "./event-helpers"
export * from "./platform-helpers"
export * from "./validation"
export * from "./node-operations"
export * from "./node-factory"
export * from "./platform-labels"
export * from "./flow-layout"
export * from "./flow-plan-builder"

// Re-export commonly used utilities with cleaner names
export { 
  getClientCoordinates,
  hasClientCoordinates,
  isDoubleClick 
} from "./event-helpers"

export {
  getPlatformSpecificNodeType,
  getPlatformSpecificLabel,
  getPlatformSpecificContent,
  getBaseNodeType
} from "./platform-helpers"

export {
  isValidNodeId,
  isValidPlatform,
  isValidCoordinates,
  isWithinCharacterLimit,
  isWithinArrayLimit
} from "./validation"

export {
  createButtonData,
  createOptionData,
  generateNodeId,
  createBaseNodeData,
  canAddMoreButtons,
  getMaxButtons,
  getNextNodeType,
  supportsButtons,
  supportsOptions
} from "./node-operations"

export {
  PLATFORM_DISPLAY_NAMES,
  NODE_TYPE_LABELS,
  PLATFORM_COLORS,
  PLATFORM_TEXT_COLORS,
  getPlatformDisplayName,
  getNodeLabel,
  getAddNodeLabel,
  getPlatformColor,
  getPlatformTextColor,
  platformSupportsNodeType
} from "./platform-labels"

export {
  getButtonItemClasses,
  getCompactButtonItemClasses,
  getAddButtonClasses,
  getAddButtonFlexClasses,
  getDeleteButtonClasses,
  getDeleteButtonSmallClasses,
  getGhostButtonClasses
} from "./button-styles"
