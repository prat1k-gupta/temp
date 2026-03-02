import { describe, it, expect } from "vitest"
import {
  BUTTON_LIMITS,
  OPTION_LIMITS,
  CHARACTER_LIMITS,
  INTERACTION_THRESHOLDS,
} from "../platform-limits"

describe("BUTTON_LIMITS", () => {
  it("web allows 10 buttons", () => {
    expect(BUTTON_LIMITS.web).toBe(10)
  })

  it("whatsapp allows 3 buttons", () => {
    expect(BUTTON_LIMITS.whatsapp).toBe(3)
  })

  it("instagram allows 3 buttons", () => {
    expect(BUTTON_LIMITS.instagram).toBe(3)
  })

  it("has entries for all platforms", () => {
    expect(BUTTON_LIMITS.web).toBeDefined()
    expect(BUTTON_LIMITS.whatsapp).toBeDefined()
    expect(BUTTON_LIMITS.instagram).toBeDefined()
  })
})

describe("OPTION_LIMITS", () => {
  it("all platforms allow 10 options", () => {
    expect(OPTION_LIMITS.all).toBe(10)
  })
})

describe("CHARACTER_LIMITS", () => {
  it("has question, button, and comment limits for each platform", () => {
    const platforms = ["web", "whatsapp", "instagram"] as const
    platforms.forEach((p) => {
      expect(CHARACTER_LIMITS[p].question).toBeGreaterThan(0)
      expect(CHARACTER_LIMITS[p].button).toBeGreaterThan(0)
      expect(CHARACTER_LIMITS[p].comment).toBeGreaterThan(0)
    })
  })

  it("web has highest question limit", () => {
    expect(CHARACTER_LIMITS.web.question).toBeGreaterThanOrEqual(CHARACTER_LIMITS.whatsapp.question)
    expect(CHARACTER_LIMITS.web.question).toBeGreaterThanOrEqual(CHARACTER_LIMITS.instagram.question)
  })
})

describe("INTERACTION_THRESHOLDS", () => {
  it("has doubleClick thresholds", () => {
    expect(INTERACTION_THRESHOLDS.doubleClick.time).toBeGreaterThan(0)
    expect(INTERACTION_THRESHOLDS.doubleClick.distance).toBeGreaterThan(0)
  })
})
