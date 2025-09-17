// Export all constants from a centralized location
export * from "./platform-limits"
export * from "./node-types"

// Re-export commonly used constants with cleaner names
export { 
  BUTTON_LIMITS,
  OPTION_LIMITS,
  CHARACTER_LIMITS as PLATFORM_LIMITS,
  INTERACTION_THRESHOLDS 
} from "./platform-limits"

export {
  NODE_TYPE_MAPPINGS,
  NODE_LABELS,
  NODE_CONTENT
} from "./node-types"
