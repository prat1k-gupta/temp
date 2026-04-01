import type { Platform } from "@/types"

export interface PlatformConfig {
  name: Platform
  displayName: string
}

// Node-specific limits (text, buttons, options) are resolved via getNodeLimits()
// from constants/node-limits/config.ts — do NOT duplicate them here.
export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  whatsapp: {
    name: "whatsapp",
    displayName: "WhatsApp",
  },
  instagram: {
    name: "instagram",
    displayName: "Instagram",
  },
  web: {
    name: "web",
    displayName: "Web",
  },
} as const

export function getPlatformConfig(platform: Platform): PlatformConfig {
  return PLATFORM_CONFIGS[platform]
}
