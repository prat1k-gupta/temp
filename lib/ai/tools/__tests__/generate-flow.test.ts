import { describe, it, expect } from "vitest"
import { deduplicateEdges } from "../generate-flow"
import { buildCorrectionPrompt } from "../generate-flow-create"
import { recoverUnvalidatedEdit, EDIT_STEP_BUDGET } from "../generate-flow-edit"
import type { BuildEditFlowResult } from "@/utils/flow-plan-builder"
import type { Edge, Node } from "@xyflow/react"
import type { FlowIssue } from "@/utils/flow-validator"

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string
): Edge {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) }
}

describe("deduplicateEdges", () => {
  it("keeps unique edges unchanged", () => {
    const edges = [
      edge("e1", "A", "B"),
      edge("e2", "B", "C"),
    ]
    expect(deduplicateEdges(edges)).toEqual(edges)
  })

  it("removes duplicate edges from same source without sourceHandle", () => {
    const edges = [
      edge("e1", "A", "B"),
      edge("e2", "A", "C"),
    ]
    const result = deduplicateEdges(edges)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("e1") // first-wins
  })

  it("allows multiple edges from same source with different sourceHandles", () => {
    const edges = [
      edge("e1", "qr-1", "nodeA", "button-0"),
      edge("e2", "qr-1", "nodeB", "button-1"),
      edge("e3", "qr-1", "nodeC", "button-2"),
    ]
    const result = deduplicateEdges(edges)
    expect(result).toHaveLength(3)
  })

  it("removes duplicate edges from same button (same sourceHandle, different targets)", () => {
    const edges = [
      edge("e1", "qr-1", "nodeA", "button-0"),
      edge("e2", "qr-1", "nodeB", "button-0"), // same button, different target
    ]
    const result = deduplicateEdges(edges)
    expect(result).toHaveLength(1)
    expect(result[0].target).toBe("nodeA") // first-wins
  })

  it("removes exact duplicates (same source, sourceHandle, target)", () => {
    const edges = [
      edge("e1", "qr-1", "nodeA", "button-0"),
      edge("e2", "qr-1", "nodeA", "button-0"), // exact duplicate
    ]
    const result = deduplicateEdges(edges)
    expect(result).toHaveLength(1)
  })

  it("handles mixed button and non-button edges from same source", () => {
    // This simulates a buggy LLM output where a quickReply node has
    // both a default edge and button edges
    const edges = [
      edge("e1", "qr-1", "nodeA"),             // no sourceHandle (default)
      edge("e2", "qr-1", "nodeB", "button-0"), // button-0
      edge("e3", "qr-1", "nodeC", "button-1"), // button-1
    ]
    const result = deduplicateEdges(edges)
    expect(result).toHaveLength(3)
    // default, button-0, button-1 are all different keys
  })

  it("handles empty array", () => {
    expect(deduplicateEdges([])).toEqual([])
  })

  it("keeps edges from different source nodes even with same sourceHandle", () => {
    const edges = [
      edge("e1", "qr-1", "nodeA", "button-0"),
      edge("e2", "qr-2", "nodeB", "button-0"), // different source
    ]
    const result = deduplicateEdges(edges)
    expect(result).toHaveLength(2)
  })

  it("realistic scenario: LLM generates two edges from button-0 to different targets", () => {
    // This is the exact bug the user reported
    const edges = [
      edge("e1", "1", "name-1"),                       // start → name
      edge("e2", "name-1", "qr-1"),                    // name → quickReply
      edge("e3", "qr-1", "addr-1", "button-0"),        // button-0 → address
      edge("e4", "qr-1", "follow-up", "button-0"),     // button-0 → follow-up (BUG!)
      edge("e5", "qr-1", "meta-1", "button-1"),        // button-1 → meta
    ]
    const result = deduplicateEdges(edges)
    expect(result).toHaveLength(4)
    // button-0 should only connect to addr-1 (first-wins)
    const button0Edge = result.find(e => e.sourceHandle === "button-0")
    expect(button0Edge?.target).toBe("addr-1")
    // button-1 should still connect to meta-1
    const button1Edge = result.find(e => e.sourceHandle === "button-1")
    expect(button1Edge?.target).toBe("meta-1")
  })
})

describe("buildCorrectionPrompt", () => {
  it("includes all issues in the correction prompt", () => {
    const issues: FlowIssue[] = [
      { type: "orphaned_node", nodeId: "q2", detail: 'Node "q2" has no incoming connections.' },
      { type: "button_limit_exceeded", nodeId: "qr1", detail: 'Node "qr1" has 5 buttons but whatsapp allows 3.' },
    ]
    const prompt = buildCorrectionPrompt(issues, "whatsapp")
    expect(prompt).toContain("orphaned_node")
    expect(prompt).toContain("button_limit_exceeded")
    expect(prompt).toContain("whatsapp")
    expect(prompt).toContain("5 buttons")
  })

  it("returns empty string when no issues", () => {
    expect(buildCorrectionPrompt([], "whatsapp")).toBe("")
  })

  it("includes node IDs when present", () => {
    const issues: FlowIssue[] = [
      { type: "empty_content", nodeId: "q1", detail: "Node q1 has no content" },
    ]
    const prompt = buildCorrectionPrompt(issues, "whatsapp")
    expect(prompt).toContain("(node: q1)")
  })

  it("omits node ID when not present", () => {
    const issues: FlowIssue[] = [
      { type: "converter_error", detail: "Converter failed" },
    ]
    const prompt = buildCorrectionPrompt(issues, "instagram")
    expect(prompt).not.toContain("(node:")
    expect(prompt).toContain("instagram")
  })
})

// save-as-template intent detection is now handled by the AI via the save_as_template tool
// in EDIT mode (no regex needed). The AI naturally understands user intent and calls the tool.

describe("recoverUnvalidatedEdit", () => {
  const startNode: Node = {
    id: "start-1",
    type: "start",
    position: { x: 0, y: 0 },
    data: { label: "Start" },
  }

  function makeEditResult(overrides: Partial<BuildEditFlowResult> = {}): BuildEditFlowResult {
    return {
      newNodes: [],
      newEdges: [],
      nodeOrder: [],
      nodeUpdates: [],
      removeNodeIds: [],
      removeEdges: [],
      positionShifts: [],
      warnings: [],
      ...overrides,
    }
  }

  it("returns null when there's nothing to recover", () => {
    expect(recoverUnvalidatedEdit(null, [startNode], [], "whatsapp")).toBeNull()
  })

  it("recovers a valid edit that wired a message node off the start", () => {
    const newMsg: Node = {
      id: "msg-1",
      type: "whatsappMessage",
      position: { x: 200, y: 0 },
      data: { label: "Welcome", text: "Hi there" },
    }
    const newEdge: Edge = { id: "e-start-msg", source: "start-1", target: "msg-1" }
    const editResult = makeEditResult({ newNodes: [newMsg], newEdges: [newEdge] })

    const recovered = recoverUnvalidatedEdit(editResult, [startNode], [], "whatsapp")
    expect(recovered).toBe(editResult)
  })

  it("refuses to recover an edit that leaves the new node orphaned", () => {
    // New node added but no edge connecting it — validator flags orphaned_node.
    const orphanMsg: Node = {
      id: "msg-orphan",
      type: "whatsappMessage",
      position: { x: 200, y: 0 },
      data: { label: "Orphan", text: "Nobody points at me" },
    }
    const editResult = makeEditResult({ newNodes: [orphanMsg] })

    const recovered = recoverUnvalidatedEdit(editResult, [startNode], [], "whatsapp")
    expect(recovered).toBeNull()
  })

  it("applies nodeUpdates to existing nodes before validating", () => {
    // An existing message node with a label is updated via nodeUpdates.
    // Recovery must merge the update into the current state before asking
    // the validator, otherwise a valid post-update state could be rejected
    // based on the pre-update data.
    const existingMsg: Node = {
      id: "msg-existing",
      type: "whatsappMessage",
      position: { x: 200, y: 0 },
      data: { label: "Welcome", text: "Hi there" },
    }
    const existingEdge: Edge = { id: "e-start-msg", source: "start-1", target: "msg-existing" }
    const editResult = makeEditResult({
      nodeUpdates: [{ nodeId: "msg-existing", data: { text: "Updated greeting" } }],
    })

    const recovered = recoverUnvalidatedEdit(
      editResult,
      [startNode, existingMsg],
      [existingEdge],
      "whatsapp",
    )
    expect(recovered).toBe(editResult)
  })
})

describe("EDIT_STEP_BUDGET", () => {
  it("stays within the sanctioned range", () => {
    // Floor: 20 is the minimum that covers observed failure traces where a
    // complex flow hits apply_edit → validate → fix → apply_edit → ... and
    // runs out of steps before the final validate_result (12 shipped the bug).
    // Ceiling: 30 so nobody "fixes" a future model flake by bumping it to 50,
    // which would give a misbehaving model room to loop and burn tokens.
    expect(EDIT_STEP_BUDGET).toBeGreaterThanOrEqual(20)
    expect(EDIT_STEP_BUDGET).toBeLessThanOrEqual(30)
  })
})
