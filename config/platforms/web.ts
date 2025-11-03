import type { Platform } from "@/types"

export const WEB_PLATFORM_CONFIG = {
  platform: "web" as Platform,
  name: "Web",
  limits: {
    question: 500,
    button: 50,
    maxButtons: 3,
    maxOptions: 10,
  },
  styling: {
    primaryColor: "hsl(var(--accent))",
    borderColor: "hsl(var(--border))",
    backgroundColor: "hsl(var(--card))",
  },
  features: {
    supportsRichText: true,
    supportsImages: true,
    supportsButtons: true,
    supportsLists: true,
  },
  nodeTypes: {
    question: "webQuestion",
    quickReply: "webQuickReply",
    list: "whatsappList", // Using whatsappList as base list type
  }
} as const
