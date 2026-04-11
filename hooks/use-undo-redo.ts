"use client"

import { useRef, useState, useCallback } from "react"
import type { Node, Edge } from "@xyflow/react"
import { changeTracker } from "@/utils/change-tracker"
import { toast } from "sonner"
import type { FlowChange } from "@/types"

export interface UndoSnapshot {
  nodes: Node[]
  edges: Edge[]
  trackedChanges: FlowChange[]
}

interface UseUndoRedoOptions {
  maxHistory?: number
  isEnabled?: boolean
  onBeforeUndo?: () => void
}

type SetNodes = React.Dispatch<React.SetStateAction<Node[]>>
type SetEdges = React.Dispatch<React.SetStateAction<Edge[]>>

const DEFAULT_MAX_HISTORY = 50

/** Strip ReactFlow ephemeral fields and injected callbacks that shouldn't be part of undo state */
export function stripEphemeral(nodes: Node[]): Node[] {
  return nodes.map(({ selected, dragging, measured, ...rest }) => ({
    ...rest,
    data: Object.fromEntries(
      Object.entries(rest.data || {}).filter(([, v]) => typeof v !== "function")
    ),
  } as Node))
}

/** Strip ephemeral fields from edges (selected state is UI-only) */
export function stripEdgeEphemeral(edges: Edge[]): Edge[] {
  return edges.map(({ selected, ...rest }) => rest as Edge)
}

/** JSON-based deep clone that safely drops functions and other non-serializable values */
function safeDeepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

/** Deep clone nodes and edges, stripping ephemeral fields */
function createSnapshot(nodes: Node[], edges: Edge[]): UndoSnapshot {
  return {
    nodes: safeDeepClone(stripEphemeral(nodes)),
    edges: safeDeepClone(stripEdgeEphemeral(edges)),
    trackedChanges: safeDeepClone(changeTracker.getChanges()),
  }
}

/** Stringify nodes + edges for dedup comparison */
export function snapshotKey(nodes: Node[], edges: Edge[]): string {
  return JSON.stringify(stripEphemeral(nodes)) + JSON.stringify(stripEdgeEphemeral(edges))
}

export function useUndoRedo(
  nodes: Node[],
  edges: Edge[],
  setNodes: SetNodes,
  setEdges: SetEdges,
  options?: UseUndoRedoOptions,
) {
  const maxHistory = options?.maxHistory ?? DEFAULT_MAX_HISTORY
  const onBeforeUndo = options?.onBeforeUndo

  // Use ref for isEnabled so callbacks always read the latest value
  // without needing isEnabled in their dependency arrays.
  // This prevents stale closures when isEditMode toggles mid-operation.
  const isEnabledRef = useRef(options?.isEnabled ?? true)
  isEnabledRef.current = options?.isEnabled ?? true

  // Also ref onBeforeUndo to keep undo callback stable
  const onBeforeUndoRef = useRef(onBeforeUndo)
  onBeforeUndoRef.current = onBeforeUndo

  // Stacks stored as refs to avoid re-renders on every push
  const undoStackRef = useRef<UndoSnapshot[]>([])
  const redoStackRef = useRef<UndoSnapshot[]>([])
  const lastSnapshotKeyRef = useRef<string>("")

  // Only these two booleans are state — update only when they actually change
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Pause flag for manual snapshot mode
  const isPausedRef = useRef(false)

  // Guard against StrictMode double-invocation and same-microtask batching
  const snapshotPushedThisBatchRef = useRef(false)

  // Track AI toast ID so we can dismiss it on new action
  const activeToastIdRef = useRef<string | number | null>(null)

  // Ref to current edges for use inside trackedSetNodes updater
  const currentEdgesRef = useRef(edges)
  currentEdgesRef.current = edges

  // Ref to current nodes for use inside trackedSetEdges updater
  const currentNodesRef = useRef(nodes)
  currentNodesRef.current = nodes

  /** Push a snapshot onto the undo stack. Clears redo. */
  const pushSnapshot = useCallback((snapshotNodes: Node[], snapshotEdges: Edge[]) => {
    if (!isEnabledRef.current) return

    const key = snapshotKey(snapshotNodes, snapshotEdges)
    if (key === lastSnapshotKeyRef.current) return // Dedup

    const snap = createSnapshot(snapshotNodes, snapshotEdges)
    undoStackRef.current.push(snap)

    // Enforce max history
    if (undoStackRef.current.length > maxHistory) {
      undoStackRef.current.shift()
    }

    lastSnapshotKeyRef.current = key

    // Clear redo on new action
    redoStackRef.current = []

    // Dismiss any active AI toast (undo button becomes stale after new action)
    if (activeToastIdRef.current) {
      toast.dismiss(activeToastIdRef.current)
      activeToastIdRef.current = null
    }

    setCanUndo(prev => { if (!prev) return true; return prev })
    setCanRedo(prev => { if (prev) return false; return prev })
  }, [maxHistory]) // No isEnabled — reads from ref

  /** Manual snapshot: captures current state AND pauses auto-capture */
  const snapshot = useCallback(() => {
    if (!isEnabledRef.current) return
    pushSnapshot(currentNodesRef.current, currentEdgesRef.current)
    isPausedRef.current = true
  }, [pushSnapshot]) // No isEnabled — reads from ref

  /** Resume auto-capture after manual snapshot */
  const resumeTracking = useCallback(() => {
    isPausedRef.current = false
  }, [])

  /** Wrapped setNodes — auto-captures snapshot before mutation */
  const trackedSetNodes = useCallback<SetNodes>((updater) => {
    setNodes((prev) => {
      // Auto-capture (unless paused or already pushed this batch)
      if (!isPausedRef.current && !snapshotPushedThisBatchRef.current) {
        pushSnapshot(prev, currentEdgesRef.current)
        snapshotPushedThisBatchRef.current = true
        queueMicrotask(() => { snapshotPushedThisBatchRef.current = false })
      }
      return typeof updater === "function" ? updater(prev) : updater
    })
  }, [setNodes, pushSnapshot])

  /** Wrapped setEdges — auto-captures snapshot before mutation */
  const trackedSetEdges = useCallback<SetEdges>((updater) => {
    setEdges((prev) => {
      if (!isPausedRef.current && !snapshotPushedThisBatchRef.current) {
        pushSnapshot(currentNodesRef.current, prev)
        snapshotPushedThisBatchRef.current = true
        queueMicrotask(() => { snapshotPushedThisBatchRef.current = false })
      }
      return typeof updater === "function" ? updater(prev) : updater
    })
  }, [setEdges, pushSnapshot])

  /** Undo: restore the last snapshot */
  const undo = useCallback(() => {
    if (!isEnabledRef.current) return
    // Force resume if paused (mid-inline-edit undo)
    isPausedRef.current = false

    const snap = undoStackRef.current.pop()
    if (!snap) return

    onBeforeUndoRef.current?.()

    // Push current state to redo
    redoStackRef.current.push(createSnapshot(currentNodesRef.current, currentEdgesRef.current))

    // Restore
    setNodes(snap.nodes)
    setEdges(snap.edges)
    changeTracker.restoreChanges(snap.trackedChanges)

    // Reset dedup key so the next action on the restored state can be captured.
    // Without this, the next pushSnapshot would see the same key and skip (dedup),
    // making the user's next action un-undoable.
    lastSnapshotKeyRef.current = ""

    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(true)
  }, [setNodes, setEdges]) // No isEnabled, no onBeforeUndo — both from refs

  /** Redo: restore the last undone snapshot */
  const redo = useCallback(() => {
    if (!isEnabledRef.current) return

    const snap = redoStackRef.current.pop()
    if (!snap) return

    // Push current state to undo
    undoStackRef.current.push(createSnapshot(currentNodesRef.current, currentEdgesRef.current))

    // Restore
    setNodes(snap.nodes)
    setEdges(snap.edges)
    changeTracker.restoreChanges(snap.trackedChanges)

    // Reset dedup key so the next action on the restored state can be captured
    lastSnapshotKeyRef.current = ""

    setCanUndo(true)
    setCanRedo(redoStackRef.current.length > 0)
  }, [setNodes, setEdges]) // No isEnabled — reads from ref

  /** Clear both undo and redo stacks (e.g., on reset to published, version load) */
  const clearHistory = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    lastSnapshotKeyRef.current = ""
    isPausedRef.current = false
    snapshotPushedThisBatchRef.current = false
    if (activeToastIdRef.current) {
      toast.dismiss(activeToastIdRef.current)
      activeToastIdRef.current = null
    }
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  return {
    trackedSetNodes,
    trackedSetEdges,
    snapshot,
    resumeTracking,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    activeToastIdRef, // For AI toast tracking — set this when showing AI toast
  }
}
