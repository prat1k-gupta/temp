import { BasePlatform, type PlatformConstraints, type NodeType } from "./base-platform"

export class InstagramPlatform extends BasePlatform {
  constraints: PlatformConstraints = {
    name: "instagram",
    displayName: "Instagram",
    messageMaxLength: 100,
    buttonTextMaxLength: 15,
    maxQuickReplies: 2,
    maxListItems: 5,
    supportsRichText: false,
    supportsImages: true,
    supportsFiles: false,
    colors: {
      primary: "#e4405f",
      secondary: "#833ab4",
      accent: "#fd5949",
    },
  }

  availableNodes: NodeType[] = [
    {
      id: "instagram-story",
      name: "Story Reply",
      category: "input",
      icon: "📸",
      description: "Interactive story element",
      platforms: ["instagram"],
      defaultData: {
        text: "Tap to reply",
        stickers: [],
      },
    },
    {
      id: "instagram-dm",
      name: "Direct Message",
      category: "output",
      icon: "📩",
      description: "Send a direct message",
      platforms: ["instagram"],
      defaultData: {
        text: "Hello!",
      },
    },
    {
      id: "instagram-quick-reply",
      name: "Quick Replies",
      category: "input",
      icon: "⚡",
      description: "Up to 2 quick reply options",
      platforms: ["instagram"],
      defaultData: {
        text: "Choose:",
        options: [{ label: "Yes", value: "yes" }],
      },
    },
  ]
}
