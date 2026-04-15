import { describe, it, expect } from "vitest"
import { normalizeAiNodeType, processAiEdges, transformAiNodeData } from "../ai-data-transform"

describe("normalizeAiNodeType", () => {
  it("returns base type for platform-specific question types", () => {
    expect(normalizeAiNodeType("whatsappQuestion", "whatsapp")).toBe("question")
    expect(normalizeAiNodeType("instagramQuestion", "instagram")).toBe("question")
    expect(normalizeAiNodeType("webQuestion", "web")).toBe("question")
  })

  it("returns base type for platform-specific quickReply types", () => {
    expect(normalizeAiNodeType("whatsappQuickReply", "whatsapp")).toBe("quickReply")
    expect(normalizeAiNodeType("instagramQuickReply", "instagram")).toBe("quickReply")
  })

  it("returns interactiveList for list variants", () => {
    expect(normalizeAiNodeType("list", "whatsapp")).toBe("interactiveList")
    expect(normalizeAiNodeType("interactiveList", "whatsapp")).toBe("interactiveList")
    expect(normalizeAiNodeType("whatsappInteractiveList", "whatsapp")).toBe("interactiveList")
  })

  it("passes through base types unchanged", () => {
    expect(normalizeAiNodeType("question", "whatsapp")).toBe("question")
    expect(normalizeAiNodeType("quickReply", "web")).toBe("quickReply")
    expect(normalizeAiNodeType("name", "web")).toBe("name")
    expect(normalizeAiNodeType("shopify", "web")).toBe("shopify")
  })

  it("does NOT return platform-specific types (Bug 1 fix)", () => {
    // Before the fix, normalizeAiNodeType("question", "whatsapp") returned "whatsappQuestion"
    // which caused createNode() to throw. Now it always returns base types.
    expect(normalizeAiNodeType("question", "whatsapp")).toBe("question")
    expect(normalizeAiNodeType("quickReply", "instagram")).toBe("quickReply")
  })
})

describe("processAiEdges", () => {
  it("filters out self-loop edges", () => {
    const nodeIds = new Set(["A", "B"])
    const edges = processAiEdges(
      [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "A", target: "A" }, // self-loop
      ],
      nodeIds
    )
    expect(edges).toHaveLength(1)
    expect(edges[0].id).toBe("e1")
  })

  it("filters out edges with missing source or target", () => {
    const nodeIds = new Set(["A", "B"])
    const edges = processAiEdges(
      [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "A", target: "C" }, // C not in nodeIds
        { id: "e3", source: "D", target: "B" }, // D not in nodeIds
      ],
      nodeIds
    )
    expect(edges).toHaveLength(1)
  })

  it("filters out edges with no source or target", () => {
    const nodeIds = new Set(["A", "B"])
    const edges = processAiEdges(
      [
        { id: "e1", source: "A" },
        { id: "e2", target: "B" },
      ],
      nodeIds
    )
    expect(edges).toHaveLength(0)
  })
})

describe("transformAiNodeData", () => {
  it("normalizes legacy options input to data.choices for quickReply", () => {
    const result = transformAiNodeData({ options: ["Yes", "No"] }, "quickReply")
    expect(result.choices).toHaveLength(2)
    // Choice IDs should have stable prefixes from createChoiceData
    expect(result.choices[0].id).toMatch(/^choice-/)
    expect(result.choices[0].text).toBe("Yes")
    expect(result.choices[1].text).toBe("No")
    // Legacy fields should be stripped
    expect(result.buttons).toBeUndefined()
    expect(result.options).toBeUndefined()
  })

  it("normalizes legacy string buttons input to data.choices for quickReply", () => {
    const result = transformAiNodeData({ buttons: ["A", "B", "C"] }, "quickReply")
    expect(result.choices).toHaveLength(3)
    expect(result.choices[0].text).toBe("A")
    // Each choice should have a unique ID
    const ids = new Set(result.choices.map((c: any) => c.id))
    expect(ids.size).toBe(3)
    expect(result.buttons).toBeUndefined()
    expect(result.options).toBeUndefined()
  })
})
