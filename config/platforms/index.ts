import type { Platform } from "@/types"
import { WEB_PLATFORM_CONFIG } from "./web"
import { WHATSAPP_PLATFORM_CONFIG } from "./whatsapp"
import { INSTAGRAM_PLATFORM_CONFIG } from "./instagram"

export const PLATFORM_CONFIGS = {
  web: WEB_PLATFORM_CONFIG,
  whatsapp: WHATSAPP_PLATFORM_CONFIG,
  instagram: INSTAGRAM_PLATFORM_CONFIG,
} as const

export type PlatformConfig = typeof PLATFORM_CONFIGS[Platform]

/**
 * Get configuration for a specific platform
 */
export const getPlatformConfig = (platform: Platform) => {
  return PLATFORM_CONFIGS[platform]
}

/**
 * Get all available platforms
 */
export const getAllPlatforms = (): Platform[] => {
  return Object.keys(PLATFORM_CONFIGS) as Platform[]
}

export * from "./web"
export * from "./whatsapp"
export * from "./instagram"
