import { describe, it, expect } from "vitest"
import { generateVariableName, collectFlowVariables, deduplicateVariable, autoStoreAs, isStorableNodeType } from "../flow-variables"
import { autoPopulateStoreAs } from "../flow-plan-builder"
import type { Node } from "@xyflow/react"

function makeNode(id: string, type: string, data: Record<string, any> = {}): Node {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { platform: "whatsapp", ...data },
  }
}

describe("generateVariableName", () => {
  it("slugifies question for regular nodes", () => {
    const node = makeNode("q1", "whatsappQuestion", { question: "What is your favorite color?" })
    expect(generateVariableName(node)).toBe("what_is_your_favorite_color")
  })

  it("falls back to label if no question", () => {
    const node = makeNode("q1", "whatsappQuestion", { label: "Favorite Color" })
    expect(generateVariableName(node)).toBe("favorite_color")
  })

  it("prefers question over label", () => {
    const node = makeNode("q1", "whatsappQuestion", { question: "What is your age?", label: "Age Question" })
    expect(generateVariableName(node)).toBe("what_is_your_age")
  })

  it("falls back to node type if no question or label", () => {
    const node = makeNode("q1", "whatsappQuestion", {})
    expect(generateVariableName(node)).toBe("whatsappquestion")
  })

  it("truncates to 30 characters", () => {
    const node = makeNode("q1", "whatsappQuestion", {
      question: "This is a very long question that should be truncated to thirty characters",
    })
    const result = generateVariableName(node)
    expect(result.length).toBeLessThanOrEqual(30)
  })

  it("strips special characters", () => {
    const node = makeNode("q1", "whatsappQuestion", { question: "Hello! @World #123" })
    expect(generateVariableName(node)).toBe("hello_world_123")
  })
})

describe("collectFlowVariables", () => {
  it("collects storeAs from storable nodes", () => {
    const nodes = [
      makeNode("1", "whatsappQuestion", { storeAs: "user_color" }),
      makeNode("2", "whatsappQuickReply", { storeAs: "user_choice" }),
      makeNode("3", "whatsappInteractiveList", { storeAs: "user_option" }),
    ]
    const result = collectFlowVariables(nodes)
    expect(result).toEqual(["user_color", "user_choice", "user_option"])
  })

  it("skips nodes without storeAs", () => {
    const nodes = [
      makeNode("1", "whatsappQuestion", { storeAs: "has_value" }),
      makeNode("2", "whatsappQuestion", { storeAs: "" }),
      makeNode("3", "whatsappQuestion", {}),
    ]
    expect(collectFlowVariables(nodes)).toEqual(["has_value"])
  })

  it("skips non-storable node types", () => {
    const nodes = [
      makeNode("1", "whatsappMessage", { storeAs: "should_be_skipped" }),
      makeNode("2", "comment", { storeAs: "also_skipped" }),
      makeNode("3", "condition", { storeAs: "skipped_too" }),
      makeNode("4", "start", { storeAs: "nope" }),
    ]
    expect(collectFlowVariables(nodes)).toEqual([])
  })

  it("returns empty array for no nodes", () => {
    expect(collectFlowVariables([])).toEqual([])
  })
})

describe("deduplicateVariable", () => {
  it("returns name as-is when no conflict", () => {
    expect(deduplicateVariable("user_color", [])).toBe("user_color")
    expect(deduplicateVariable("user_color", ["user_name"])).toBe("user_color")
  })

  it("appends _2 on first conflict", () => {
    expect(deduplicateVariable("user_name", ["user_name"])).toBe("user_name_2")
  })

  it("increments counter for multiple conflicts", () => {
    expect(deduplicateVariable("x", ["x", "x_2", "x_3"])).toBe("x_4")
  })

  it("handles empty name", () => {
    expect(deduplicateVariable("", [""])).toBe("_2")
  })
})

describe("isStorableNodeType", () => {
  it("returns true for storable types", () => {
    expect(isStorableNodeType("whatsappQuestion")).toBe(true)
    expect(isStorableNodeType("question")).toBe(true)
    expect(isStorableNodeType("whatsappQuickReply")).toBe(true)
    expect(isStorableNodeType("whatsappInteractiveList")).toBe(true)
  })

  it("returns false for non-storable types", () => {
    expect(isStorableNodeType("whatsappMessage")).toBe(false)
    expect(isStorableNodeType("comment")).toBe(false)
    expect(isStorableNodeType("condition")).toBe(false)
    expect(isStorableNodeType("start")).toBe(false)
    expect(isStorableNodeType("shopify")).toBe(false)
  })
})

describe("autoStoreAs", () => {
  it("generates storeAs from question for storable nodes", () => {
    const node = makeNode("q1", "whatsappQuestion", { question: "What is your favorite color?" })
    expect(autoStoreAs(node)).toBe("what_is_your_favorite_color")
  })

  it("returns existing storeAs if already set", () => {
    const node = makeNode("q1", "whatsappQuestion", { question: "What color?", storeAs: "custom_var" })
    expect(autoStoreAs(node)).toBe("custom_var")
  })

  it("returns empty string for non-storable types", () => {
    const node = makeNode("m1", "whatsappMessage", { label: "Thanks", text: "Thank you" })
    expect(autoStoreAs(node)).toBe("")
  })

  it("deduplicates against existing variables", () => {
    const node = makeNode("q1", "whatsappQuestion", { question: "What is your name?" })
    expect(autoStoreAs(node, ["what_is_your_name"])).toBe("what_is_your_name_2")
    expect(autoStoreAs(node, ["what_is_your_name", "what_is_your_name_2"])).toBe("what_is_your_name_3")
  })

})

describe("autoPopulateStoreAs", () => {
  it("populates storeAs on storable nodes that are missing it", () => {
    const nodes = [
      makeNode("s1", "start"),
      makeNode("q1", "whatsappQuestion", { label: "Favorite Color", question: "What is your favorite color?" }),
      makeNode("qr1", "whatsappQuickReply", { label: "Pick Size", question: "What size do you want?" }),
      makeNode("m1", "whatsappMessage", { text: "Thanks!" }),
    ]

    autoPopulateStoreAs(nodes)

    expect((nodes[1].data as any).storeAs).toBe("what_is_your_favorite_color")
    expect((nodes[2].data as any).storeAs).toBe("what_size_do_you_want")
    // Message node should not get storeAs
    expect((nodes[3].data as any).storeAs).toBeUndefined()
  })

  it("does not overwrite existing storeAs values", () => {
    const nodes = [
      makeNode("q1", "whatsappQuestion", { label: "Name", storeAs: "custom_name" }),
    ]

    autoPopulateStoreAs(nodes)
    expect((nodes[0].data as any).storeAs).toBe("custom_name")
  })

  it("deduplicates across multiple nodes with same question", () => {
    const nodes = [
      makeNode("q1", "whatsappQuestion", { question: "How old are you?" }),
      makeNode("q2", "whatsappQuestion", { question: "How old are you?" }),
      makeNode("q3", "whatsappQuestion", { question: "How old are you?" }),
    ]

    autoPopulateStoreAs(nodes)

    const vars = nodes.map((n) => (n.data as any).storeAs)
    expect(vars[0]).toBe("how_old_are_you")
    expect(vars[1]).toBe("how_old_are_you_2")
    expect(vars[2]).toBe("how_old_are_you_3")
    // All unique
    expect(new Set(vars).size).toBe(3)
  })
})
