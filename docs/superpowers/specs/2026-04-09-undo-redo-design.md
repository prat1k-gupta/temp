# Undo/Redo in Flow Builder

## Goal

Canvas-level undo/redo that works transparently for all node and edge operations. A developer adding a new node type or edge handler should get undo/redo for free — no extra code required.

## Approach

Custom `useUndoRedo` hook. Snapshot-based. No new dependencies (no Zustand, no zundo).

## Core Principle: Intercept at the Root

All node/edge mutations flow through `setNodes` and `setEdges` from `useNodesState`/`useEdgesState` in `page.tsx`. The hook wraps these two setters — everything downstream gets undo/redo automatically.

```
page.tsx
  useNodesState() → [nodes, setNodes, onNodesChange]
  useEdgesState() → [edges, setEdges, onEdgesChange]
        ↓
  useUndoRedo(nodes, edges, setNodes, setEdges)
        ↓ returns
  { trackedSetNodes, trackedSetEdges, undo, redo, snapshot, canUndo, canRedo }
        ↓ passed to all hooks
  useNodeOperations(trackedSetNodes, trackedSetEdges, ...)
  useClipboard(trackedSetNodes, trackedSetEdges, ...)
  useFlowInteractions(trackedSetNodes, trackedSetEdges, ...)
  useFlowAI(trackedSetNodes, trackedSetEdges, ...)
```

**Which consumers get tracked vs raw setters:**
- **Tracked:** `useNodeOperations`, `useClipboard`, `useFlowInteractions`, `useFlowAI`, `importFlow` — all user-initiated canvas mutations
- **Raw (intentionally):** `useFlowPersistence`, `loadVersion`, `toggleViewDraft`, `toggleEditMode`, `resetToPublished` — mode switches and version loads that shouldn't create undo entries

New node types, new operations, new hooks — all go through `trackedSetNodes`/`trackedSetEdges`. Undo works without the author thinking about it.

## Snapshot Format

```typescript
interface UndoSnapshot {
  nodes: Node[]             // deep clone, stripped of ephemeral fields
  edges: Edge[]             // deep clone
  trackedChanges: FlowChange[]  // from changeTracker.getChanges()
}
```

### Cloning strategy

**Use `structuredClone()` for deep cloning.** Faster than `JSON.parse(JSON.stringify())` and handles more types.

**Prerequisite:** Migrate comment nodes to the render-time injection pattern first (bug fix #7 in this spec). Comment nodes currently store `onUpdate`/`onDelete` callbacks in `node.data` via `createCommentNode` — `structuredClone` throws on functions. After migration, all node data is serializable and `structuredClone` works cleanly. This is a small change (4 files, 5 call sites) and makes comment nodes consistent with every other node type.

### Stripping ephemeral fields

Before snapshotting, strip ReactFlow ephemeral properties from each node:
- `selected` — selection state is UI-only, undoing should not change selection
- `dragging` — transient drag state
- `measured` — ReactFlow's internal dimension cache

This prevents "phantom undo" where undoing an edit also changes which node is selected.

### Dedup comparison

Compare **only** `nodes` and `edges` for dedup, not `trackedChanges`. The `trackedChanges` array can differ between calls even when the canvas hasn't changed (due to changeTracker's internal debounce timers flushing).

**Strategy:** Cache the `JSON.stringify()` result of the last pushed snapshot. On the next push, stringify the new state and compare against the cached string. If equal, skip. This is O(n) per setter call — fine for flows up to ~200 nodes. If perf becomes an issue (profiling shows stringify as a bottleneck), switch to a dirty flag: set a `lastMutationIdRef` counter that increments on every `trackedSetNodes`/`trackedSetEdges` call, and skip dedup entirely — the counter guarantees uniqueness. For v1, stringify-based dedup is the correct trade-off (correctness over micro-optimization).

## Hook API

```typescript
function useUndoRedo(
  nodes: Node[],
  edges: Edge[],
  setNodes: SetNodes,
  setEdges: SetEdges,
  options?: {
    maxHistory?: number    // default 50
    isEnabled?: boolean    // gate on isEditMode
    onBeforeUndo?: () => void  // callback for cross-hook signaling (e.g., abort AI stagger)
  }
): {
  // Wrapped setters — use these everywhere instead of raw setNodes/setEdges
  trackedSetNodes: SetNodes
  trackedSetEdges: SetEdges

  // Manual snapshot — captures current state AND pauses auto-capture.
  // Always pair with resumeTracking() when the multi-step mutation is done.
  // Use for: paste, AI generate, bulk delete — any op with multiple setter calls.
  snapshot: () => void

  // Resumes auto-capture after a manual snapshot() call.
  resumeTracking: () => void

  // Undo/redo
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}
```

### Wrapping functional updaters

`setNodes` accepts both `Node[]` and `(prev: Node[]) => Node[]`. The tracked wrapper must handle both. Always convert to a functional updater to access the true current state:

```typescript
const trackedSetNodes = useCallback((updater) => {
  setNodes(prev => {
    // Guard: only push snapshot once per batch (not on StrictMode double-invoke)
    if (!snapshotPushedThisBatchRef.current) {
      pushSnapshot(prev, currentEdgesRef.current)
      snapshotPushedThisBatchRef.current = true
      queueMicrotask(() => { snapshotPushedThisBatchRef.current = false })
    }
    return typeof updater === 'function' ? updater(prev) : updater
  })
}, [setNodes])
```

This captures the true `prev` state inside the updater, avoiding stale closure issues. The `snapshotPushedThisBatchRef` guard prevents double-push from React StrictMode double-invocation and from batched `trackedSetNodes` + `trackedSetEdges` calls in the same microtask.

**Known limitation:** The microtask guard only collapses setter calls within the same microtask (synchronous code). If a logical operation spans multiple microtasks (e.g., `trackedSetNodes` → `await` → `trackedSetEdges`), two snapshots are created. This is acceptable because async multi-step operations should use manual `snapshot()` + `resumeTracking()` anyway (AI stagger, any future async ops). The auto-capture microtask guard is only for synchronous batches like `onConnect` which calls both setters in one handler.

### Auto vs manual snapshot capture

**Default: auto-capture.** Every `trackedSetNodes`/`trackedSetEdges` call snapshots before mutating. Developers don't think about it.

**Manual `snapshot()` for multi-step ops:** Call `snapshot()` before a sequence of mutations (AI, paste, bulk delete). This pauses auto-capture. Call `resumeTracking()` when done. No magic "next React commit" detection — explicit pause/resume.

```typescript
// Example: paste operation
snapshot()  // capture "before" state, pause auto-capture
trackedSetNodes(prev => [...prev, ...newNodes])
trackedSetEdges(prev => [...prev, ...newEdges])
resumeTracking()  // resume auto-capture
```

For async operations like AI stagger, `snapshot()` pauses and `resumeTracking()` is called after the stagger completes (or after abort).

## What Triggers a Snapshot

| Action | How | Who calls snapshot |
|--------|-----|-------------------|
| Add node (drop from sidebar) | `snapshot()` then `setNodes` | `useFlowInteractions.onDrop` |
| Delete node(s) | `snapshot()` then `setNodes`+`setEdges` | `useClipboard` delete handler |
| Delete edge(s) | `snapshot()` then `setEdges` | `useClipboard` delete handler (new) |
| Connect edge | auto via `trackedSetEdges` | ReactFlow `onConnect` |
| Reconnect edge | `snapshot()` on reconnect start | `onReconnectStart` (new) |
| Move node(s) | `snapshot()` on drag start | `onCanvasNodeDragStart` (new) |
| Paste | `snapshot()` then `setNodes`+`setEdges` | `useClipboard.pasteNodes` |
| AI generate/edit | `snapshot()` then stagger loop | `useFlowAI` |
| Inline text edit | `snapshot()` on focus | Node components |
| Properties panel edit | `snapshot()` on focus | Panel components |
| Node type conversion | auto via `trackedSetNodes` | `useNodeOperations.convertNode` |
| Import flow | auto via `trackedSetNodes` | `importFlow` |

## History Stack Rules

- **Max 50 entries** in undo stack
- **Redo stack clears** on any new action (standard behavior)
- **Stack resets** on page navigation (no persistence)
- **Gated on `isEnabled` (→ `isEditMode`)** — undo/redo is no-op in view mode
- **Duplicate suppression** — compare `nodes` + `edges` only (not `trackedChanges`). If snapshot equals top of stack, skip.
- **Undo during paused tracking** — if `undo()` is called while auto-capture is paused (e.g., mid-inline-edit), force `resumeTracking()` first, then undo. This prevents the pause from leaking — after undo, the system is back to normal auto-capture mode.

### Performance: `canUndo`/`canRedo` re-renders

Use `useRef` for undo/redo stacks. Only use `useState` for the `canUndo`/`canRedo` booleans. Update them only when they actually change (false→true on first push, true→false when stack empties). This prevents re-renders on every snapshot push when `canUndo` is already `true`.

## Keyboard Shortcuts

Added to existing `keydown` listener in `use-clipboard.ts`:

- `Cmd+Z` / `Ctrl+Z` → `undo()`
- `Cmd+Shift+Z` / `Ctrl+Shift+Z` → `redo()`

### Key event guard (expanded)

Skip undo/redo/delete when the active element (or any ancestor) matches:
- `<input>`, `<textarea>`, `[contenteditable]` (already guarded)
- `[role="dialog"]` (modals) — **new**
- `[data-panel="properties"]` (properties panel) — **new**
- `[role="listbox"]`, `[role="menu"]` (popovers/dropdowns) — **new**

This also fixes the existing bug where Delete key deletes a selected node while the user is typing in a modal or properties panel.

## Bug Fixes Bundled In

### 1. Wire `onCanvasNodeDragStart`

**Note:** `onNodeDragStart` already exists in `use-flow-interactions.ts` for sidebar-to-canvas drag (HTML5 drag API). ReactFlow's `<ReactFlow onNodeDragStart>` is a different API with different signature `(event, node, nodes) => void`. These must not be confused.

Wire a new callback directly on `<ReactFlow>`:
- `onNodeDragStart={onCanvasNodeDragStart}` → calls `snapshot()` (capture pre-drag state)
- `onNodeDragStop` → no-op (state already committed by ReactFlow's position updates)

This makes node movement undoable. Multi-select drag fires `onNodeDragStart` once with all dragged nodes in the third argument — the full-state snapshot captures all positions.

### 2. Fix multi-select delete double-fire + add edge deletion

ReactFlow's `deleteKeyCode` AND our keyboard handler both handle Delete. Set `deleteKeyCode={null}` on `<ReactFlow>` and handle deletion exclusively in our keyboard handler.

**Important:** `deleteKeyCode` also handles edge deletion. Since we're disabling it, add edge deletion to the custom keyboard handler. Get selected edges from the `edges` array passed to `useClipboard` (same as `nodes` — already available in scope): `edges.filter(e => e.selected)`. Delete them alongside selected nodes in the same `snapshot()` + `setNodes` + `setEdges` batch. One path, one snapshot.

### 3. AI stagger abort

Add an `abortRef` to the stagger loop in `handleApplyFlow` and `handleUpdateFlow`. The `useUndoRedo` hook accepts an `onBeforeUndo` callback. `useFlowAI` provides a function that sets `abortRef.current = true`:

```typescript
// In page.tsx:
const { undo, snapshot, ... } = useUndoRedo(nodes, edges, setNodes, setEdges, {
  onBeforeUndo: () => abortAIStaggerRef.current = true,
})

// In AI stagger loop:
for (const node of nodes) {
  if (abortRef.current) break
  await delay(150)
  setNodes(prev => [...prev, node])
}
```

The `snapshot()` call before the stagger captures the pre-AI state. If undo fires mid-stagger, `onBeforeUndo` sets the abort flag, the loop breaks, and the snapshot restores cleanly. Call `resumeTracking()` after the loop (or abort).

### 4. AI toast undo → unified

Remove closure-based undo from AI toast. Toast "Undo" button calls `undo()` from the shared hook. Dismiss the toast when any new undoable action occurs (new snapshot pushed) — track toast ID and call `toast.dismiss(toastId)` in `pushSnapshot`.

### 5. Replace `aiUndoStackRef`

Delete `aiUndoStackRef` entirely. AI operations use `snapshot()` + shared undo stack. One undo system for everything.

### 6. Paste fixes

- **Selection:** After paste, deselect all nodes, then select only pasted nodes
- **IDs:** Verify `nodeIdMap` generates unique IDs (research says it does, but user reports duplicates — investigate and fix)
- **Tracking:** Add `snapshot()` before paste, add `changeTracker.trackNodeAdd` / `trackEdgeAdd` for pasted items
- **updateDraftChanges:** Call after paste completes

### 7. Migrate comment node callbacks

Comment nodes (`createCommentNode` in `node-factory.ts`) store `onUpdate`/`onDelete` closures in `node.data`. This is inconsistent with all other nodes (which use render-time injection via `injectNodeCallbacks`). Migrate comment nodes to the same pattern:
- Remove `onUpdate`/`onDelete` from `createCommentNode`
- Add comment node cases to `injectNodeCallbacks`

This eliminates stale closure bugs and makes comment nodes compatible with `structuredClone()` — prerequisite for the undo/redo cloning strategy.

### 8. Wire `onReconnectStart` for edge reconnection

ReactFlow supports dragging an edge endpoint to a different node. Wire `onReconnectStart` on `<ReactFlow>` to call `snapshot()` before the reconnection is applied. This makes edge reconnection undoable.

## Inline Edit Grouping (Session-Based)

Use the simple approach: `snapshot()` on focus, dedup prevents duplicate entries.

1. **On focus** → call `snapshot()` to capture "before" state
2. **While typing** → mutations go through `trackedSetNodes`. Auto-capture fires but dedup sees that `nodes+edges` hasn't changed structurally since the focus snapshot... except it HAS changed (text content changed). So each `trackedSetNodes` call creates a new snapshot.

**Wait — this means every keystroke creates a new undo entry.** That's wrong.

**Correct approach:** Inline edit fields call `snapshot()` on focus (which also calls `resumeTracking: false` — i.e., auto-capture is paused). On blur, call `resumeTracking()`. During the edit session, `trackedSetNodes` calls from `updateNodeData` skip auto-snapshot because tracking is paused. The entire edit session is one undo step.

If another structural operation happens while a field is focused (e.g., user deletes a different node via context menu), the delete handler calls `snapshot()` explicitly — which forces a new undo entry despite the pause. The pause only suppresses *auto*-capture, not explicit `snapshot()` calls.

```typescript
// In a node's inline text field:
<input
  onFocus={() => { snapshot(); /* auto-capture now paused */ }}
  onBlur={() => { resumeTracking() }}
  onChange={(e) => updateNodeData(nodeId, { text: e.target.value })}
/>
```

## changeTracker Restoration

On undo/redo, after restoring nodes/edges:
1. Call `changeTracker.loadChanges(snapshot.trackedChanges)` to restore the changes array
2. `loadChanges()` sets `hasDirtyChanges = false` — after the call, set it back to `true` if the canvas differs from the saved state (compare against auto-save's `lastSavedRef`)
3. Call `updateDraftChanges()` to sync the draft

## Auto-Save Interaction

No changes to auto-save needed:
- Auto-save diffs `JSON.stringify({nodes, edges})` against `lastSavedRef`
- Undo updates nodes/edges → triggers auto-save effect → debounce cancels stale timer → saves undone state after 1s
- Undo back to saved state → snapshot matches `lastSavedRef` → auto-save skips (no-op)

## Testing

Unit tests for `useUndoRedo`:
- `snapshot → undo → redo` cycle
- Stack overflow at 50 (oldest entry dropped)
- Redo cleared on new action
- Duplicate snapshot suppression (nodes+edges dedup)
- Functional updater wrapping (snapshot captures `prev`)
- StrictMode double-invocation guard
- `trackedChanges` restored on undo
- `canUndo`/`canRedo` only re-render on actual change
- Manual `snapshot()` pauses auto-capture, `resumeTracking()` resumes

Integration tests:
- Add node → undo → canvas empty
- Delete node → undo → node restored with data and edges
- Delete edge → undo → edge restored
- Move node → undo → node returns to original position
- Paste → undo → pasted nodes removed, originals untouched
- AI generate → undo → pre-AI state restored
- Inline edit → undo → old text restored
- Mid-stagger undo → stagger aborts, pre-AI state restored
- Selection not affected by undo (ephemeral stripping)
- Comment node undo works (after callback migration)
- Edge reconnection → undo → edge restored to original target

## Files Changed

| File | Change |
|------|--------|
| `hooks/use-undo-redo.ts` | **New** — core hook |
| `app/flow/[id]/page.tsx` | Wire hook, pass wrapped setters to child hooks, wire `onCanvasNodeDragStart`/`onNodeDragStop`/`onReconnectStart`, set `deleteKeyCode={null}`, pass `onBeforeUndo` |
| `hooks/use-clipboard.ts` | Add Cmd+Z/Cmd+Shift+Z, expand key guard, add edge deletion, add `snapshot()` before paste, fix paste selection |
| `hooks/use-node-operations.ts` | No changes — receives `trackedSetNodes` automatically |
| `hooks/use-flow-interactions.ts` | Add `snapshot()` in `onDrop`, no other changes |
| `hooks/use-flow-ai.ts` | Remove `aiUndoStackRef`, add `snapshot()`+`resumeTracking()` around AI ops, add stagger abort ref, unify toast undo |
| `utils/node-factory.ts` | Remove `onUpdate`/`onDelete` from `createCommentNode` |
| `utils/node-data-injection.ts` | Add comment node callback injection cases |
| Node components (inline edit) | Add `onFocus={() => snapshot()}` and `onBlur={() => resumeTracking()}` to editable fields |
| `utils/change-tracker.ts` | No API changes — may need to expose `setDirty()` or adjust `loadChanges` to accept a `dirty` flag |

## Toolbar Buttons

Add undo/redo buttons to the flow canvas toolbar (near zoom controls or top bar). Uses `canUndo`/`canRedo` for disabled state, `undo()`/`redo()` on click. Tooltip shows keyboard shortcut (`Cmd+Z` / `Cmd+Shift+Z`). Minimal — two icon buttons with `Undo2` and `Redo2` from lucide-react.

## Out of Scope

- Persistent undo across navigation (resets on page leave)
- `beforeunload` prompt (pre-existing gap, separate PR)
- Multi-tab conflict detection (roadmap 3.8)
- Node resize undo (uncommon, add later if needed)
- Viewport (zoom/pan) undo (not expected by users, correct to exclude)
- Memory budget cap beyond entry count (3.5MB for 50 snapshots of 100 nodes is acceptable for v1)
