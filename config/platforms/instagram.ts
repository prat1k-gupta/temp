import type { Platform } from "@/types"

export const INSTAGRAM_PLATFORM_CONFIG = {
  platform: "instagram" as Platform,
  name: "Instagram",
  limits: {
    question: 100,
    button: 15,
    maxButtons: 10,
    maxOptions: 10,
  },
  styling: {
    primaryColor: "#E4405F",
    borderColor: "#E4405F",
    backgroundColor: "#fdf2f8",
    gradient: "linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)",
    accentColors: {
      light: "#fce7f3",
      medium: "#f9a8d4",
      dark: "#be185d",
    }
  },
  features: {
    supportsRichText: false,
    supportsImages: true,
    supportsButtons: true,
    supportsLists: true,
    supportsStories: true,
    supportsDMs: true,
  },
  nodeTypes: {
    question: "instagramQuestion",
    quickReply: "instagramQuickReply",
    list: "instagramList",
    dm: "instagramDM",
    story: "instagramStory",
  },
  branding: {
    icon: "instagram",
    badge: "IG",
    displayName: "Instagram",
  }
} as const
