import type { Platform } from "@/types"

/**
 * Validate if a node ID is valid
 */
export const isValidNodeId = (nodeId: string): boolean => {
  return typeof nodeId === 'string' && nodeId.length > 0
}

/**
 * Type guard to check if a value is a valid platform
 */
export const isValidPlatform = (platform: any): platform is Platform => {
  return platform === "web" || platform === "whatsapp" || platform === "instagram"
}

/**
 * Validate if coordinates are within reasonable bounds
 */
export const isValidCoordinates = (x: number, y: number): boolean => {
  return typeof x === 'number' && typeof y === 'number' && 
         !isNaN(x) && !isNaN(y) && 
         x >= 0 && y >= 0
}

/**
 * Validate if a text string is within character limits
 */
export const isWithinCharacterLimit = (text: string, limit: number): boolean => {
  return typeof text === 'string' && text.length <= limit
}

/**
 * Validate if an array is within size limits
 */
export const isWithinArrayLimit = (array: any[], limit: number): boolean => {
  return Array.isArray(array) && array.length <= limit
}
