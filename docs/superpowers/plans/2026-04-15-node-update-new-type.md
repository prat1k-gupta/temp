# PR #3: `newType` on nodeUpdate + smart edge topology handling

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development.

**Goal:** Add `newType` to `nodeUpdate` so the AI can change a node's type in place, preserving node ID and incoming edges. Handle outgoing edges intelligently based on handle topology change. Teach the AI to pre-check and ask the user before ambiguous type changes.

**Architecture:**
- New optional `newType?: string` field on `NodeUpdate` (interface + zod)
- `applyNodeUpdates` branches on whether `newType` is a cross-type change vs a same-type content update
- Cross-type path uses factory defaults + new content (Option B from the design discussion), so stale fields from the old type get dropped cleanly
- Outgoing edge handling in cross-type path follows a three-case decision tree: preserve / fan-out / refuse-and-ask
- AI prompt teaches the model to pre-check via `get_node_connections` before cross-type edits and to ask the user before calling `apply_edit` for ambiguous contractions

**Tech stack:** TypeScript, Zod, Vitest. No new dependencies.

---

## What it solves

1. **Eliminates the fan-in loss bug class for type changes.** Remove + recreate is the root cause of fan-in edges getting dropped — the AI can't reference a newly-created node's ID in the same plan, so `addEdges` guesses and fails. In-place type change sidesteps the whole problem: node ID stays the same, incoming edges never disconnect.
2. **Eliminates ID guessing for type changes.** No new node means no ID to guess.
3. **Unblocks common edit operations.** Today the AI literally cannot reliably convert quickReply → interactiveList, question → quickReply, or quickReply → apiFetch. All three are common user requests.
4. **Preserves outgoing flow reachability in the expansion case.** When adding handles (question → quickReply), the old default edge fans out to every new button handle pointing at the same target, so the flow end-to-end still works even before the user differentiates buttons.
5. **Prevents silent data loss in the contraction case.** When removing handles (quickReply → question with N>1 button targets), the builder refuses the edit and prompts the AI to ask the user which target survives.
6. **Removes the misleading error suggestion.** `lib/ai/tools/generate-flow-edit.ts` currently tells the AI to "consider updating content in place via nodeUpdates" for type changes — but `nodeUpdates` can't change type today. After PR #3, that suggestion becomes accurate.

---

## What's in scope

- `newType` field on NodeUpdate (TypeScript + zod)
- Cross-type data replacement in `applyNodeUpdates` (factory reset + new content)
- Edge topology decision tree in the cross-type path
- **`localId` on NodeStep in chains** — the "create a new node and reference it from edges in the same plan" feature. Folded into PR #3 to close the entire fan-in loss bug class in one PR instead of two. See "localId design" section below.
- AI prompt rules and examples for both newType and localId
- Tests for each branch of the decision tree + localId resolution
- Updated `apply_edit` error suggestion text

## What's NOT in scope

- **Handle taxonomy naming cleanup** (`sync-next` → something clearer). Wire-format breaking, separate concern.
- **Web node support** — web is out of scope for PR #3. It's unified on `data.choices` as of PR #63 so it theoretically works, but the prompt and tests focus on whatsapp/instagram flows.

---

## localId design

Adds a `localId?: string` field to `NodeStep` (the node-creating step inside a chain). The AI assigns a temporary handle name, and references it in `addEdges` by prefixing with `localId:`:

```json
{
  "chains": [{
    "attachTo": "existing-branch-1",
    "steps": [{
      "step": "node",
      "nodeType": "whatsappMessage",
      "content": { "text": "Confirmation message" },
      "localId": "confirm"
    }]
  }],
  "addEdges": [
    { "source": "existing-branch-2-qr", "target": "localId:confirm", "sourceButtonIndex": 0 },
    { "source": "existing-branch-3-qr", "target": "localId:confirm", "sourceButtonIndex": 0 }
  ]
}
```

The builder:
1. Walks chains normally, creating nodes with generated IDs
2. Maintains a `localIdMap: Map<string, string>` that records `step.localId → generatedId` when a NodeStep with localId is processed
3. When processing `addEdges`, checks `source` and `target` for the `localId:` prefix and substitutes the generated ID
4. Validation:
   - Duplicate `localId` across a single plan → warning (second one wins, first is overwritten)
   - Reference to an unknown `localId` in addEdges → warning with `addEdge ` prefix (reuses existing fail-loud path)

**What it solves:** the rare case where the AI needs to add a BRAND NEW node that multiple existing nodes should point to (fan-in to a new node). Today this fails because the AI can't reference the new node's ID — it's generated at apply time. With localId, the AI assigns a stable handle and references it.

**Scope is small:** ~40 LOC across schema + builder + tests. The resolver is a trivial string substitution with one Map lookup. No complex edge cases — localId is only valid inside a single `apply_edit` plan (not across plans or tool calls).

---

## Files to modify

| File | Change |
|---|---|
| `types/flow-plan.ts` | Add `newType?: string` to `NodeUpdate` interface. Add to `nodeUpdateSchema` zod. |
| `utils/flow-plan-builder.ts` | In the `nodeUpdate` processing block inside `buildEditFlowFromPlan`, respect `update.newType` when calling `contentToNodeData` (use the target type, not the existing type). Pass `newType` through in the pushed `nodeUpdates` result. |
| `lib/ai/tools/generate-flow-edit.ts` | Rewrite `applyNodeUpdates` to branch on newType:<br>- **Same-type** (newType absent or equal): merge existing.data with update.data (current behavior).<br>- **Cross-type**: generate factory defaults via `createNode(newType, ...)`, overlay update.data, drop stale fields from the old type.<br>Apply the **edge topology check** in the same path — see decision tree below. Update the `apply_edit` error suggestion text to match the new capability. |
| `lib/ai/tools/flow-prompts.ts` | Add prompt rules: (1) use `nodeUpdate` with `newType` for type changes — no more remove+chain; (2) before calling `apply_edit` for a type change on a node with outgoing edges, call `get_node_connections` first and ask the user about edge mapping if ambiguous; (3) concrete examples for quickReply → interactiveList (auto fan-out preservation) and question → quickReply (auto fan-out to same target). |
| `utils/__tests__/flow-plan-builder.test.ts` | Tests for each branch. |
| `lib/ai/tools/__tests__/generate-flow.test.ts` | Snapshot-style test that the applyNodeUpdates cross-type branch exists, if we go that route. |

---

## Edge topology decision tree (the core new logic)

For every cross-type nodeUpdate (`newType !== existingNode.type`), run this before committing:

```
Collect: oldHandles (existing node's handle IDs used by outgoing edges)
Collect: newHandles (what the target type's handles look like after the content is applied)
Collect: outgoingEdges (existingEdges.filter(e => e.source === existingNode.id))

Case A: outgoingEdges.length === 0
  → Type change has no edge implications. Proceed.

Case B: Same topology (oldHandles is a subset of newHandles with identical IDs)
  → Preserve all outgoing edges as-is.
  → Common case: quickReply ↔ interactiveList (choice IDs identical)
  → Common case: cross-platform same-family (whatsappQuestion → instagramQuestion)

Case C: Expansion — newHandles has MORE handles than oldHandles, and the oldHandles (or default edge) are all still available in newHandles (or can fan out)
  → Fan out: for each unique target of the old outgoing edges, create N new edges
    (one per new button/choice handle) all pointing to that target.
  → Common case: question (1 default edge → msg-N) → quickReply with 3 choices
    produces 3 edges: choice-0 → msg-N, choice-1 → msg-N, choice-2 → msg-N.
  → Warning: "Type change added N new handles — all wired to the same target msg-N.
    Differentiate them if needed."

Case D: Contraction — newHandles has FEWER handles than oldHandles, and all old
  outgoing edges share the same target node
  → Collapse: drop the handle-specific routing, create a single edge on the new
    type's default/primary handle pointing at the shared target.
  → Common case: quickReply with 3 buttons all → msg-N, converting back to question
    produces 1 edge: question.default → msg-N.
  → No warning needed (unambiguous).

Case E: Contraction with DIFFERENT targets, OR new type's handles have no semantic
  mapping to the old type's handles (quickReply → apiFetch)
  → REFUSE the edit. Return:
    {
      success: false,
      error: "ambiguous_type_change",
      details: {
        nodeId: "...",
        oldType: "whatsappQuickReply",
        newType: "apiFetch",
        outgoingEdges: [
          { handle: "choice-a", target: "msg-A" },
          { handle: "choice-b", target: "msg-B" },
          { handle: "choice-c", target: "msg-C" },
        ],
        newHandles: ["success", "error"],
        message: "Converting quickReply to apiFetch changes 3 choice handles to
          success/error. I cannot determine which existing target should become
          success vs error. Please ask the user which targets should map to which
          new handles, or which should be dropped."
      }
    }
  → The AI sees this error and forwards the question to the user in chat.
```

---

## Cross-type data replacement (Option B from design)

```ts
function applyNodeUpdates(...): Node[] {
  return nodeUpdates.map((update) => {
    const existing = existingNodes.find(n => n.id === update.nodeId)
    if (!existing) return null

    const isTypeChange = update.newType && update.newType !== existing.type

    if (isTypeChange) {
      const factoryNode = createNode(update.newType!, platform, existing.position, existing.id)
      return {
        ...existing,
        type: factoryNode.type,
        data: { ...factoryNode.data, ...update.data },
      }
    }

    // Same-type content update: merge (current behavior)
    return {
      ...existing,
      type: update.newType || existing.type,
      data: { ...existing.data, ...update.data },
    }
  }).filter(Boolean) as Node[]
}
```

---

## Tasks

### Task 1: Add `newType` to the schema
- `types/flow-plan.ts`: add `newType?: string` to `NodeUpdate` interface, add to `nodeUpdateSchema` zod as `z.string().optional()`
- Tests: schema parses a nodeUpdate with newType, schema parses without it
- Commit

### Task 2: Update `contentToNodeData` usage in `flow-plan-builder.ts`
- In the nodeUpdate processing block of `buildEditFlowFromPlan`, when `update.newType` is set, pass it to `contentToNodeData` instead of the existing node type
- Pass `newType` through in the pushed `nodeUpdates` result so `applyNodeUpdates` can see it
- Commit

### Task 3: Update `applyNodeUpdates` for cross-type changes
- Branch on `newType !== existing.type`
- Cross-type path: factory defaults + new content (Option B)
- Same-type path: current merge behavior
- Tests for both paths
- Commit

### Task 4: Edge topology decision tree
- New helper: `classifyTypeChange(oldType, newType, outgoingEdges): 'preserve' | 'fanout' | 'collapse' | 'ambiguous'`
- For 'preserve' / 'fanout' / 'collapse': apply the edge transformation in the builder
- For 'ambiguous': return the refusal error
- Tests: each of the 5 cases (A/B/C/D/E)
- Commit

### Task 5: Update `apply_edit` error suggestion text
- `lib/ai/tools/generate-flow-edit.ts`: rewrite the suggestion in the `apply_edit` skip-warning fail-loud path to accurately describe the new options: (1) nodeUpdate with newType for type changes, (2) multiple chains for fan-in to new nodes, (3) NEVER guess IDs
- Commit

### Task 6: AI prompt rules
- `lib/ai/tools/flow-prompts.ts`:
  - Add "Type change via nodeUpdate" rule with example
  - Add "Pre-check outgoing edges via get_node_connections before type changes" rule
  - Add "Ask the user before apply_edit if the type change has ambiguous edge routing" rule
  - Remove the old "fan-in loss warning" that referenced remove+chain
- Commit

### Task 7: Integration tests + manual smoke
- E2E tests in `utils/__tests__/flow-plan-builder.test.ts` covering the 5 edge cases
- Manual smoke test: real AI chat session, convert a 3-button quickReply to a list, back to quickReply, to apiFetch, verify edge preservation / user prompts / refusals behave as expected
- Commit

### Task 8: Open PR and reviewer pass

---

## Verification checklist

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run test -- --run` — all tests pass
- [ ] New nodeUpdate with newType test fixtures
- [ ] Manual: quickReply → interactiveList preserves handle IDs and edges
- [ ] Manual: question → quickReply fans out single default edge to N button handles
- [ ] Manual: quickReply → question (all same target) collapses to one edge
- [ ] Manual: quickReply → apiFetch (different targets) refuses with ambiguous error, AI asks user
- [ ] Manual: the misleading suggestion text in generate-flow-edit.ts is replaced

---

## Why this scope (not more, not less)

We hashed out the design extensively in chat before writing this plan:
- **newType is essential** — it's the core fix for the fan-in loss bug class
- **Cross-type data replacement (Option B)** — anything less leaves stale fields around that break round-trip and confuse debugging
- **Edge topology handling** — without it, type changes silently mangle user flows
- **AI prompt teaching** — without it, the AI keeps falling into the remove+chain trap even though the tool now supports the better path
- **localId deferred** — 95% of fan-in loss is type changes; 5% is add-new-node-with-fan-in. Don't build what hasn't broken.
- **sync-next rename deferred** — wire-format breaking, separate concern
