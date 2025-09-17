import type { Platform } from "@/types"

export const WHATSAPP_PLATFORM_CONFIG = {
  platform: "whatsapp" as Platform,
  name: "WhatsApp",
  limits: {
    question: 160,
    button: 20,
    maxButtons: 10,
    maxOptions: 10,
  },
  styling: {
    primaryColor: "#25D366",
    borderColor: "#25D366",
    backgroundColor: "#f0f9ff",
    accentColors: {
      light: "#dcfce7",
      medium: "#bbf7d0",
      dark: "#16a34a",
    }
  },
  features: {
    supportsRichText: false,
    supportsImages: true,
    supportsButtons: true,
    supportsLists: true,
    supportsEmojis: true,
  },
  nodeTypes: {
    question: "whatsappQuestion",
    quickReply: "whatsappQuickReply",
    list: "whatsappListSpecific",
    message: "whatsappMessage",
  },
  branding: {
    icon: "whatsapp",
    badge: "WA",
    displayName: "WhatsApp",
  }
} as const
