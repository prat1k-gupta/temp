import { describe, it, expect } from "vitest"
import {
  createChoiceData,
  generateNodeId,
  createBaseNodeData,
  canAddMoreButtons,
  getMaxButtons,
  getNextNodeType,
  supportsButtons,
  supportsOptions,
} from "../node-operations"

describe("generateNodeId", () => {
  it("generates ID with default prefix", () => {
    const id = generateNodeId()
    expect(id).toMatch(/^node-\d+-\w+$/)
  })

  it("generates ID with custom prefix", () => {
    const id = generateNodeId("question")
    expect(id).toMatch(/^question-\d+-\w+$/)
  })

  it("generates unique IDs", () => {
    const id1 = generateNodeId()
    const id2 = generateNodeId()
    expect(id1).not.toBe(id2)
  })
})

describe("createBaseNodeData", () => {
  it("creates base node data for web platform", () => {
    const data = createBaseNodeData("web", "question")
    expect(data.platform).toBe("web")
    expect(data.label).toBeDefined()
    expect(data.id).toBeDefined()
  })

  it("creates base node data for whatsapp platform", () => {
    const data = createBaseNodeData("whatsapp", "question")
    expect(data.platform).toBe("whatsapp")
  })
})

describe("canAddMoreButtons", () => {
  it("returns true when under limit for whatsapp (3)", () => {
    expect(canAddMoreButtons([{ text: "a" }], "whatsapp")).toBe(true)
    expect(canAddMoreButtons([{ text: "a" }, { text: "b" }], "whatsapp")).toBe(true)
  })

  it("returns false when at limit for whatsapp (3)", () => {
    expect(canAddMoreButtons([{ text: "a" }, { text: "b" }, { text: "c" }], "whatsapp")).toBe(false)
  })

  it("allows more buttons for web (10)", () => {
    const buttons = Array(9).fill({ text: "btn" })
    expect(canAddMoreButtons(buttons, "web")).toBe(true)
  })

  it("returns false at web limit (10)", () => {
    const buttons = Array(10).fill({ text: "btn" })
    expect(canAddMoreButtons(buttons, "web")).toBe(false)
  })
})

describe("getMaxButtons", () => {
  it("returns correct limits per platform", () => {
    expect(getMaxButtons("web")).toBe(10)
    expect(getMaxButtons("whatsapp")).toBe(3)
    expect(getMaxButtons("instagram")).toBe(3)
  })
})

describe("getNextNodeType", () => {
  it("converts question to quickReply", () => {
    const result = getNextNodeType("whatsappQuestion", "whatsapp")
    expect(result).toBe("whatsappQuickReply")
  })

  it("converts quickReply to interactiveList", () => {
    const result = getNextNodeType("whatsappQuickReply", "whatsapp")
    expect(result).toBe("whatsappInteractiveList")
  })

  it("returns same type for non-convertible types", () => {
    const result = getNextNodeType("comment", "web")
    expect(result).toBe("comment")
  })
})

describe("supportsButtons", () => {
  it("returns true for quickReply types", () => {
    expect(supportsButtons("quickReply")).toBe(true)
    expect(supportsButtons("whatsappQuickReply")).toBe(true)
    expect(supportsButtons("instagramQuickReply")).toBe(true)
  })

  it("returns true for question types", () => {
    expect(supportsButtons("question")).toBe(true)
    expect(supportsButtons("whatsappQuestion")).toBe(true)
  })

  it("returns false for list types", () => {
    expect(supportsButtons("interactiveList")).toBe(false)
  })

  it("returns false for other types", () => {
    expect(supportsButtons("comment")).toBe(false)
    expect(supportsButtons("start")).toBe(false)
  })
})

describe("supportsOptions", () => {
  it("returns true for list types", () => {
    expect(supportsOptions("interactiveList")).toBe(true)
    expect(supportsOptions("whatsappInteractiveList")).toBe(true)
  })

  it("returns false for non-list types", () => {
    expect(supportsOptions("question")).toBe(false)
    expect(supportsOptions("quickReply")).toBe(false)
    expect(supportsOptions("comment")).toBe(false)
  })
})

describe("createChoiceData", () => {
  it("uses provided text", () => {
    const choice = createChoiceData("Yes")
    expect(choice.text).toBe("Yes")
  })

  it("falls back to indexed default when text is empty", () => {
    expect(createChoiceData("", 0).text).toBe("Option 1")
    expect(createChoiceData("", 2).text).toBe("Option 3")
  })

  it("generates an id with the choice- prefix", () => {
    const choice = createChoiceData("A")
    expect(choice.id).toMatch(/^choice-\d+-[a-z0-9]+$/)
  })

  it("generates unique ids across calls", () => {
    const a = createChoiceData("A")
    const b = createChoiceData("B")
    expect(a.id).not.toBe(b.id)
  })
})
