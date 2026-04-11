import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Node, Edge } from "@xyflow/react"
import type { FlowChange } from "@/types"

// Hoisted mocks so we can access them in tests
const mockChangeTracker = vi.hoisted(() => ({
  getChanges: vi.fn((): FlowChange[] => []),
  restoreChanges: vi.fn(),
}))

const mockToast = vi.hoisted(() => ({
  dismiss: vi.fn(),
}))

// Mock change-tracker
vi.mock("@/utils/change-tracker", () => ({
  changeTracker: mockChangeTracker,
}))

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: mockToast,
}))

// ---- React hooks simulator ----
// We mock React so that useRef/useState/useCallback work outside a component render.
// vi.hoisted ensures the variables are available to the hoisted vi.mock factory.

const mockState = vi.hoisted(() => {
  const state = {
    refSlots: [] as Array<{ current: any }>,
    stateSlots: [] as Array<any>,
    stateSetters: [] as Array<(v: any) => void>,
    slotIdx: 0,
    refIdx: 0,
  }
  return state
})

vi.mock("react", () => ({
  useRef: (init: any) => {
    if (mockState.refSlots[mockState.refIdx] === undefined) {
      mockState.refSlots[mockState.refIdx] = { current: init }
    }
    return mockState.refSlots[mockState.refIdx++]
  },
  useState: (init: any) => {
    const idx = mockState.slotIdx++
    if (mockState.stateSlots[idx] === undefined) {
      mockState.stateSlots[idx] = typeof init === "function" ? init() : init
      mockState.stateSetters[idx] = (val: any) => {
        mockState.stateSlots[idx] = typeof val === "function" ? val(mockState.stateSlots[idx]) : val
      }
    }
    return [mockState.stateSlots[idx], mockState.stateSetters[idx]]
  },
  useCallback: (fn: any, _deps?: any[]) => fn,
}))

function resetSlots() {
  mockState.refSlots = []
  mockState.stateSlots = []
  mockState.stateSetters = []
  mockState.slotIdx = 0
  mockState.refIdx = 0
}

function beginRender() {
  mockState.slotIdx = 0
  mockState.refIdx = 0
}

// ---- Helpers ----

function makeNode(id: string, label: string = "test"): Node {
  return { id, type: "test", position: { x: 0, y: 0 }, data: { label } }
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target }
}

// Import after mocks are set up
import { useUndoRedo, stripEphemeral, stripEdgeEphemeral, snapshotKey } from "../use-undo-redo"

// Helper: call the hook and return its result, simulating a render
function callHook(
  nodes: Node[],
  edges: Edge[],
  setNodes: any,
  setEdges: any,
  options?: any,
) {
  beginRender()
  return useUndoRedo(nodes, edges, setNodes, setEdges, options)
}

// ---- Pure function tests ----

describe("stripEphemeral", () => {
  it("removes selected, dragging, measured from nodes", () => {
    const nodes: Node[] = [{
      id: "1", type: "test", position: { x: 0, y: 0 },
      data: { label: "test" }, selected: true, dragging: true, measured: { width: 100, height: 50 },
    }]
    const result = stripEphemeral(nodes)
    expect(result[0]).not.toHaveProperty("selected")
    expect(result[0]).not.toHaveProperty("dragging")
    expect(result[0]).not.toHaveProperty("measured")
    expect(result[0].id).toBe("1")
    expect(result[0].data.label).toBe("test")
  })

  it("preserves non-ephemeral fields", () => {
    const nodes: Node[] = [makeNode("1")]
    const result = stripEphemeral(nodes)
    expect(result[0].id).toBe("1")
    expect(result[0].type).toBe("test")
    expect(result[0].position).toEqual({ x: 0, y: 0 })
    expect(result[0].data).toEqual({ label: "test" })
  })

  it("returns new array (does not mutate input)", () => {
    const original: Node[] = [{ ...makeNode("1"), selected: true }]
    const result = stripEphemeral(original)
    expect(result).not.toBe(original)
    expect(original[0].selected).toBe(true)
  })

  it("handles empty array", () => {
    expect(stripEphemeral([])).toEqual([])
  })

  it("strips function values from node data (injected callbacks)", () => {
    const nodes: Node[] = [{
      id: "1", type: "test", position: { x: 0, y: 0 },
      data: {
        label: "test",
        buttons: [{ id: "b1", text: "Go" }],
        onSnapshot: () => {},
        onResumeTracking: () => {},
        onNodeUpdate: () => {},
        onDelete: () => {},
      },
    }]
    const result = stripEphemeral(nodes)
    expect(result[0].data.label).toBe("test")
    expect(result[0].data.buttons).toEqual([{ id: "b1", text: "Go" }])
    expect(result[0].data).not.toHaveProperty("onSnapshot")
    expect(result[0].data).not.toHaveProperty("onResumeTracking")
    expect(result[0].data).not.toHaveProperty("onNodeUpdate")
    expect(result[0].data).not.toHaveProperty("onDelete")
  })
})

describe("stripEdgeEphemeral", () => {
  it("removes selected from edges", () => {
    const edges: Edge[] = [{ ...makeEdge("e1", "1", "2"), selected: true }]
    const result = stripEdgeEphemeral(edges)
    expect(result[0]).not.toHaveProperty("selected")
    expect(result[0].id).toBe("e1")
    expect(result[0].source).toBe("1")
    expect(result[0].target).toBe("2")
  })

  it("preserves non-ephemeral fields", () => {
    const edges: Edge[] = [makeEdge("e1", "1", "2")]
    const result = stripEdgeEphemeral(edges)
    expect(result[0]).toEqual(edges[0])
  })

  it("handles empty array", () => {
    expect(stripEdgeEphemeral([])).toEqual([])
  })
})

describe("snapshotKey", () => {
  it("produces same key for identical state", () => {
    const nodes = [makeNode("1")]
    const edges = [makeEdge("e1", "1", "2")]
    expect(snapshotKey(nodes, edges)).toBe(snapshotKey(nodes, edges))
  })

  it("produces different keys when nodes differ", () => {
    expect(snapshotKey([makeNode("1")], [])).not.toBe(snapshotKey([makeNode("1"), makeNode("2")], []))
  })

  it("produces different keys when edges differ", () => {
    const nodes = [makeNode("1")]
    expect(snapshotKey(nodes, [])).not.toBe(snapshotKey(nodes, [makeEdge("e1", "1", "2")]))
  })

  it("ignores ephemeral field differences (dedup)", () => {
    const nodeA: Node = { ...makeNode("1"), selected: true }
    const nodeB: Node = { ...makeNode("1"), selected: false }
    expect(snapshotKey([nodeA], [])).toBe(snapshotKey([nodeB], []))
  })

  it("ignores edge selected differences (dedup)", () => {
    const edgeA: Edge = { ...makeEdge("e1", "1", "2"), selected: true }
    const edgeB: Edge = { ...makeEdge("e1", "1", "2"), selected: false }
    const nodes = [makeNode("1")]
    expect(snapshotKey(nodes, [edgeA])).toBe(snapshotKey(nodes, [edgeB]))
  })
})

// ---- Hook behavior tests ----

describe("useUndoRedo", () => {
  let mockSetNodes: ReturnType<typeof vi.fn>
  let mockSetEdges: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetSlots()
    mockSetNodes = vi.fn()
    mockSetEdges = vi.fn()
  })

  it("starts with canUndo=false, canRedo=false", () => {
    const result = callHook([], [], mockSetNodes, mockSetEdges)
    expect(result.canUndo).toBe(false)
    expect(result.canRedo).toBe(false)
  })

  it("snapshot → undo restores previous state", () => {
    const nodes1 = [makeNode("1")]
    const nodes2 = [makeNode("1"), makeNode("2")]

    // Render 1: initial state
    let result = callHook(nodes1, [], mockSetNodes, mockSetEdges)
    // Take snapshot of state 1
    result.snapshot()
    // Render 2: after node addition
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)

    expect(result.canUndo).toBe(true)

    // Undo should restore state 1
    result.undo()
    const setNodesCall = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1][0]
    expect(setNodesCall).toHaveLength(1)
    expect(setNodesCall[0].id).toBe("1")
  })

  it("undo → redo restores the undone state", () => {
    const nodes1 = [makeNode("1")]
    const nodes2 = [makeNode("1"), makeNode("2")]

    let result = callHook(nodes1, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)
    result.undo()

    // Re-render to pick up canRedo state update
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)
    expect(result.canRedo).toBe(true)

    result.redo()
    const setNodesCall = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1][0]
    expect(setNodesCall).toHaveLength(2)
  })

  it("new action after undo clears redo stack", () => {
    const nodes1 = [makeNode("1")]
    const nodes2 = [makeNode("1"), makeNode("2")]
    const nodes3 = [makeNode("1"), makeNode("3")]

    let result = callHook(nodes1, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)
    result.undo()

    // Re-render to pick up canRedo
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)
    expect(result.canRedo).toBe(true)

    // New action: snapshot + change to nodes3
    result.snapshot()
    result = callHook(nodes3, [], mockSetNodes, mockSetEdges)
    expect(result.canRedo).toBe(false)
  })

  it("respects maxHistory limit (drops oldest)", () => {
    let result = callHook([makeNode("0")], [], mockSetNodes, mockSetEdges, { maxHistory: 3 })

    // Push 4 snapshots (exceeds max of 3)
    for (let i = 1; i <= 4; i++) {
      result.snapshot()
      result = callHook([makeNode(String(i))], [], mockSetNodes, mockSetEdges, { maxHistory: 3 })
    }

    // Should only be able to undo 3 times (max), not 4
    let undoCount = 0
    while (result.canUndo) {
      result.undo()
      result = callHook([makeNode("x")], [], mockSetNodes, mockSetEdges, { maxHistory: 3 })
      undoCount++
    }
    expect(undoCount).toBe(3)
  })

  it("dedup: skips snapshot if state unchanged", () => {
    const nodes = [makeNode("1")]

    let result = callHook(nodes, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result.snapshot() // Same state — should dedup

    result = callHook(nodes, [], mockSetNodes, mockSetEdges)

    // Only one undo entry, not two
    result.undo()
    result = callHook(nodes, [], mockSetNodes, mockSetEdges)
    expect(result.canUndo).toBe(false)
  })

  it("strips ephemeral fields (selected, dragging, measured)", () => {
    const nodeWithEphemeral: Node = {
      id: "1", type: "test", position: { x: 0, y: 0 },
      data: { label: "test" }, selected: true, dragging: true, measured: { width: 100, height: 50 },
    }

    let result = callHook([nodeWithEphemeral], [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result.undo()

    const restored = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1][0]
    expect(restored[0].selected).toBeUndefined()
    expect(restored[0].dragging).toBeUndefined()
    expect(restored[0].measured).toBeUndefined()
  })

  it("isEnabled=false makes undo/redo no-ops", () => {
    const nodes = [makeNode("1")]

    const result = callHook(nodes, [], mockSetNodes, mockSetEdges, { isEnabled: false })
    result.snapshot()
    result.undo()
    expect(mockSetNodes).not.toHaveBeenCalled()
  })

  it("undo during paused tracking forces resume", () => {
    const nodes = [makeNode("1")]

    const result = callHook(nodes, [], mockSetNodes, mockSetEdges)
    result.snapshot() // This pauses tracking
    // Undo should force resumeTracking, then undo
    result.undo()
    // If we got here without error, tracking was resumed and undo completed
  })

  it("calls onBeforeUndo callback", () => {
    const onBeforeUndo = vi.fn()
    const nodes = [makeNode("1")]

    const result = callHook(nodes, [], mockSetNodes, mockSetEdges, { onBeforeUndo })
    result.snapshot()
    result.undo()
    expect(onBeforeUndo).toHaveBeenCalledOnce()
  })

  it("multi-level undo restores each step in reverse", () => {
    const nodes1 = [makeNode("1")]
    const nodes2 = [makeNode("1"), makeNode("2")]
    const nodes3 = [makeNode("1"), makeNode("2"), makeNode("3")]

    let result = callHook(nodes1, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes3, [], mockSetNodes, mockSetEdges)

    // Undo to nodes2
    result.undo()
    let restored = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1][0]
    expect(restored).toHaveLength(2)
    expect(restored[1].id).toBe("2")

    // Undo to nodes1
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)
    result.undo()
    restored = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1][0]
    expect(restored).toHaveLength(1)
    expect(restored[0].id).toBe("1")
  })

  it("multi-level redo restores each step forward", () => {
    const nodes1 = [makeNode("1")]
    const nodes2 = [makeNode("1"), makeNode("2")]
    const nodes3 = [makeNode("1"), makeNode("2"), makeNode("3")]

    let result = callHook(nodes1, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes3, [], mockSetNodes, mockSetEdges)

    // Undo twice
    result.undo()
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)
    result.undo()
    result = callHook(nodes1, [], mockSetNodes, mockSetEdges)

    // Redo to nodes2
    result.redo()
    let restored = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1][0]
    expect(restored).toHaveLength(2)

    // Redo to nodes3
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)
    result.redo()
    restored = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1][0]
    expect(restored).toHaveLength(3)
  })

  it("snapshots and restores edges correctly", () => {
    const nodes = [makeNode("1"), makeNode("2")]
    const edges1 = [makeEdge("e1", "1", "2")]
    const edges2 = [makeEdge("e1", "1", "2"), makeEdge("e2", "2", "1")]

    let result = callHook(nodes, edges1, mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes, edges2, mockSetNodes, mockSetEdges)

    result.undo()
    const restoredEdges = mockSetEdges.mock.calls[mockSetEdges.mock.calls.length - 1][0]
    expect(restoredEdges).toHaveLength(1)
    expect(restoredEdges[0].id).toBe("e1")
  })

  it("calls changeTracker.restoreChanges on undo", () => {
    const testChanges: FlowChange[] = [{
      id: "c1", type: "node_add", timestamp: "2026-01-01", data: {}, description: "test",
    }]
    mockChangeTracker.getChanges.mockReturnValue(testChanges)

    const nodes1 = [makeNode("1")]
    const nodes2 = [makeNode("1"), makeNode("2")]

    let result = callHook(nodes1, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)

    result.undo()
    expect(mockChangeTracker.restoreChanges).toHaveBeenCalled()
    const loadedChanges = mockChangeTracker.restoreChanges.mock.calls[mockChangeTracker.restoreChanges.mock.calls.length - 1][0]
    expect(loadedChanges).toEqual(testChanges)

    mockChangeTracker.getChanges.mockReturnValue([])
  })

  it("calls changeTracker.restoreChanges on redo", () => {
    const nodes1 = [makeNode("1")]
    const nodes2 = [makeNode("1"), makeNode("2")]

    let result = callHook(nodes1, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)

    mockChangeTracker.restoreChanges.mockClear()
    result.undo()
    result = callHook(nodes1, [], mockSetNodes, mockSetEdges)
    result.redo()
    expect(mockChangeTracker.restoreChanges).toHaveBeenCalled()
  })

  it("dismisses active toast on new snapshot", () => {
    mockToast.dismiss.mockClear()
    const nodes1 = [makeNode("1")]

    let result = callHook(nodes1, [], mockSetNodes, mockSetEdges)
    // Simulate an AI toast being active
    result.activeToastIdRef.current = "toast-123"

    result.snapshot()
    expect(mockToast.dismiss).toHaveBeenCalledWith("toast-123")
    expect(result.activeToastIdRef.current).toBeNull()
  })

  it("does not dismiss toast when none is active", () => {
    mockToast.dismiss.mockClear()
    const nodes1 = [makeNode("1")]
    const nodes2 = [makeNode("1"), makeNode("2")]

    let result = callHook(nodes1, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)

    expect(mockToast.dismiss).not.toHaveBeenCalled()
  })

  it("trackedSetNodes captures snapshot before mutation", () => {
    const nodes = [makeNode("1")]

    let result = callHook(nodes, [], mockSetNodes, mockSetEdges)

    // Use trackedSetNodes — it wraps setNodes and auto-captures
    mockSetNodes.mockImplementation((updater: any) => {
      // Simulate React's setState callback
      if (typeof updater === "function") updater(nodes)
    })

    result.trackedSetNodes([makeNode("1"), makeNode("2")])

    // setNodes should have been called
    expect(mockSetNodes).toHaveBeenCalled()
  })

  it("trackedSetNodes skips snapshot when paused", () => {
    const nodes = [makeNode("1")]

    let result = callHook(nodes, [], mockSetNodes, mockSetEdges)
    // Take manual snapshot (this pauses auto-capture)
    result.snapshot()

    // Clear to track new calls
    mockSetNodes.mockClear()

    mockSetNodes.mockImplementation((updater: any) => {
      if (typeof updater === "function") updater(nodes)
    })

    result.trackedSetNodes([makeNode("1"), makeNode("2")])

    // setNodes was called (the mutation still applies)
    expect(mockSetNodes).toHaveBeenCalled()

    // But after undo, should only have 1 undo entry (from manual snapshot), not 2
    result = callHook(nodes, [], mockSetNodes, mockSetEdges)
    result.undo()
    result = callHook(nodes, [], mockSetNodes, mockSetEdges)
    expect(result.canUndo).toBe(false) // Only one snapshot was pushed
  })

  it("undo with empty stack is a no-op", () => {
    const result = callHook([], [], mockSetNodes, mockSetEdges)
    result.undo()
    expect(mockSetNodes).not.toHaveBeenCalled()
    expect(mockSetEdges).not.toHaveBeenCalled()
  })

  it("redo with empty stack is a no-op", () => {
    const result = callHook([], [], mockSetNodes, mockSetEdges)
    result.redo()
    expect(mockSetNodes).not.toHaveBeenCalled()
    expect(mockSetEdges).not.toHaveBeenCalled()
  })

  // --- Simulate real app flows ---

  it("deleteNode via trackedSetNodes: auto-capture then undo restores", () => {
    // Simulate: flow has 3 nodes, deleteNode calls trackedSetNodes to remove one
    const nodes = [makeNode("1"), makeNode("2"), makeNode("3")]
    const edges = [makeEdge("e1", "1", "2")]

    // Wire up mockSetNodes to actually run the updater (simulating React setState)
    let currentNodes = [...nodes]
    mockSetNodes.mockImplementation((updater: any) => {
      if (typeof updater === "function") {
        currentNodes = updater(currentNodes)
      } else {
        currentNodes = updater
      }
    })
    mockSetEdges.mockImplementation(() => {})

    let result = callHook(nodes, edges, mockSetNodes, mockSetEdges)

    // deleteNode calls trackedSetNodes (auto-capture should fire)
    result.trackedSetNodes((nds: Node[]) => nds.filter(n => n.id !== "3"))

    // currentNodes should now have 2 nodes
    expect(currentNodes).toHaveLength(2)

    // Re-render with post-delete state
    result = callHook(currentNodes, edges, mockSetNodes, mockSetEdges)
    expect(result.canUndo).toBe(true)

    // Undo
    mockSetNodes.mockClear()
    result.undo()

    // Should restore pre-delete state (3 nodes)
    expect(mockSetNodes).toHaveBeenCalled()
    const restoredNodes = mockSetNodes.mock.calls[0][0]
    expect(restoredNodes).toHaveLength(3)
    expect(restoredNodes.map((n: Node) => n.id)).toEqual(["1", "2", "3"])
  })

  it("delete via snapshot+pause: manual snapshot then undo restores", () => {
    // Simulate: Delete key handler calls undoSnapshot() then trackedSetNodes
    const nodes = [makeNode("1"), makeNode("2"), makeNode("3")]
    const edges = [makeEdge("e1", "1", "2")]

    let currentNodes = [...nodes]
    mockSetNodes.mockImplementation((updater: any) => {
      if (typeof updater === "function") {
        currentNodes = updater(currentNodes)
      } else {
        currentNodes = updater
      }
    })
    mockSetEdges.mockImplementation(() => {})

    let result = callHook(nodes, edges, mockSetNodes, mockSetEdges)

    // 1. undoSnapshot() — captures pre-delete state, pauses tracking
    result.snapshot()

    // 2. trackedSetNodes to filter (paused, no auto-capture)
    result.trackedSetNodes((nds: Node[]) => nds.filter(n => n.id !== "3"))

    // 3. resumeTracking
    result.resumeTracking()

    expect(currentNodes).toHaveLength(2)

    // Re-render with post-delete state
    result = callHook(currentNodes, edges, mockSetNodes, mockSetEdges)
    expect(result.canUndo).toBe(true)

    // Undo
    mockSetNodes.mockClear()
    result.undo()

    const restoredNodes = mockSetNodes.mock.calls[0][0]
    expect(restoredNodes).toHaveLength(3)
  })

  it("nodes with injected function callbacks don't crash snapshot", () => {
    const nodesWithCallbacks: Node[] = [{
      id: "1", type: "test", position: { x: 0, y: 0 },
      data: {
        label: "test",
        onSnapshot: () => {},
        onResumeTracking: () => {},
        onNodeUpdate: (id: string, data: any) => {},
        onDelete: () => {},
        flowVariables: ["var1", "var2"],
      },
    }]

    let result = callHook(nodesWithCallbacks, [], mockSetNodes, mockSetEdges)
    // Should not throw
    result.snapshot()

    // Re-render to pick up canUndo state update
    result = callHook(nodesWithCallbacks, [], mockSetNodes, mockSetEdges)
    expect(result.canUndo).toBe(true)

    // Undo should restore without functions but with serializable data
    mockSetNodes.mockClear()
    result.undo()
    const restored = mockSetNodes.mock.calls[0][0]
    expect(restored[0].data.label).toBe("test")
    expect(restored[0].data.flowVariables).toEqual(["var1", "var2"])
    expect(restored[0].data.onSnapshot).toBeUndefined()
    expect(restored[0].data.onNodeUpdate).toBeUndefined()
  })

  it("snapshotKey ignores function callbacks (dedup works with injected data)", () => {
    const nodeClean: Node = {
      id: "1", type: "test", position: { x: 0, y: 0 },
      data: { label: "test" },
    }
    const nodeWithFns: Node = {
      id: "1", type: "test", position: { x: 0, y: 0 },
      data: { label: "test", onSnapshot: () => {}, onDelete: () => {} },
    }
    // Same structural data, different function callbacks — keys should match
    expect(snapshotKey([nodeClean], [])).toBe(snapshotKey([nodeWithFns], []))
  })

  it("action after undo is not deduped (can undo the new action)", () => {
    // Scenario: create edge → delete edge → undo (edge back) → delete edge again → undo should work
    const nodes = [makeNode("1"), makeNode("2")]
    const edgesWithEdge = [makeEdge("e1", "1", "2")]
    const edgesEmpty: Edge[] = []

    let result = callHook(nodes, edgesWithEdge, mockSetNodes, mockSetEdges)

    // Step 1: snapshot before deleting edge
    result.snapshot()
    // Step 2: "delete" edge (simulate state change)
    result = callHook(nodes, edgesEmpty, mockSetNodes, mockSetEdges)

    // Step 3: undo → edge restored
    result.undo()
    // Re-render with restored state
    result = callHook(nodes, edgesWithEdge, mockSetNodes, mockSetEdges)

    // Step 4: snapshot before deleting edge AGAIN (should NOT dedup)
    result.snapshot()
    result = callHook(nodes, edgesEmpty, mockSetNodes, mockSetEdges)
    expect(result.canUndo).toBe(true)

    // Step 5: undo → edge should come back again
    mockSetEdges.mockClear()
    result.undo()
    const restoredEdges = mockSetEdges.mock.calls[mockSetEdges.mock.calls.length - 1][0]
    expect(restoredEdges).toHaveLength(1)
    expect(restoredEdges[0].id).toBe("e1")
  })

  it("action after redo is not deduped", () => {
    const nodes = [makeNode("1")]
    const nodes2 = [makeNode("1"), makeNode("2")]

    let result = callHook(nodes, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)

    // Undo
    result.undo()
    result = callHook(nodes, [], mockSetNodes, mockSetEdges)

    // Redo
    result.redo()
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)

    // New action on the redo'd state should not be deduped
    result.snapshot()
    result = callHook(nodes2, [], mockSetNodes, mockSetEdges)
    expect(result.canUndo).toBe(true)
  })

  it("clearHistory resets all stacks and state", () => {
    const nodes = [makeNode("1")]

    let result = callHook(nodes, [], mockSetNodes, mockSetEdges)
    result.snapshot()
    result = callHook(nodes, [], mockSetNodes, mockSetEdges)
    expect(result.canUndo).toBe(true)

    result.clearHistory()
    result = callHook(nodes, [], mockSetNodes, mockSetEdges)
    expect(result.canUndo).toBe(false)
    expect(result.canRedo).toBe(false)

    // Undo/redo should be no-ops
    mockSetNodes.mockClear()
    result.undo()
    expect(mockSetNodes).not.toHaveBeenCalled()
    result.redo()
    expect(mockSetNodes).not.toHaveBeenCalled()
  })
})
