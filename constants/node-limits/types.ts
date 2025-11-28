/**
 * Type definitions for node-specific limitations
 */

/**
 * Comprehensive limits for a node type
 * Defines all possible constraints that can be applied to a node
 */
export interface NodeLimits {
  // Text field limits
  text?: {
    min?: number
    max: number
    placeholder?: string
  }
  question?: {
    min?: number
    max: number
    placeholder?: string
  }
  title?: {
    min?: number
    max: number
    placeholder?: string
  }
  description?: {
    min?: number
    max: number
    placeholder?: string
  }
  comment?: {
    min?: number
    max: number
    placeholder?: string
  }
  
  // Button/Option limits
  buttons?: {
    min: number
    max: number
    textMaxLength: number
  }
  options?: {
    min: number
    max: number
    textMaxLength: number
    descriptionMaxLength?: number
  }
  
  // List-specific limits
  listTitle?: {
    max: number
  }
  
  // Other constraints
  maxConnections?: number
  allowMultipleOutputs?: boolean
  allowMultipleInputs?: boolean
}

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean
  reason?: string
  max?: number
  current?: number
}

