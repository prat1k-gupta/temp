import { WebPlatform } from "./platforms/web-platform"
import { WhatsAppPlatform } from "./platforms/whatsapp-platform"
import { InstagramPlatform } from "./platforms/instagram-platform"
import type { BasePlatform, NodeType } from "./platforms/base-platform"

export class NodeRegistry {
  private platforms: Map<string, BasePlatform> = new Map()

  constructor() {
    this.registerPlatform(new WebPlatform())
    this.registerPlatform(new WhatsAppPlatform())
    this.registerPlatform(new InstagramPlatform())
  }

  registerPlatform(platform: BasePlatform): void {
    this.platforms.set(platform.constraints.name, platform)
  }

  getPlatform(name: string): BasePlatform | undefined {
    return this.platforms.get(name)
  }

  getAllPlatforms(): BasePlatform[] {
    return Array.from(this.platforms.values())
  }

  getAvailableNodesForPlatform(platformName: string): NodeType[] {
    const platform = this.getPlatform(platformName)
    return platform ? platform.availableNodes : []
  }

  validateNodeForPlatform(nodeType: string, platformName: string, data: any): { isValid: boolean; errors: string[] } {
    const platform = this.getPlatform(platformName)
    if (!platform) {
      return { isValid: false, errors: ["Platform not found"] }
    }

    const errors: string[] = []

    // Validate text length if present
    if (data.text) {
      const validation = platform.validateText(data.text, platform.constraints.messageMaxLength)
      if (!validation.isValid && validation.message) {
        errors.push(validation.message)
      }
    }

    // Validate button text lengths
    if (data.options) {
      data.options.forEach((option: any, index: number) => {
        if (option.label) {
          const validation = platform.validateText(option.label, platform.constraints.buttonTextMaxLength)
          if (!validation.isValid && validation.message) {
            errors.push(`Button ${index + 1}: ${validation.message}`)
          }
        }
      })
    }

    return { isValid: errors.length === 0, errors }
  }
}

// Singleton instance
export const nodeRegistry = new NodeRegistry()
