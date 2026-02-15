import type { Platform } from "@/types"

// Platform-specific button limits
export const BUTTON_LIMITS: Record<Platform, number> = {
  web: 10,
  whatsapp: 3,
  instagram: 3,
} as const

// Platform-specific option limits
export const OPTION_LIMITS = {
  all: 10,
} as const

// Platform-specific character limits
export const CHARACTER_LIMITS: Record<Platform, { question: number; button: number; comment: number }> = {
  web: { question: 500, button: 20, comment: 200 },
  whatsapp: { question: 250, button: 28, comment: 200 },
  instagram: { question: 250, button: 28, comment: 100 },
} as const

// UI interaction thresholds
export const INTERACTION_THRESHOLDS = {
  doubleClick: {
    time: 300, // milliseconds
    distance: 5, // pixels
  },
} as const
