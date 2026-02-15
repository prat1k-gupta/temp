import type { Platform } from "@/types"

/**
 * Get the preview URL for a published flow based on platform
 * Uses environment variables:
 * - NEXT_PUBLIC_WEB_PUBLISH_URL for web platform
 * - NEXT_PUBLIC_WHATSAPP_PUBLISH_URL for WhatsApp platform
 * 
 * @param platform - The platform of the flow
 * @returns The preview URL or undefined if not configured
 */
export function getPreviewUrl(platform: Platform): string | undefined {
  switch (platform) {
    case "web":
      return process.env.NEXT_PUBLIC_WEB_PUBLISH_URL
    case "whatsapp":
      return process.env.NEXT_PUBLIC_WHATSAPP_PUBLISH_URL
    case "instagram":
      // Instagram doesn't have a publish URL configured yet
      return undefined
    default:
      return undefined
  }
}

