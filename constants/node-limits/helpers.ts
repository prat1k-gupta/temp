import type { Platform } from "@/types"
import type { NodeLimits, ValidationResult } from "./types"
import { getNodeLimits } from "./config"
import { CHARACTER_LIMITS } from "../platform-limits"
import { getBaseNodeType } from "@/utils/platform-helpers"

/**
 * Helper functions for node limits
 * Validation and capability checking utilities
 */

/**
 * Check if a node can have buttons
 */
export function nodeSupportsButtons(nodeType: string): boolean {
  const baseType = getBaseNodeType(nodeType)
  return baseType === "quickReply"
}

/**
 * Check if a node can have options (list items)
 */
export function nodeSupportsOptions(nodeType: string): boolean {
  const baseType = getBaseNodeType(nodeType)
  return baseType === "list"
}

/**
 * Check if a node can have multiple output connections
 */
export function nodeSupportsMultipleOutputs(nodeType: string, platform: Platform): boolean {
  const limits = getNodeLimits(nodeType, platform)
  return limits.allowMultipleOutputs ?? false
}

/**
 * Get maximum number of connections for a node
 */
export function getMaxConnections(nodeType: string, platform: Platform): number {
  const limits = getNodeLimits(nodeType, platform)
  return limits.maxConnections ?? 1
}

/**
 * Get text field limit for a specific field type in a node
 */
export function getTextFieldLimit(
  nodeType: string, 
  platform: Platform, 
  fieldType: keyof Pick<NodeLimits, 'text' | 'question' | 'title' | 'description' | 'comment'>
): { min?: number; max: number; placeholder?: string } {
  const limits = getNodeLimits(nodeType, platform)
  const field = limits[fieldType]
  
  if (field) {
    return field
  }
  
  // Fallback to platform defaults
  return {
    max: CHARACTER_LIMITS[platform].question,
    placeholder: "Type here...",
  }
}

/**
 * Validate if text is within node limits
 */
export function isTextWithinNodeLimits(
  text: string,
  nodeType: string,
  platform: Platform,
  fieldType: keyof Pick<NodeLimits, 'text' | 'question' | 'title' | 'description' | 'comment'> = 'text'
): ValidationResult {
  const limits = getTextFieldLimit(nodeType, platform, fieldType)
  
  if (limits.min && text.length < limits.min) {
    return {
      valid: false,
      reason: `Minimum ${limits.min} characters required`,
      max: limits.max,
      current: text.length,
    }
  }
  
  if (text.length > limits.max) {
    return {
      valid: false,
      reason: `Maximum ${limits.max} characters allowed`,
      max: limits.max,
      current: text.length,
    }
  }
  
  return { valid: true, max: limits.max, current: text.length }
}

/**
 * Validate if buttons are within node limits
 */
export function areButtonsWithinNodeLimits(
  buttonCount: number,
  nodeType: string,
  platform: Platform
): ValidationResult {
  const limits = getNodeLimits(nodeType, platform)
  
  if (!limits.buttons) {
    return {
      valid: false,
      reason: "This node type does not support buttons",
      current: buttonCount,
    }
  }
  
  if (buttonCount < limits.buttons.min) {
    return {
      valid: false,
      reason: `Minimum ${limits.buttons.min} buttons required`,
      max: limits.buttons.max,
      current: buttonCount,
    }
  }
  
  if (buttonCount > limits.buttons.max) {
    return {
      valid: false,
      reason: `Maximum ${limits.buttons.max} buttons allowed`,
      max: limits.buttons.max,
      current: buttonCount,
    }
  }
  
  return { 
    valid: true,
    max: limits.buttons.max,
    current: buttonCount,
  }
}

/**
 * Validate if options are within node limits
 */
export function areOptionsWithinNodeLimits(
  optionCount: number,
  nodeType: string,
  platform: Platform
): ValidationResult {
  const limits = getNodeLimits(nodeType, platform)
  
  if (!limits.options) {
    return {
      valid: false,
      reason: "This node type does not support options",
      current: optionCount,
    }
  }
  
  if (optionCount < limits.options.min) {
    return {
      valid: false,
      reason: `Minimum ${limits.options.min} options required`,
      max: limits.options.max,
      current: optionCount,
    }
  }
  
  if (optionCount > limits.options.max) {
    return {
      valid: false,
      reason: `Maximum ${limits.options.max} options allowed`,
      max: limits.options.max,
      current: optionCount,
    }
  }
  
  return { 
    valid: true,
    max: limits.options.max,
    current: optionCount,
  }
}

/**
 * Validate button text length
 */
export function isButtonTextValid(
  text: string,
  nodeType: string,
  platform: Platform
): ValidationResult {
  const limits = getNodeLimits(nodeType, platform)
  
  if (!limits.buttons) {
    return {
      valid: false,
      reason: "This node type does not support buttons",
    }
  }
  
  if (text.length > limits.buttons.textMaxLength) {
    return {
      valid: false,
      reason: `Button text must be ${limits.buttons.textMaxLength} characters or less`,
      max: limits.buttons.textMaxLength,
      current: text.length,
    }
  }
  
  return { 
    valid: true,
    max: limits.buttons.textMaxLength,
    current: text.length,
  }
}

/**
 * Validate option text length
 */
export function isOptionTextValid(
  text: string,
  nodeType: string,
  platform: Platform
): ValidationResult {
  const limits = getNodeLimits(nodeType, platform)
  
  if (!limits.options) {
    return {
      valid: false,
      reason: "This node type does not support options",
    }
  }
  
  if (text.length > limits.options.textMaxLength) {
    return {
      valid: false,
      reason: `Option text must be ${limits.options.textMaxLength} characters or less`,
      max: limits.options.textMaxLength,
      current: text.length,
    }
  }
  
  return { 
    valid: true,
    max: limits.options.textMaxLength,
    current: text.length,
  }
}

/**
 * Validate option description length
 */
export function isOptionDescriptionValid(
  text: string,
  nodeType: string,
  platform: Platform
): ValidationResult {
  const limits = getNodeLimits(nodeType, platform)
  
  if (!limits.options || !limits.options.descriptionMaxLength) {
    return {
      valid: false,
      reason: "This node type does not support option descriptions",
    }
  }
  
  if (text.length > limits.options.descriptionMaxLength) {
    return {
      valid: false,
      reason: `Option description must be ${limits.options.descriptionMaxLength} characters or less`,
      max: limits.options.descriptionMaxLength,
      current: text.length,
    }
  }
  
  return { 
    valid: true,
    max: limits.options.descriptionMaxLength,
    current: text.length,
  }
}


