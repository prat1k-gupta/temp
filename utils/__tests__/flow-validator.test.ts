import { describe, it, expect } from "vitest"
import { validateGeneratedFlow } from "../flow-validator"
import type { Node, Edge } from "@xyflow/react"

function makeNode(
  id: string,
  type: string,
  data: Record<string, any> = {},
  position = { x: 0, y: 0 }
): Node {
  return {
    id,
    type,
    position,
    data: { platform: "whatsapp", label: type, ...data },
  }
}

function makeEdge(source: string, target: string, sourceHandle?: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
  }
}

describe("validateGeneratedFlow", () => {
  it("returns no issues for a valid linear flow", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", {
        question: "What is your name?",
        storeAs: "name",
      }),
      makeNode("q2", "whatsappQuestion", {
        question: "Hello {{name}}, what is your email?",
        storeAs: "email",
      }),
    ]
    const edges = [makeEdge("1", "q1"), makeEdge("q1", "q2")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues).toHaveLength(0)
    expect(result.isValid).toBe(true)
  })

  it("detects orphaned nodes with no incoming edges", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "Name?" }),
      makeNode("q2", "whatsappQuestion", { question: "Email?" }),
    ]
    const edges = [makeEdge("1", "q1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(
      result.issues.some((i) => i.type === "orphaned_node" && i.nodeId === "q2")
    ).toBe(true)
  })

  it("detects undefined variable references", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", {
        question: "Hello {{customer_name}}",
        storeAs: "name",
      }),
    ]
    const edges = [makeEdge("1", "q1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues.some((i) => i.type === "undefined_variable")).toBe(true)
  })

  it("detects button count exceeding platform limit", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("qr1", "whatsappQuickReply", {
        question: "Pick one",
        buttons: [
          { id: "b0", text: "A" },
          { id: "b1", text: "B" },
          { id: "b2", text: "C" },
          { id: "b3", text: "D" },
          { id: "b4", text: "E" },
        ],
      }),
    ]
    const edges = [makeEdge("1", "qr1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(
      result.issues.some((i) => i.type === "button_limit_exceeded")
    ).toBe(true)
  })

  it("detects empty message content", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "", storeAs: "name" }),
    ]
    const edges = [makeEdge("1", "q1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues.some((i) => i.type === "empty_content")).toBe(true)
  })

  it("detects apiFetch with unconnected success/error handles", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("api1", "apiFetch", {
        url: "https://example.com",
        label: "Fetch CRM",
      }),
    ]
    const edges = [makeEdge("1", "api1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(
      result.issues.some(
        (i) => i.type === "unconnected_handle" && i.nodeId === "api1"
      )
    ).toBe(true)
  })

  it("formats issues into AI-readable summary", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "" }),
    ]
    const edges = [makeEdge("1", "q1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.summary).toContain("empty_content")
    expect(typeof result.summary).toBe("string")
  })

  it("does not flag start node as orphaned", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "Name?", storeAs: "name" }),
    ]
    const edges = [makeEdge("1", "q1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(
      result.issues.some((i) => i.type === "orphaned_node" && i.nodeId === "1")
    ).toBe(false)
  })

  it("does not flag flowComplete as needing content", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "Name?", storeAs: "name" }),
      makeNode("end", "flowComplete"),
    ]
    const edges = [makeEdge("1", "q1"), makeEdge("q1", "end")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(
      result.issues.some((i) => i.type === "empty_content" && i.nodeId === "end")
    ).toBe(false)
  })

  it("does not flag apiFetch as empty content", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("api1", "apiFetch", {
        url: "https://example.com",
        label: "Fetch data",
      }),
    ]
    const edges = [
      makeEdge("1", "api1"),
      makeEdge("api1", "q1", "success"),
      makeEdge("api1", "q2", "error"),
    ]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(
      result.issues.some(
        (i) => i.type === "empty_content" && i.nodeId === "api1"
      )
    ).toBe(false)
  })

  it("accepts buttons within the platform limit", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("qr1", "whatsappQuickReply", {
        question: "Pick one",
        buttons: [
          { id: "b0", text: "A" },
          { id: "b1", text: "B" },
          { id: "b2", text: "C" },
        ],
        storeAs: "choice",
      }),
    ]
    const edges = [makeEdge("1", "qr1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(
      result.issues.some((i) => i.type === "button_limit_exceeded")
    ).toBe(false)
  })

  it("apiFetch with both handles connected passes", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("api1", "apiFetch", {
        url: "https://example.com",
        label: "Fetch",
      }),
      makeNode("q1", "whatsappQuestion", { question: "Success!", storeAs: "s" }),
      makeNode("q2", "whatsappQuestion", { question: "Error!", storeAs: "e" }),
    ]
    const edges = [
      makeEdge("1", "api1"),
      makeEdge("api1", "q1", "success"),
      makeEdge("api1", "q2", "error"),
    ]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(
      result.issues.some(
        (i) => i.type === "unconnected_handle" && i.nodeId === "api1"
      )
    ).toBe(false)
  })

  it("detects converter producing 0 steps from non-empty flow", () => {
    // All nodes disconnected from start — converter DFS won't reach them
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "Name?", storeAs: "name" }),
      makeNode("q2", "whatsappQuestion", { question: "Email?", storeAs: "email" }),
    ]
    const edges = [makeEdge("q1", "q2")] // No edge from start to q1
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues.some((i) => i.type === "converter_error")).toBe(true)
  })

  it("detects interactiveList exceeding option limit", () => {
    const options = Array.from({ length: 12 }, (_, i) => ({ id: `opt-${i}`, text: `Option ${i}` }))
    const nodes = [
      makeNode("1", "start"),
      makeNode("list1", "interactiveList", { question: "Pick one", options, listTitle: "Options" }),
    ]
    const edges = [makeEdge("1", "list1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues.some(i => i.type === "button_limit_exceeded" && i.nodeId === "list1")).toBe(true)
  })

  it("detects empty flowTemplate with no internalNodes", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("ft1", "flowTemplate", { label: "Address", templateName: "Address" }),
    ]
    const edges = [makeEdge("1", "ft1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues.some(i => i.type === "empty_content" && i.nodeId === "ft1")).toBe(true)
    expect(result.issues.some(i => i.detail.includes("Use a specific type instead"))).toBe(true)
  })

  it("accepts flowTemplate with internalNodes", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("ft1", "flowTemplate", {
        label: "Name",
        templateName: "Name",
        internalNodes: [{ id: "inner-1", type: "question", data: { question: "Name?" } }],
      }),
    ]
    const edges = [makeEdge("1", "ft1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues.some(i => i.nodeId === "ft1" && i.type === "empty_content")).toBe(false)
  })

  it("returns empty summary when valid", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "Name?", storeAs: "name" }),
    ]
    const edges = [makeEdge("1", "q1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.summary).toBe("")
  })
})
