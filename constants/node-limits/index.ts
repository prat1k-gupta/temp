/**
 * Node Limits Module
 * Centralized module for node-specific limitations and validations
 * 
 * Structure:
 * - types.ts: Type definitions for node limits
 * - config.ts: Node limit configurations
 * - helpers.ts: Validation and utility functions
 */

// Export types
export type { NodeLimits, ValidationResult } from "./types"

// Export configuration
export { getNodeLimits } from "./config"

// Export all helper functions
export {
  nodeSupportsButtons,
  nodeSupportsOptions,
  nodeSupportsMultipleOutputs,
  getMaxConnections,
  getTextFieldLimit,
  isTextWithinNodeLimits,
  areButtonsWithinNodeLimits,
  areOptionsWithinNodeLimits,
  isButtonTextValid,
  isOptionTextValid,
  isOptionDescriptionValid,
} from "./helpers"

