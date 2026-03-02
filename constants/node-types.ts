import type { Platform } from "@/types"

// Node type mappings for different platforms
export const NODE_TYPE_MAPPINGS: Record<string, Record<Platform, string>> = {
  question: {
    web: "webQuestion",
    whatsapp: "whatsappQuestion",
    instagram: "instagramQuestion"
  },
  quickReply: {
    web: "webQuickReply",
    whatsapp: "whatsappQuickReply",
    instagram: "instagramQuickReply"
  },
  interactiveList: {
    web: "interactiveList",
    whatsapp: "whatsappInteractiveList",
    instagram: "interactiveList"
  }
} as const

// Default node labels for different platforms
export const NODE_LABELS: Record<string, Record<Platform, string>> = {
  question: {
    web: "Question",
    whatsapp: "WhatsApp Question",
    instagram: "Instagram Question"
  },
  quickReply: {
    web: "Quick Reply",
    whatsapp: "WhatsApp Quick Reply",
    instagram: "Instagram Quick Reply"
  },
  interactiveList: {
    web: "Interactive List",
    whatsapp: "WhatsApp List",
    instagram: "Interactive List"
  }
} as const

// Default node content for different platforms
export const NODE_CONTENT: Record<string, Record<Platform, string>> = {
  question: {
    web: "What would you like to know?",
    whatsapp: "What would you like to know?",
    instagram: "What would you like to know?"
  },
  quickReply: {
    web: "What would you like to do?",
    whatsapp: "What would you like to do?",
    instagram: "What would you like to do?"
  },
  interactiveList: {
    web: "Select from the list:",
    whatsapp: "Select from the list:",
    instagram: "Select from the list:"
  }
} as const
