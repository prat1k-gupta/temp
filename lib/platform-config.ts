import type { Platform } from "@/types"

export interface PlatformConfig {
  name: Platform
  displayName: string
  colors: {
    primary: string
    secondary: string
    accent: string
  }
}

// Node-specific limits (text, buttons, options) are resolved via getNodeLimits()
// from constants/node-limits/config.ts — do NOT duplicate them here.
export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  whatsapp: {
    name: "whatsapp",
    displayName: "WhatsApp",
    colors: {
      primary: "#25d366",
      secondary: "#128c7e",
      accent: "#075e54",
    },
  },
  instagram: {
    name: "instagram",
    displayName: "Instagram",
    colors: {
      primary: "#E1306C",
      secondary: "#C13584",
      accent: "#833AB4",
    },
  },
  web: {
    name: "web",
    displayName: "Web",
    colors: {
      primary: "#3b82f6",
      secondary: "#2563eb",
      accent: "#1d4ed8",
    },
  },
} as const

export function getPlatformConfig(platform: Platform): PlatformConfig {
  return PLATFORM_CONFIGS[platform]
}

