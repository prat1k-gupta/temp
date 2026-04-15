import { describe, it, expect } from "vitest"
import type { Node, Edge } from "@xyflow/react"
import { flattenFlow } from "../flow-flattener"

// Helper to build a minimal node
function node(id: string, type: string, x = 0, y = 0, data: any = {}): Node {
  return { id, type, position: { x, y }, data }
}

// Helper to build a minimal edge
function edge(id: string, source: string, target: string, sourceHandle?: string): Edge {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) }
}

// Helper to build a template node with internal nodes/edges
function templateNode(
  id: string,
  internalNodes: Node[],
  internalEdges: Edge[],
  x = 0,
  y = 0
): Node {
  return node(id, "flowTemplate", x, y, {
    internalNodes,
    internalEdges,
    templateName: "Test Template",
    nodeCount: internalNodes.length,
  })
}

describe("flattenFlow", () => {
  it("passes through flows with no templates unchanged", () => {
    const nodes = [node("1", "start"), node("2", "question")]
    const edges = [edge("e1", "1", "2")]

    const result = flattenFlow(nodes, edges)

    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toHaveLength(1)
    expect(result.nodes.map((n) => n.id)).toEqual(["1", "2"])
  })

  it("inlines a template with a single open node (backward compat)", () => {
    // Parent: start → template → question
    // Template internal: q1 → q2 (q2 is the single open node)
    const tpl = templateNode(
      "tpl",
      [node("q1", "question"), node("q2", "question")],
      [edge("e-int", "q1", "q2")]
    )
    const nodes = [node("1", "start"), tpl, node("3", "question")]
    const edges = [edge("e1", "1", "tpl"), edge("e2", "tpl", "3")]

    const result = flattenFlow(nodes, edges)

    // Template replaced by its internal nodes
    expect(result.nodes.map((n) => n.id).sort()).toEqual(
      ["1", "3", "tpl_q1", "tpl_q2"].sort()
    )

    // Edge from start should point to entry (q1)
    const startEdge = result.edges.find((e) => e.source === "1")
    expect(startEdge?.target).toBe("tpl_q1")

    // Edge to next node should come from exit (q2)
    const exitEdge = result.edges.find((e) => e.target === "3")
    expect(exitEdge?.source).toBe("tpl_q2")
  })

  it("routes multiple open nodes to the parent's next step (multi-exit)", () => {
    // Template internal: q1 (open), q2 (open) — no internal edges, both are exits
    const tpl = templateNode(
      "tpl",
      [node("q1", "question"), node("q2", "question")],
      [] // no internal edges
    )
    const nodes = [node("1", "start"), tpl, node("3", "question")]
    const edges = [edge("e1", "1", "tpl"), edge("e2", "tpl", "3")]

    const result = flattenFlow(nodes, edges)

    // Both q1 and q2 should have edges to node 3
    const edgesTo3 = result.edges.filter((e) => e.target === "3")
    expect(edgesTo3).toHaveLength(2)
    const sources = edgesTo3.map((e) => e.source).sort()
    expect(sources).toEqual(["tpl_q1", "tpl_q2"])
  })

  it("removes flowComplete nodes and their incoming edges become dead-ends", () => {
    // Template internal: q1 → flowComplete, q2 (open)
    const tpl = templateNode(
      "tpl",
      [
        node("q1", "question"),
        node("fc", "flowComplete"),
        node("q2", "question"),
      ],
      [edge("e-int", "q1", "fc")]
    )
    const nodes = [node("1", "start"), tpl, node("3", "question")]
    const edges = [edge("e1", "1", "tpl"), edge("e2", "tpl", "3")]

    const result = flattenFlow(nodes, edges)

    // flowComplete node should be excluded
    const nodeIds = result.nodes.map((n) => n.id)
    expect(nodeIds).not.toContain("tpl_fc")
    expect(nodeIds).toContain("tpl_q1")
    expect(nodeIds).toContain("tpl_q2")

    // Edge q1 → flowComplete should be filtered out (target doesn't exist)
    const edgesFromQ1 = result.edges.filter((e) => e.source === "tpl_q1")
    expect(edgesFromQ1).toHaveLength(0)

    // q2 is the only open node, so it should route to node 3
    const edgesTo3 = result.edges.filter((e) => e.target === "3")
    expect(edgesTo3).toHaveLength(1)
    expect(edgesTo3[0].source).toBe("tpl_q2")
  })

  it("handles template where all paths end at flowComplete (pure terminator)", () => {
    // Template internal: q1 → flowComplete — no open nodes
    const tpl = templateNode(
      "tpl",
      [node("q1", "question"), node("fc", "flowComplete")],
      [edge("e-int", "q1", "fc")]
    )
    const nodes = [node("1", "start"), tpl, node("3", "question")]
    const edges = [edge("e1", "1", "tpl"), edge("e2", "tpl", "3")]

    const result = flattenFlow(nodes, edges)

    // No edges should reach node 3 (template is a pure terminator)
    const edgesTo3 = result.edges.filter((e) => e.target === "3")
    expect(edgesTo3).toHaveLength(0)

    // flowComplete should be excluded
    expect(result.nodes.map((n) => n.id)).not.toContain("tpl_fc")
  })

  it("handles mixed: some paths flowComplete, some open", () => {
    // Template internal:
    //   q1.btn-1 → q2 (q2 is open → continues)
    //   q1.btn-2 → fc (flowComplete → terminates)
    // q1 is a quickReply with 2 buttons — both handles are accounted for
    const tpl = templateNode(
      "tpl",
      [
        node("q1", "quickReply", 0, 0, {
          choices: [{ id: "btn-1", text: "A" }, { id: "btn-2", text: "B" }],
        }),
        node("q2", "question"),
        node("fc", "flowComplete"),
      ],
      [
        edge("e-a", "q1", "q2", "btn-1"),
        edge("e-b", "q1", "fc", "btn-2"),
      ]
    )
    const nodes = [node("1", "start"), tpl, node("3", "question")]
    const edges = [edge("e1", "1", "tpl"), edge("e2", "tpl", "3")]

    const result = flattenFlow(nodes, edges)

    // Only one exit to node 3: q2 is open (no outgoing edges).
    // q1's "sync-next" handle is unconnected but sync-next handles are excluded
    // from open exits — they should not leak to the parent flow.
    const edgesTo3 = result.edges.filter((e) => e.target === "3")
    expect(edgesTo3).toHaveLength(1)
    const exitSources = edgesTo3.map((e) => `${e.source}:${e.sourceHandle || "default"}`)
    expect(exitSources).toEqual(["tpl_q2:default"])

    // flowComplete excluded
    expect(result.nodes.map((n) => n.id)).not.toContain("tpl_fc")

    // Edge q1 → fc should be filtered out
    const edgesToFc = result.edges.filter((e) => e.target === "tpl_fc")
    expect(edgesToFc).toHaveLength(0)
  })

  it("does not treat flowComplete as an entry node", () => {
    // Template internal: fc (flowComplete), q1 → q2
    // fc has no incoming edges but should NOT be picked as entry
    const tpl = templateNode(
      "tpl",
      [
        node("fc", "flowComplete"),
        node("q1", "question"),
        node("q2", "question"),
      ],
      [edge("e-int", "q1", "q2")]
    )
    const nodes = [node("1", "start"), tpl]
    const edges = [edge("e1", "1", "tpl")]

    const result = flattenFlow(nodes, edges)

    // Entry should be q1, not fc
    const startEdge = result.edges.find((e) => e.source === "1")
    expect(startEdge?.target).toBe("tpl_q1")
  })

  it("handles empty template gracefully", () => {
    const tpl = templateNode("tpl", [], [])
    const nodes = [node("1", "start"), tpl, node("3", "question")]
    const edges = [edge("e1", "1", "tpl"), edge("e2", "tpl", "3")]

    const result = flattenFlow(nodes, edges)

    // Template removed, edges referencing it filtered out
    expect(result.nodes.map((n) => n.id)).toEqual(["1", "3"])
    // Edges to/from template are gone since template had no internal nodes
    expect(result.edges).toHaveLength(0)
  })

  // --- Handle-level exit tests ---

  it("routes unconnected condition 'else' handle to parent's next step", () => {
    // Template: condition with group-1 connected, else unconnected
    const tpl = templateNode(
      "tpl",
      [
        node("cond", "condition", 0, 0, {
          conditionGroups: [{ id: "group-1", label: "G1", logic: "AND", rules: [] }],
        }),
        node("q1", "question"),
      ],
      [edge("e-g1", "cond", "q1", "group-1")] // group-1 connected, else NOT connected
    )
    const nodes = [node("1", "start"), tpl, node("3", "question")]
    const edges = [edge("e1", "1", "tpl"), edge("e2", "tpl", "3")]

    const result = flattenFlow(nodes, edges)

    // The "else" handle is unconnected → should route to node 3
    const elseExits = result.edges.filter(
      (e) => e.source === "tpl_cond" && e.sourceHandle === "else" && e.target === "3"
    )
    expect(elseExits).toHaveLength(1)

    // q1 is also open → should route to node 3
    const q1Exits = result.edges.filter(
      (e) => e.source === "tpl_q1" && e.target === "3"
    )
    expect(q1Exits).toHaveLength(1)
  })

  it("routes unconnected quickReply button handles to parent's next step", () => {
    // Template: quickReply with 2 buttons, only btn-a connected
    const tpl = templateNode(
      "tpl",
      [
        node("qr", "quickReply", 0, 0, {
          choices: [{ id: "btn-a", text: "A" }, { id: "btn-b", text: "B" }],
        }),
        node("q1", "question"),
      ],
      [edge("e-a", "qr", "q1", "btn-a")] // btn-a connected, btn-b NOT connected
    )
    const nodes = [node("1", "start"), tpl, node("3", "question")]
    const edges = [edge("e1", "1", "tpl"), edge("e2", "tpl", "3")]

    const result = flattenFlow(nodes, edges)

    // btn-b is unconnected → should route to node 3 with sourceHandle "btn-b"
    const btnBExits = result.edges.filter(
      (e) => e.source === "tpl_qr" && e.sourceHandle === "btn-b" && e.target === "3"
    )
    expect(btnBExits).toHaveLength(1)

    // q1 is open → also routes to node 3
    const q1Exits = result.edges.filter(
      (e) => e.source === "tpl_q1" && e.target === "3"
    )
    expect(q1Exits).toHaveLength(1)

    // btn-a should still connect internally to q1
    const internalEdge = result.edges.find(
      (e) => e.source === "tpl_qr" && e.sourceHandle === "btn-a" && e.target === "tpl_q1"
    )
    expect(internalEdge).toBeDefined()
  })

  it("does NOT route handles connected to flowComplete to parent", () => {
    // Template: condition with group-1 → flowComplete, else unconnected
    const tpl = templateNode(
      "tpl",
      [
        node("cond", "condition", 0, 0, {
          conditionGroups: [{ id: "group-1", label: "G1", logic: "AND", rules: [] }],
        }),
        node("fc", "flowComplete"),
      ],
      [edge("e-g1", "cond", "fc", "group-1")] // group-1 → flowComplete (intentional dead-end)
    )
    const nodes = [node("1", "start"), tpl, node("3", "question")]
    const edges = [edge("e1", "1", "tpl"), edge("e2", "tpl", "3")]

    const result = flattenFlow(nodes, edges)

    // group-1 → flowComplete is a dead-end, NOT an exit
    const g1Exits = result.edges.filter(
      (e) => e.source === "tpl_cond" && e.sourceHandle === "group-1" && e.target === "3"
    )
    expect(g1Exits).toHaveLength(0)

    // else is unconnected → should route to node 3
    const elseExits = result.edges.filter(
      (e) => e.source === "tpl_cond" && e.sourceHandle === "else" && e.target === "3"
    )
    expect(elseExits).toHaveLength(1)
  })

  it("routes unconnected interactiveList option handles to parent", () => {
    // Template: list with 2 options, only opt-a connected
    const tpl = templateNode(
      "tpl",
      [
        node("list", "interactiveList", 0, 0, {
          choices: [{ id: "opt-a", text: "A" }, { id: "opt-b", text: "B" }],
        }),
        node("q1", "question"),
      ],
      [edge("e-a", "list", "q1", "opt-a")]
    )
    const nodes = [node("1", "start"), tpl, node("3", "question")]
    const edges = [edge("e1", "1", "tpl"), edge("e2", "tpl", "3")]

    const result = flattenFlow(nodes, edges)

    // opt-b unconnected → exits to node 3
    const optBExits = result.edges.filter(
      (e) => e.source === "tpl_list" && e.sourceHandle === "opt-b" && e.target === "3"
    )
    expect(optBExits).toHaveLength(1)
  })

  it("fully connected condition does NOT create exit edges", () => {
    // Template: condition with both group-1 and else connected internally
    const tpl = templateNode(
      "tpl",
      [
        node("cond", "condition", 0, 0, {
          conditionGroups: [{ id: "group-1", label: "G1", logic: "AND", rules: [] }],
        }),
        node("q1", "question"),
        node("q2", "question"),
      ],
      [
        edge("e-g1", "cond", "q1", "group-1"),
        edge("e-else", "cond", "q2", "else"),
      ]
    )
    const nodes = [node("1", "start"), tpl, node("3", "question")]
    const edges = [edge("e1", "1", "tpl"), edge("e2", "tpl", "3")]

    const result = flattenFlow(nodes, edges)

    // No exit edges from cond — it's fully connected internally
    const condExits = result.edges.filter(
      (e) => e.source === "tpl_cond" && e.target === "3"
    )
    expect(condExits).toHaveLength(0)

    // q1 and q2 are open nodes → both exit to node 3
    const edgesTo3 = result.edges.filter((e) => e.target === "3")
    expect(edgesTo3).toHaveLength(2)
    expect(edgesTo3.map((e) => e.source).sort()).toEqual(["tpl_q1", "tpl_q2"])
  })
})
