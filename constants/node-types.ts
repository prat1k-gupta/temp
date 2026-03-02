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
    whatsapp: "WhatsApp Message",
    instagram: "Instagram Message"
  },
  quickReply: {
    web: "Quick Reply",
    whatsapp: "WhatsApp Actions",
    instagram: "Instagram Actions"
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
    whatsapp: "Send a WhatsApp message",
    instagram: "Send an Instagram message"
  },
  quickReply: {
    web: "Choose an action:",
    whatsapp: "Choose an action:",
    instagram: "Choose an action:"
  },
  interactiveList: {
    web: "Select from the list:",
    whatsapp: "Select from the list:",
    instagram: "Select from the list:"
  }
} as const
