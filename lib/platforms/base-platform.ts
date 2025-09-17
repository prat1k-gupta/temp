export interface PlatformConstraints {
  name: string
  displayName: string
  messageMaxLength: number
  buttonTextMaxLength: number
  maxQuickReplies: number
  maxListItems: number
  supportsRichText: boolean
  supportsImages: boolean
  supportsFiles: boolean
  colors: {
    primary: string
    secondary: string
    accent: string
  }
}

export interface NodeType {
  id: string
  name: string
  category: "input" | "output" | "logic" | "integration"
  icon: string
  description: string
  platforms: string[]
  defaultData: Record<string, any>
}

export abstract class BasePlatform {
  abstract constraints: PlatformConstraints
  abstract availableNodes: NodeType[]

  validateText(text: string, maxLength: number): { isValid: boolean; message?: string } {
    if (text.length > maxLength) {
      return {
        isValid: false,
        message: `Text exceeds ${maxLength} character limit for ${this.constraints.displayName}`,
      }
    }
    return { isValid: true }
  }

  getNodesByCategory(category: NodeType["category"]): NodeType[] {
    return this.availableNodes.filter((node) => node.category === category)
  }
}
