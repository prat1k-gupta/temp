import { describe, it, expect } from "vitest"
import {
  nodeSupportsButtons,
  nodeSupportsOptions,
  nodeSupportsMultipleOutputs,
  getMaxConnections,
  getTextFieldLimit,
  isTextWithinNodeLimits,
  areButtonsWithinNodeLimits,
  areOptionsWithinNodeLimits,
  isButtonTextValid,
  isOptionTextValid,
  isOptionDescriptionValid,
} from "../helpers"

describe("nodeSupportsButtons", () => {
  it("returns true for quickReply types", () => {
    expect(nodeSupportsButtons("quickReply")).toBe(true)
    expect(nodeSupportsButtons("whatsappQuickReply")).toBe(true)
    expect(nodeSupportsButtons("instagramQuickReply")).toBe(true)
  })

  it("returns false for question types", () => {
    expect(nodeSupportsButtons("question")).toBe(false)
  })

  it("returns false for list types", () => {
    expect(nodeSupportsButtons("interactiveList")).toBe(false)
  })

  it("returns false for other types", () => {
    expect(nodeSupportsButtons("comment")).toBe(false)
    expect(nodeSupportsButtons("start")).toBe(false)
    expect(nodeSupportsButtons("shopify")).toBe(false)
  })
})

describe("nodeSupportsOptions", () => {
  it("returns true for list types", () => {
    expect(nodeSupportsOptions("interactiveList")).toBe(true)
    expect(nodeSupportsOptions("whatsappInteractiveList")).toBe(true)
  })

  it("returns false for non-list types", () => {
    expect(nodeSupportsOptions("quickReply")).toBe(false)
    expect(nodeSupportsOptions("question")).toBe(false)
    expect(nodeSupportsOptions("comment")).toBe(false)
  })
})

describe("nodeSupportsMultipleOutputs", () => {
  it("returns true for quickReply", () => {
    expect(nodeSupportsMultipleOutputs("quickReply", "web")).toBe(true)
  })

  it("returns true for list", () => {
    expect(nodeSupportsMultipleOutputs("interactiveList", "whatsapp")).toBe(true)
  })

  it("returns false for question", () => {
    expect(nodeSupportsMultipleOutputs("question", "web")).toBe(false)
  })

  it("returns false for comment", () => {
    expect(nodeSupportsMultipleOutputs("comment", "web")).toBe(false)
  })
})

describe("getMaxConnections", () => {
  it("returns 1 for question nodes", () => {
    expect(getMaxConnections("question", "web")).toBe(1)
  })

  it("returns button limit for quickReply nodes", () => {
    expect(getMaxConnections("quickReply", "whatsapp")).toBe(3)
    expect(getMaxConnections("quickReply", "web")).toBe(10)
  })

  it("returns 10 for list nodes", () => {
    expect(getMaxConnections("interactiveList", "whatsapp")).toBe(10)
  })

  it("returns 0 for comment nodes", () => {
    expect(getMaxConnections("comment", "web")).toBe(0)
  })
})

describe("getTextFieldLimit", () => {
  it("returns question field limits for question nodes", () => {
    const limits = getTextFieldLimit("question", "web", "question")
    expect(limits.max).toBeGreaterThan(0)
    expect(limits.placeholder).toBeDefined()
  })

  it("returns fallback for non-existent fields", () => {
    const limits = getTextFieldLimit("question", "web", "title")
    expect(limits.max).toBeGreaterThan(0)
  })
})

describe("isTextWithinNodeLimits", () => {
  it("returns valid for text within limits", () => {
    const result = isTextWithinNodeLimits("hello", "question", "web", "question")
    expect(result.valid).toBe(true)
    expect(result.current).toBe(5)
  })

  it("returns invalid for text exceeding max", () => {
    const longText = "a".repeat(1000)
    const result = isTextWithinNodeLimits(longText, "question", "instagram", "question")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("Maximum")
  })

  it("returns invalid for text below min", () => {
    const result = isTextWithinNodeLimits("", "question", "web", "question")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("Minimum")
  })
})

describe("areButtonsWithinNodeLimits", () => {
  it("returns valid for button count within limits", () => {
    const result = areButtonsWithinNodeLimits(2, "quickReply", "whatsapp")
    expect(result.valid).toBe(true)
  })

  it("returns invalid when exceeding max buttons", () => {
    const result = areButtonsWithinNodeLimits(5, "quickReply", "whatsapp")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("Maximum")
  })

  it("returns invalid for 0 buttons (below min)", () => {
    const result = areButtonsWithinNodeLimits(0, "quickReply", "whatsapp")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("Minimum")
  })

  it("returns invalid for nodes that don't support buttons", () => {
    const result = areButtonsWithinNodeLimits(1, "question", "web")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("does not support buttons")
  })
})

describe("areOptionsWithinNodeLimits", () => {
  it("returns valid for option count within limits", () => {
    const result = areOptionsWithinNodeLimits(5, "interactiveList", "whatsapp")
    expect(result.valid).toBe(true)
  })

  it("returns invalid when exceeding max options", () => {
    const result = areOptionsWithinNodeLimits(11, "interactiveList", "whatsapp")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("Maximum")
  })

  it("returns invalid for nodes that don't support options", () => {
    const result = areOptionsWithinNodeLimits(1, "question", "web")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("does not support options")
  })
})

describe("isButtonTextValid", () => {
  it("returns valid for short button text", () => {
    const result = isButtonTextValid("OK", "quickReply", "whatsapp")
    expect(result.valid).toBe(true)
  })

  it("returns invalid for long button text", () => {
    const result = isButtonTextValid("a".repeat(100), "quickReply", "whatsapp")
    expect(result.valid).toBe(false)
  })

  it("returns invalid for nodes without button support", () => {
    const result = isButtonTextValid("OK", "question", "web")
    expect(result.valid).toBe(false)
  })
})

describe("isOptionTextValid", () => {
  it("returns valid for short option text", () => {
    const result = isOptionTextValid("Option A", "interactiveList", "whatsapp")
    expect(result.valid).toBe(true)
  })

  it("returns invalid for long option text", () => {
    const result = isOptionTextValid("a".repeat(100), "interactiveList", "whatsapp")
    expect(result.valid).toBe(false)
  })

  it("returns invalid for nodes without option support", () => {
    const result = isOptionTextValid("OK", "question", "web")
    expect(result.valid).toBe(false)
  })
})

describe("isOptionDescriptionValid", () => {
  it("returns valid for short description", () => {
    const result = isOptionDescriptionValid("Short desc", "interactiveList", "whatsapp")
    expect(result.valid).toBe(true)
  })

  it("returns invalid for long description", () => {
    const result = isOptionDescriptionValid("a".repeat(100), "interactiveList", "whatsapp")
    expect(result.valid).toBe(false)
  })

  it("returns invalid for nodes without option support", () => {
    const result = isOptionDescriptionValid("desc", "question", "web")
    expect(result.valid).toBe(false)
  })
})
