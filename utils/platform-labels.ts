import type { Platform } from "@/types"

/**
 * Platform display names
 */
export const PLATFORM_DISPLAY_NAMES: Record<Platform, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
} as const

/**
 * Get platform display name
 */
export function getPlatformDisplayName(platform: Platform): string {
  return PLATFORM_DISPLAY_NAMES[platform]
}

/**
 * Node type labels for each platform
 */
export const NODE_TYPE_LABELS = {
  question: {
    web: "Web Question",
    whatsapp: "WhatsApp Message",
    instagram: "Instagram Message",
  },
  quickReply: {
    web: "Web Quick Reply",
    whatsapp: "WhatsApp Quick Reply",
    instagram: "Instagram Quick Reply",
  },
  list: {
    web: "Web List",
    whatsapp: "WhatsApp List",
    instagram: "Instagram List",
  },
} as const

/**
 * Get node type label for a specific platform
 */
export function getNodeLabel(nodeType: keyof typeof NODE_TYPE_LABELS, platform: Platform): string {
  return NODE_TYPE_LABELS[nodeType][platform]
}

/**
 * Get action label for context menu
 */
export function getAddNodeLabel(nodeType: keyof typeof NODE_TYPE_LABELS, platform: Platform): string {
  return `Add ${getNodeLabel(nodeType, platform)}`
}

/**
 * Platform colors for theming
 */
export const PLATFORM_COLORS: Record<Platform, { primary: string; secondary: string; tertiary: string }> = {
  web: {
    primary: "bg-blue-500",
    secondary: "bg-blue-600",
    tertiary: "bg-blue-700",
  },
  whatsapp: {
    primary: "bg-green-500",
    secondary: "bg-green-600",
    tertiary: "bg-green-700",
  },
  instagram: {
    primary: "bg-pink-500",
    secondary: "bg-pink-600",
    tertiary: "bg-pink-700",
  },
} as const

/**
 * Platform text colors for theming
 */
export const PLATFORM_TEXT_COLORS: Record<Platform, { primary: string; secondary: string; tertiary: string }> = {
  web: {
    primary: "text-blue-500",
    secondary: "text-blue-600",
    tertiary: "text-blue-700",
  },
  whatsapp: {
    primary: "text-green-500",
    secondary: "text-green-600",
    tertiary: "text-green-700",
  },
  instagram: {
    primary: "text-pink-500",
    secondary: "text-pink-600",
    tertiary: "text-pink-700",
  },
} as const

/**
 * Get platform color
 */
export function getPlatformColor(platform: Platform, shade: "primary" | "secondary" | "tertiary" = "primary"): string {
  return PLATFORM_COLORS[platform][shade]
}

/**
 * Get platform text color
 */
export function getPlatformTextColor(platform: Platform, shade: "primary" | "secondary" | "tertiary" = "primary"): string {
  return PLATFORM_TEXT_COLORS[platform][shade]
}

/**
 * Check if platform supports a specific node type
 */
export function platformSupportsNodeType(platform: Platform, nodeType: string): boolean {
  // Web doesn't support list nodes
  if (platform === "web" && nodeType === "whatsappList") {
    return false
  }
  
  // All platforms support question, quickReply, comment
  return true
}

