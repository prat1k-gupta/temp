import type { Platform } from "@/types"

// Platform-specific button limits
export const BUTTON_LIMITS: Record<Platform, number> = {
  web: 3,
  whatsapp: 10,
  instagram: 10,
} as const

// Platform-specific option limits
export const OPTION_LIMITS = {
  all: 10,
} as const

// Platform-specific character limits
export const CHARACTER_LIMITS: Record<Platform, { question: number; button: number }> = {
  web: { question: 500, button: 20 },
  whatsapp: { question: 160, button: 20 },
  instagram: { question: 100, button: 15 },
} as const

// UI interaction thresholds
export const INTERACTION_THRESHOLDS = {
  doubleClick: {
    time: 300, // milliseconds
    distance: 5, // pixels
  },
} as const
