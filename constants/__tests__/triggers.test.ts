import { describe, it, expect } from "vitest"
import {
  PLATFORM_TRIGGERS,
  getTriggersByPlatform,
  getTriggerById,
  type Trigger,
} from "../triggers"

describe("PLATFORM_TRIGGERS", () => {
  it("has triggers for all platforms", () => {
    expect(PLATFORM_TRIGGERS.web).toBeDefined()
    expect(PLATFORM_TRIGGERS.whatsapp).toBeDefined()
    expect(PLATFORM_TRIGGERS.instagram).toBeDefined()
  })

  it("web has at least 2 triggers", () => {
    expect(PLATFORM_TRIGGERS.web.length).toBeGreaterThanOrEqual(2)
  })

  it("whatsapp has at least 3 triggers", () => {
    expect(PLATFORM_TRIGGERS.whatsapp.length).toBeGreaterThanOrEqual(3)
  })

  it("instagram has at least 5 triggers", () => {
    expect(PLATFORM_TRIGGERS.instagram.length).toBeGreaterThanOrEqual(5)
  })

  it("every trigger has required fields", () => {
    Object.values(PLATFORM_TRIGGERS).forEach((triggers) => {
      triggers.forEach((trigger) => {
        expect(trigger.id).toBeDefined()
        expect(trigger.platform).toBeDefined()
        expect(trigger.category).toBeDefined()
        expect(trigger.title).toBeDefined()
        expect(trigger.description).toBeDefined()
      })
    })
  })

  it("trigger ids are unique across all platforms", () => {
    const allIds: string[] = []
    Object.values(PLATFORM_TRIGGERS).forEach((triggers) => {
      triggers.forEach((t) => allIds.push(t.id))
    })
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})

describe("getTriggersByPlatform", () => {
  it("returns web triggers for web", () => {
    const triggers = getTriggersByPlatform("web")
    expect(triggers.length).toBeGreaterThan(0)
    triggers.forEach((t) => expect(t.platform).toBe("web"))
  })

  it("returns whatsapp triggers for whatsapp", () => {
    const triggers = getTriggersByPlatform("whatsapp")
    expect(triggers.length).toBeGreaterThan(0)
    triggers.forEach((t) => expect(t.platform).toBe("whatsapp"))
  })
})

describe("getTriggerById", () => {
  it("finds existing trigger by ID", () => {
    const trigger = getTriggerById("web-embedded")
    expect(trigger).toBeDefined()
    expect(trigger!.title).toBe("Embedded")
  })

  it("returns undefined for non-existent trigger", () => {
    expect(getTriggerById("nonexistent")).toBeUndefined()
  })
})
