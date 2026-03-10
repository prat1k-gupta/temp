// Node/platform limits have moved to node-categories.ts (single source of truth).
// Re-exported here for backwards compatibility.
export { BUTTON_LIMITS, OPTION_LIMITS, CHARACTER_LIMITS } from "./node-categories"

// UI interaction thresholds (not node limits)
export const INTERACTION_THRESHOLDS = {
  doubleClick: {
    time: 300, // milliseconds
    distance: 5, // pixels
  },
} as const
