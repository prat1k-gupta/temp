import { describe, it, expect } from "vitest"
import { isTriggerConfigInvalid, getSaveData, type TriggerConfigState } from "../trigger-config-panel"

describe("isTriggerConfigInvalid", () => {
  it("returns false when no triggers selected", () => {
    const state: TriggerConfigState = { selectedTriggers: [], triggerKeywords: [], triggerMatchType: "contains_whole_word", triggerRef: "" }
    expect(isTriggerConfigInvalid(state)).toBe(false)
  })

  it("returns true when message trigger selected but no keywords", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-message"], triggerKeywords: [], triggerMatchType: "contains_whole_word", triggerRef: "" }
    expect(isTriggerConfigInvalid(state)).toBe(true)
  })

  it("returns false when message trigger selected with keywords", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-message"], triggerKeywords: ["hello"], triggerMatchType: "contains_whole_word", triggerRef: "" }
    expect(isTriggerConfigInvalid(state)).toBe(false)
  })

  it("returns true when url trigger selected but no ref", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-url"], triggerKeywords: [], triggerMatchType: "contains_whole_word", triggerRef: "" }
    expect(isTriggerConfigInvalid(state)).toBe(true)
  })

  it("returns false when url trigger selected with ref", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-url"], triggerKeywords: [], triggerMatchType: "contains_whole_word", triggerRef: "claim free sample" }
    expect(isTriggerConfigInvalid(state)).toBe(false)
  })

  it("returns true when both triggers selected but keywords missing", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-message", "whatsapp-url"], triggerKeywords: [], triggerMatchType: "exact", triggerRef: "promo" }
    expect(isTriggerConfigInvalid(state)).toBe(true)
  })

  it("returns true when both triggers selected but ref missing", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-message", "whatsapp-url"], triggerKeywords: ["hi"], triggerMatchType: "exact", triggerRef: "" }
    expect(isTriggerConfigInvalid(state)).toBe(true)
  })

  it("returns false when both triggers selected with both filled", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-message", "whatsapp-url"], triggerKeywords: ["hi"], triggerMatchType: "exact", triggerRef: "promo" }
    expect(isTriggerConfigInvalid(state)).toBe(false)
  })

  it("returns true when ref has a conflict", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-url"], triggerKeywords: [], triggerMatchType: "contains_whole_word", triggerRef: "promo" }
    expect(isTriggerConfigInvalid(state, "Other Flow")).toBe(true)
  })

  it("handles instagram-message trigger same as whatsapp-message", () => {
    const state: TriggerConfigState = { selectedTriggers: ["instagram-message"], triggerKeywords: [], triggerMatchType: "contains_whole_word", triggerRef: "" }
    expect(isTriggerConfigInvalid(state)).toBe(true)
  })

  it("returns true when ref is only whitespace", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-url"], triggerKeywords: [], triggerMatchType: "contains_whole_word", triggerRef: "   " }
    expect(isTriggerConfigInvalid(state)).toBe(true)
  })
})

describe("getSaveData", () => {
  it("clears keywords and match type when message trigger not selected", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-url"], triggerKeywords: ["leftover"], triggerMatchType: "exact", triggerRef: "promo" }
    const result = getSaveData(state)
    expect(result.triggerKeywords).toEqual([])
    expect(result.triggerMatchType).toBe("contains_whole_word")
    expect(result.triggerRef).toBe("promo")
  })

  it("clears ref when url trigger not selected", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-message"], triggerKeywords: ["hi"], triggerMatchType: "exact", triggerRef: "leftover" }
    const result = getSaveData(state)
    expect(result.triggerKeywords).toEqual(["hi"])
    expect(result.triggerMatchType).toBe("exact")
    expect(result.triggerRef).toBe("")
  })

  it("preserves all data when both triggers selected", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-message", "whatsapp-url"], triggerKeywords: ["hi"], triggerMatchType: "starts_with", triggerRef: "promo" }
    const result = getSaveData(state)
    expect(result.triggerKeywords).toEqual(["hi"])
    expect(result.triggerMatchType).toBe("starts_with")
    expect(result.triggerRef).toBe("promo")
  })

  it("clears all trigger data when no triggers selected", () => {
    const state: TriggerConfigState = { selectedTriggers: [], triggerKeywords: ["orphan"], triggerMatchType: "exact", triggerRef: "orphan" }
    const result = getSaveData(state)
    expect(result.triggerKeywords).toEqual([])
    expect(result.triggerMatchType).toBe("contains_whole_word")
    expect(result.triggerRef).toBe("")
  })

  it("trims ref whitespace", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-url"], triggerKeywords: [], triggerMatchType: "contains_whole_word", triggerRef: "  claim free sample  " }
    const result = getSaveData(state)
    expect(result.triggerRef).toBe("claim free sample")
  })

  it("preserves selectedTriggers as-is", () => {
    const state: TriggerConfigState = { selectedTriggers: ["whatsapp-message", "whatsapp-url"], triggerKeywords: ["hi"], triggerMatchType: "exact", triggerRef: "promo" }
    const result = getSaveData(state)
    expect(result.selectedTriggers).toEqual(["whatsapp-message", "whatsapp-url"])
  })
})
