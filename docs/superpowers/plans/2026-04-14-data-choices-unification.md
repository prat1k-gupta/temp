# data.choices unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split `data.buttons` (whatsappQuickReply) and `data.options` (whatsappInteractiveList) fields with a single canonical `data.choices` field across the entire choice-bearing surface, so the AI prompt, validator, and external MCP schema in Phase D see one clean field instead of two.

**Architecture:** Both node types stay distinct (users still pick `whatsappQuickReply` vs `whatsappInteractiveList` from the palette — they render differently on WhatsApp). Only the data field is unified. A `ChoiceData` interface replaces the parallel `ButtonData` / `OptionData` types on the data side. `contentToNodeData` always produces `data.choices` regardless of which legacy input field the AI sent. A one-shot load migration in `use-flow-persistence.ts` walks every node loaded from storage and renames `data.buttons` / `data.options` → `data.choices`. The auto-convert path (quickReply → interactiveList when count > 3) now only changes `node.type` — `data.choices` is left untouched, so handle IDs and labels survive the conversion intact. Three categories of dead code disappear: `convertButtonsToOptions` and its callers, the buttons↔options coercion in `contentToNodeData` / `transformAiNodeData`, and the `mixed_button_option_fields` validator rule.

**Tech Stack:** TypeScript, React/Next.js, Vitest, Zod, Vercel AI SDK. No new dependencies.

**Net LOC:** Negative — the deletion of `convertButtonsToOptions`, the coercion branches in flow-plan-builder.ts (~80 lines), the `mixed_button_option_fields` validator rule, and three CRITICAL prompt rules outweighs the additions.

**Scope (locked):** WhatsApp quickReply + interactiveList; Instagram quickReply; whatsapp/instagram/web question nodes that store transient `data.buttons` before conversion to quickReply.

**Out of scope (explicit follow-ups):** Web quickReply (`web-quick-reply-node.tsx`) and the action template-message-node — they're unrelated `data.buttons` consumers that don't go through the whatsapp-converter or the AI prompt's choice field. Migrating them would expand scope without addressing the underlying Phase D pain. They get their own follow-up PR after Phase D ships.

---

## File Structure

### Production code (modified)

| File | Responsibility after refactor |
|---|---|
| `types/index.ts` | Add `ChoiceData` interface. Keep `ButtonData` / `OptionData` for backward-compat callers (flagged deprecated). |
| `types/flow-plan.ts` | `NodeContent` gains `choices?: string[]`. Zod schema accepts all three (`choices`, `buttons`, `options`) for backward compat with un-updated AI prompt callers. |
| `utils/node-operations.ts` | Add `createChoiceData(text, index)` factory. Keep `createButtonData` / `createOptionData` deprecated. Delete `convertButtonsToOptions`. |
| `utils/flow-plan-builder.ts` | `contentToNodeData` always produces `data.choices` from any of the three input fields. New `readChoices(node)` helper for unified handle resolution. `nodeUpdate` processing drops the buttons↔options coercion (~80 lines deleted). Auto-convert path changes only `node.type` — leaves `data.choices` intact. `maybeAutoConvertToList` rewritten to not touch `data.choices`. |
| `utils/whatsapp-converter.ts` | Forward path reads `data.choices` (with fallback to `data.buttons`/`data.options` for legacy in-memory state). Reverse path produces `data.choices` instead of `data.buttons` / `data.options`. |
| `utils/node-factory.ts` | Default node data for whatsapp/instagram quickReply + interactiveList starts with `choices: []`. |
| `utils/flow-validator.ts` | Delete `mixed_button_option_fields` rule and the corresponding `FlowIssue.type` union member. Update `unconnected_button` rule to read from `data.choices`. |
| `utils/ai-data-transform.ts` | Drop the buttons↔options coercion branches. AI input still flows to `data.choices` via `contentToNodeData`. |
| `utils/index.ts` | Drop `convertButtonsToOptions` re-export. |
| `utils/flow-variables.ts` | If it reads `data.buttons` / `data.options` for variable suggestions, switch to `data.choices` (with legacy fallback). |
| `utils/node-data-injection.ts` | Same — switch any legacy reads to `data.choices`. |
| `hooks/use-flow-persistence.ts` | Add `migrateChoicesField(nodes)` migration alongside the existing `migrateApiFetchEdges` and `migrateSuperNodesToTemplates` migrations. Walks every node, if type is whatsappQuickReply / whatsappInteractiveList / instagramQuickReply and `data.buttons` or `data.options` exists, copies into `data.choices` and deletes the legacy field. Forward-only, idempotent. |
| `hooks/use-flow-ai.ts` | `onAcceptAISuggestion`: drop the list→quickReply conversion code that mutates `gc.options`/`gc.buttons` — the unified `choices` schema handles it via `contentToNodeData`. Drop the `convertButtonsToOptions` import. |
| `hooks/use-node-operations.ts` | If it uses `convertButtonsToOptions`, replace with the simpler "swap node type, leave data.choices alone" pattern. |
| `components/nodes/whatsapp/whatsapp-quick-reply-node.tsx` | `data.buttons` → `data.choices` everywhere. Local `buttons` const → `choices`. Handler names: `removeButton` → `removeChoice`, etc. UI strings unchanged ("Add Button" stays). Drop `convertButtonsToOptions` import — doConvertToList no longer maps buttons → options, just changes node type. |
| `components/nodes/whatsapp/whatsapp-list-node.tsx` | `data.options` → `data.choices`. Local `options` const → `choices`. Handler names: `removeOption` → `removeChoice`, etc. UI strings unchanged ("Add Option" stays). |
| `components/nodes/instagram/instagram-quick-reply-node.tsx` | Same as whatsapp-quick-reply-node migration. |
| `components/nodes/whatsapp/whatsapp-question-node.tsx` | Transient `manualButtons` state stored as `data.buttons` → `data.choices`. The `useEffect` sync between data and local state reads/writes `data.choices`. |
| `components/nodes/instagram/instagram-question-node.tsx` | Same. |
| `components/properties-panel.tsx` | If it edits buttons/options for whatsapp nodes, switch to `data.choices`. |
| `constants/node-categories.ts` | NODE_TEMPLATES `ai.contentFields` for whatsappQuickReply / whatsappInteractiveList / instagramQuickReply: replace `["buttons"]` / `["options"]` with `["choices"]`. |
| `lib/ai/core/node-documentation.ts` | `buildDataStructure` cases for the three node types: produce `choices: ChoiceData[]` instead of `buttons: ButtonData[]` / `options: OptionData[]`. |
| `lib/ai/tools/flow-prompts.ts` | Delete the CRITICAL "buttons vs options" rule. Delete the "Adding a new button/option" rule. Replace with one line: "Use `content.choices` for quickReply and interactiveList. Counts > 3 on quickReply auto-convert to interactiveList." |
| `lib/ai/tools/generate-flow-edit.ts` | Remove the `convertButtonsToOptions` reference (if any). Update the suggestion text to mention `choices` not `buttons`/`options`. |

### Tests (modified)

| File | Update |
|---|---|
| `utils/__tests__/flow-plan-builder.test.ts` | Update fixtures: nodes with `data.buttons`/`data.options` → `data.choices`. Update assertions. Add tests for the auto-convert path (only node.type changes, choices untouched). Update the existing `nodeUpdate target` test to use new shape. Drop the "coercion warnings" test added for N5 — coercion is gone. |
| `utils/__tests__/whatsapp-converter.test.ts` | Forward + reverse fixtures: input nodes use `data.choices`, output wire format unchanged (still `step.buttons` on the wire). Round-trip tests verify reverse produces `data.choices`. |
| `utils/__tests__/flow-validator.test.ts` | Drop `mixed_button_option_fields` test cases. Update `unconnected_button` test fixtures to use `data.choices`. |
| `utils/__tests__/ai-data-transform.test.ts` | Drop the coercion test cases. Verify `data.choices` is produced from any input shape. |
| `utils/__tests__/node-factory.test.ts` | Verify default data for whatsappQuickReply / whatsappInteractiveList / instagramQuickReply starts with `choices: []`. |
| `utils/__tests__/node-operations.test.ts` | Drop tests for `convertButtonsToOptions`. Add tests for `createChoiceData`. |
| `lib/ai/tools/__tests__/generate-flow.test.ts` | If fixtures reference buttons/options, update to choices. |
| `hooks/__tests__/flow-migrations.test.ts` | Add tests for the new `migrateChoicesField` migration: legacy buttons/options → choices, idempotent on already-migrated, untouched for non-choice node types. |
| `hooks/__tests__/use-undo-redo.test.ts` | If fixtures use data.buttons/data.options, switch to data.choices. |

### Tests (created)

None new beyond extensions to existing files.

### Files NOT in scope (called out for follow-up)

- `components/nodes/web/web-quick-reply-node.tsx` and `web-question-node.tsx` — web flows don't go through the whatsapp-converter and aren't in the AI prompt's choice schema. Separate refactor.
- `components/nodes/action/template-message-node.tsx` — uses `data.buttons` for WhatsApp template button definitions, which is a separate concept from quickReply choices.
- `components/template-builder.tsx` and `components/template-editor-modal.tsx` — same template button concept. Out of scope.
- `app/(dashboard)/templates/page.tsx` — references template buttons. Out of scope.

---

## Tasks

Each task is a self-contained checkpoint: code change + verification + commit. Tasks are ordered by dependency — earlier tasks set up types and primitives, later tasks consume them. Run `npx tsc --noEmit` and `npm run test -- --run` after each task and don't proceed if either fails.

### Test / verify pattern

After every crucial code change, the next step is one of:

1. **Write a unit test** — for new functions, behaviors, or invariants. Inline in the task.
2. **Run the existing test file for the touched code** — for refactors of code that already has tests. Inline command shown.
3. **Manual smoke test** — for UI components that don't have unit tests. The plan gives the exact steps: which Docker container, what to click, what to verify in the browser DevTools / on the canvas.

When a task has no automated test path (UI component changes), the manual test is **mandatory**, not optional. Don't move on to the next task until you've run the manual test and confirmed the behavior.

**Dev environment refresher:**
- App runs in Docker: `docker compose up` (port 3002)
- Logs: `docker logs magic-flow-app-1 --tail 100`
- Hot-reload is automatic — code edits propagate in ~2 seconds
- DevTools console is your friend for inspecting `data.choices` on rendered nodes (`document.querySelectorAll('[data-id]')` then read the React fiber, or use the React DevTools tab)

### Task 1: Add `ChoiceData` type and `createChoiceData` factory

**Files:**
- Modify: `types/index.ts`
- Modify: `utils/node-operations.ts`

- [ ] **Step 1: Add `ChoiceData` to `types/index.ts`**

After the `OptionData` interface (line 30), add:

```ts
/**
 * Unified shape for whatsappQuickReply / whatsappInteractiveList user choices.
 * Replaces the old split between ButtonData (quickReply) and OptionData (list)
 * on node `data` — both node types now store their items in `data.choices`.
 * The node type itself (quickReply vs interactiveList) still determines render
 * style, but the underlying data shape is the same.
 */
export interface ChoiceData {
  text: string
  id?: string  // stable handle ID
  label?: string  // legacy alias for text — preserved for backward-compat reads
  value?: string  // legacy backend value — preserved for converter round-trip
}
```

- [ ] **Step 2: Add `createChoiceData` factory to `utils/node-operations.ts`**

Update the import and append the new factory:

```ts
import type { Platform, ButtonData, OptionData, ChoiceData, NodeData } from "@/types"
```

After `createOptionData` (around line 20), append:

```ts
/**
 * Create choice data — canonical factory for whatsappQuickReply /
 * whatsappInteractiveList items. Both node types now store their items
 * in the unified `data.choices` field.
 */
export const createChoiceData = (text: string, index?: number): ChoiceData => ({
  text: text || `Option ${(index || 0) + 1}`,
  id: `choice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
})
```

Mark `createButtonData` and `createOptionData` with `@deprecated` JSDoc tags noting "Use createChoiceData. Kept for backward-compat callers."

- [ ] **Step 3: Write a unit test for `createChoiceData`**

Append to `utils/__tests__/node-operations.test.ts` (or create the describe block if absent):

```ts
import { createChoiceData } from "../node-operations"

describe("createChoiceData", () => {
  it("uses provided text", () => {
    const choice = createChoiceData("Yes")
    expect(choice.text).toBe("Yes")
  })

  it("falls back to indexed default when text is empty", () => {
    expect(createChoiceData("", 0).text).toBe("Option 1")
    expect(createChoiceData("", 2).text).toBe("Option 3")
  })

  it("generates an id with the choice- prefix", () => {
    const choice = createChoiceData("A")
    expect(choice.id).toMatch(/^choice-\d+-[a-z0-9]+$/)
  })

  it("generates unique ids across calls", () => {
    const a = createChoiceData("A")
    const b = createChoiceData("B")
    expect(a.id).not.toBe(b.id)
  })
})
```

- [ ] **Step 4: Run the new test**

```bash
npm run test -- --run utils/__tests__/node-operations.test.ts
```

Expected: 4 new tests pass, all existing tests still pass.

- [ ] **Step 5: Run tsc**

```bash
npx tsc --noEmit
```

Expected: clean exit (no new errors).

- [ ] **Step 6: Commit**

```bash
git add types/index.ts utils/node-operations.ts utils/__tests__/node-operations.test.ts
git commit -m "feat(types): add ChoiceData type + createChoiceData factory

Foundation for the buttons/options → choices unification. ChoiceData
replaces the parallel ButtonData / OptionData on the data side; both
old factories are flagged @deprecated but kept for backward-compat
callers that will be migrated in subsequent commits.

Includes 4 unit tests for createChoiceData covering text fallback,
ID prefix shape, and ID uniqueness."
```

---

### Task 2: Add `choices` field to `NodeContent` schema

**Files:**
- Modify: `types/flow-plan.ts`

- [ ] **Step 1: Add `choices` to `NodeContent` interface**

In the `NodeContent` interface (around line 49), add `choices` and mark the existing `buttons`/`options` deprecated:

```ts
export interface NodeContent {
  label?: string
  question?: string
  text?: string
  /** Canonical field for whatsappQuickReply / whatsappInteractiveList items. */
  choices?: string[]
  /** @deprecated AI may still send this for backward compat — mapped to choices. */
  buttons?: string[]
  /** @deprecated AI may still send this for backward compat — mapped to choices. */
  options?: string[]
  listTitle?: string
  // ... rest unchanged
```

- [ ] **Step 2: Add `choices` to `nodeContentSchema` zod schema**

In the zod schema (around line 94):

```ts
export const nodeContentSchema = z.object({
  label: z.string().optional(),
  question: z.string().optional(),
  text: z.string().optional(),
  // Canonical field for choice-bearing nodes (quickReply, interactiveList).
  // The legacy `buttons` / `options` fields are still accepted for backward
  // compat with AI prompts that haven't been updated yet — both are mapped
  // to `data.choices` by contentToNodeData.
  choices: z.array(z.string()).optional(),
  buttons: z.array(z.string()).optional(),
  options: z.array(z.string()).optional(),
  listTitle: z.string().optional(),
  // ... rest unchanged
```

- [ ] **Step 3: Verify tsc + tests**

```bash
npx tsc --noEmit && npm run test -- --run
```

Expected: tsc clean, all 755 tests still pass (no behavior change yet).

- [ ] **Step 4: Commit**

```bash
git add types/flow-plan.ts
git commit -m "feat(schema): accept content.choices alongside legacy buttons/options

NodeContent and nodeContentSchema gain optional 'choices' field. Both
legacy fields stay accepted for backward compat with AI prompts that
haven't been updated yet — contentToNodeData (next commit) maps any of
the three input fields to data.choices on output."
```

---

### Task 3: `contentToNodeData` produces `data.choices`

**Files:**
- Modify: `utils/flow-plan-builder.ts`

- [ ] **Step 1: Update import**

Replace the `node-operations` import:

```ts
import { createChoiceData, shouldConvertToList } from "./node-operations"
```

(Drop `createButtonData`, `createOptionData`, `convertButtonsToOptions` from this import — `convertButtonsToOptions` will be deleted in a later task.)

Update the type import to include `ChoiceData`:

```ts
import type { Platform, ButtonData, OptionData, ChoiceData, TemplateResolver } from "@/types"
```

- [ ] **Step 2: Rewrite the choice-producing block in `contentToNodeData`**

Find the existing block (around line 1007) that produces `data.buttons` and `data.options` from `content.buttons` / `content.options`. Replace with:

```ts
  // Map any of content.choices / content.buttons / content.options →
  // data.choices. The AI may still send the legacy field names; a single
  // canonical output field keeps the runtime data shape unified across
  // whatsappQuickReply and whatsappInteractiveList.
  const rawChoices = content.choices ?? content.buttons ?? content.options
  if (rawChoices && rawChoices.length > 0) {
    data.choices = rawChoices.map((text, i): ChoiceData => createChoiceData(text, i))
  }
```

- [ ] **Step 3: Add a unit test for the 3-input-shape mapping**

Append to `utils/__tests__/flow-plan-builder.test.ts`, in the existing `contentToNodeData` describe block:

```ts
describe("contentToNodeData — choices unification", () => {
  it("maps content.choices → data.choices", () => {
    const data = contentToNodeData({ choices: ["A", "B"] }, "whatsappQuickReply")
    const choices = data.choices as ChoiceData[]
    expect(choices).toHaveLength(2)
    expect(choices.map(c => c.text)).toEqual(["A", "B"])
  })

  it("maps legacy content.buttons → data.choices for backward compat", () => {
    const data = contentToNodeData({ buttons: ["Yes", "No"] }, "whatsappQuickReply")
    const choices = data.choices as ChoiceData[]
    expect(choices).toHaveLength(2)
    expect(choices.map(c => c.text)).toEqual(["Yes", "No"])
    expect(data.buttons).toBeUndefined()
  })

  it("maps legacy content.options → data.choices for backward compat", () => {
    const data = contentToNodeData({ options: ["X", "Y", "Z"] }, "whatsappInteractiveList")
    const choices = data.choices as ChoiceData[]
    expect(choices).toHaveLength(3)
    expect(choices.map(c => c.text)).toEqual(["X", "Y", "Z"])
    expect(data.options).toBeUndefined()
  })

  it("prefers content.choices when multiple input shapes are present", () => {
    const data = contentToNodeData(
      { choices: ["new"], buttons: ["old"], options: ["older"] },
      "whatsappQuickReply"
    )
    const choices = data.choices as ChoiceData[]
    expect(choices).toHaveLength(1)
    expect(choices[0].text).toBe("new")
  })

  it("produces no data.choices when no input is supplied", () => {
    const data = contentToNodeData({ question: "hi" }, "whatsappQuickReply")
    expect(data.choices).toBeUndefined()
    expect(data.question).toBe("hi")
  })
})
```

- [ ] **Step 4: Run the new test (and verify the rest of flow-plan-builder is still green for unrelated cases)**

```bash
npm run test -- --run utils/__tests__/flow-plan-builder.test.ts
```

Expected: the 5 new `contentToNodeData — choices unification` tests pass. Other tests in the same file may fail because their fixtures use `data.buttons` / `data.options` — that's expected, fixed in Task 10. Note the failing test names so you can verify they all clear at the end.

- [ ] **Step 5: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: tsc reports errors in:
- The `nodeUpdate` processing block (uses `data.buttons` / `data.options` reads)
- Helper paths in `walkSteps` (read `node.data?.buttons` / `node.data?.options`)
- `maybeAutoConvertToList` (mutates buttons → options)

These are fixed in Task 4. Don't commit yet.

---

### Task 4: Refactor `flow-plan-builder.ts` to use `data.choices` everywhere

**Files:**
- Modify: `utils/flow-plan-builder.ts`

- [ ] **Step 1: Add a `readChoices` helper near the top of the file**

After the `normalizeHandle` function (around line 22):

```ts
/**
 * Read a node's choice items from the canonical `data.choices` field,
 * falling back to the legacy `data.buttons` / `data.options` fields for
 * un-migrated nodes that exist in working memory before the load
 * migration runs (chiefly during tests). Production reads always go
 * through this helper.
 */
function readChoices(node: { data?: any } | undefined | null): ChoiceData[] {
  if (!node?.data) return []
  const data = node.data as { choices?: ChoiceData[]; buttons?: ChoiceData[]; options?: ChoiceData[] }
  return data.choices ?? data.buttons ?? data.options ?? []
}
```

- [ ] **Step 2: Replace the `nodeUpdate` processing block**

Find the current block (around lines 147-234) that does the buttons-vs-options coercion and ID preservation. Replace with:

```ts
  // Process nodeUpdates — convert content to node data, preserving existing
  // choice IDs by index. With the unified data.choices field, there's no
  // longer any buttons-vs-options coercion to do — contentToNodeData always
  // produces data.choices regardless of which input field the AI used.
  if (plan.nodeUpdates) {
    for (const update of plan.nodeUpdates) {
      const existingNode = existingNodes.find((n) => n.id === update.nodeId)
      if (!existingNode) {
        warnings.push(`nodeUpdate target "${update.nodeId}" not found — skipped`)
        continue
      }

      const baseType = existingNode.type || ""
      const baseNodeType = getBaseNodeType(baseType)
      const data = contentToNodeData(update.content, baseType)

      // Preserve existing choice IDs where possible (match by index)
      if (data.choices && existingNode.data.choices) {
        const existingChoices = existingNode.data.choices as ChoiceData[]
        data.choices = (data.choices as ChoiceData[]).map((c, i) => ({
          ...c,
          id: i < existingChoices.length && existingChoices[i].id
            ? existingChoices[i].id
            : c.id,
        }))
      }

      // Auto-convert quickReply → interactiveList when choices exceed the
      // platform's button limit. Only the node TYPE changes — data.choices
      // is left untouched so handle IDs and labels survive the conversion.
      if (baseNodeType === "quickReply" && data.choices) {
        const choices = data.choices as ChoiceData[]
        const conversion = shouldConvertToList(choices.length, platform)
        if (conversion.shouldConvert) {
          nodeUpdates.push({
            nodeId: update.nodeId,
            data: {
              ...data,
              listTitle: (data as any).listTitle || "Select an option",
              label: conversion.newLabel,
            },
            newType: conversion.newNodeType,
          })
          warnings.push(`nodeUpdate "${update.nodeId}": quickReply auto-converted to interactiveList (${choices.length} choices exceeds ${platform} limit)`)
          continue
        }
      }

      nodeUpdates.push({ nodeId: update.nodeId, data })
    }
  }
```

- [ ] **Step 3: Replace all the dual-read patterns in helper paths**

There are 7 places in `flow-plan-builder.ts` that read both `data.buttons` and `data.options` (verified by grep at plan time — line numbers below are accurate as of 2026-04-15; search by symbol name if they've drifted). Replace each with `readChoices(node)`:

**Pattern A (line 308, attachHandle resolution):**

```ts
// OLD:
const anchorButtons = (anchorNode.data?.buttons as ButtonData[] | undefined) || []
const anchorOptions = (anchorNode.data?.options as OptionData[] | undefined) || []
const resolved = anchorButtons[idx]?.id || anchorOptions[idx]?.id

// NEW:
const anchorChoices = readChoices(anchorNode)
const resolved = anchorChoices[idx]?.id
```

**Pattern B (line 434, connectTo edges from multi-output):**

```ts
// OLD:
const btns = (lastNode.data?.buttons as ButtonData[] | undefined) || []
const opts = (lastNode.data?.options as OptionData[] | undefined) || []
const handles = btns.length > 0 ? btns : opts
for (let i = 0; i < handles.length; i++) {
  const handleId = handles[i]?.id || `button-${i}`

// NEW:
const handles = readChoices(lastNode)
for (let i = 0; i < handles.length; i++) {
  const handleId = handles[i]?.id || `button-${i}`
```

**Pattern C (line 519, addEdges sourceButtonIndex resolution):**

```ts
// OLD:
const updatedData = updatedNodeData.get(newEdge.source)
const buttons = (updatedData?.buttons || sourceNode.data?.buttons) as ButtonData[] | undefined
const options = (updatedData?.options || sourceNode.data?.options) as OptionData[] | undefined
sourceHandle = buttons?.[newEdge.sourceButtonIndex]?.id
  || options?.[newEdge.sourceButtonIndex]?.id
  || `button-${newEdge.sourceButtonIndex}`

// NEW:
const updatedData = updatedNodeData.get(newEdge.source)
const choices = (updatedData?.choices ?? readChoices(sourceNode)) as ChoiceData[]
sourceHandle = choices[newEdge.sourceButtonIndex]?.id
  || `button-${newEdge.sourceButtonIndex}`
```

**Pattern D (line 540, addEdges "button-N" resolution):**

```ts
// OLD:
const updatedData = updatedNodeData.get(newEdge.source)
const buttons = (updatedData?.buttons || sourceNode.data?.buttons) as ButtonData[] | undefined
const options = (updatedData?.options || sourceNode.data?.options) as OptionData[] | undefined
const resolved = buttons?.[idx]?.id || options?.[idx]?.id

// NEW:
const updatedData = updatedNodeData.get(newEdge.source)
const choices = (updatedData?.choices ?? readChoices(sourceNode)) as ChoiceData[]
const resolved = choices[idx]?.id
```

**Pattern E (line 769, branch convergence — endpoint multi-output):**

```ts
// OLD:
const btns = (endpointNode.data?.buttons as ButtonData[] | undefined) || []
const opts = (endpointNode.data?.options as OptionData[] | undefined) || []
const handles = btns.length > 0 ? btns : opts
for (let i = 0; i < handles.length; i++) {
  const handleId = handles[i]?.id || `button-${i}`

// NEW:
const handles = readChoices(endpointNode)
for (let i = 0; i < handles.length; i++) {
  const handleId = handles[i]?.id || `button-${i}`
```

**Pattern F (line 817, direct convergence parent):**

```ts
// OLD:
const buttons = (parentNode?.data?.buttons as ButtonData[] | undefined) || []
const options = (parentNode?.data?.options as OptionData[] | undefined) || []
const handleCount = buttons.length || options.length || 1
for (let i = 0; i < handleCount; i++) {
  const handleId = buttons[i]?.id || options[i]?.id || `button-${i}`

// NEW:
const choices = readChoices(parentNode)
const handleCount = choices.length || 1
for (let i = 0; i < handleCount; i++) {
  const handleId = choices[i]?.id || `button-${i}`
```

**Pattern G (line 923, branch step button index resolution):**

```ts
// OLD:
const parentButtons = (parentNode.data?.buttons as ButtonData[] | undefined) || []
const parentOptions = (parentNode.data?.options as OptionData[] | undefined) || []
handleId = parentButtons[step.buttonIndex]?.id
  || parentOptions[step.buttonIndex]?.id
  || `button-${step.buttonIndex}`

// NEW:
const parentChoices = readChoices(parentNode)
handleId = parentChoices[step.buttonIndex]?.id || `button-${step.buttonIndex}`
```

- [ ] **Step 4: Rewrite `maybeAutoConvertToList`**

Find the function (line 1056). Replace with:

```ts
/**
 * Auto-convert quickReply → interactiveList when choices exceed platform
 * limit. Only the node TYPE is swapped — data.choices is left untouched so
 * handle IDs and labels survive the conversion. Mutates the node in place.
 * Returns the effective base nodeType after conversion.
 */
function maybeAutoConvertToList(
  node: Node,
  originalType: string,
  platform: Platform,
  warnings: string[]
): string {
  if (originalType !== "quickReply") return originalType

  const choices = readChoices(node)
  const limit = BUTTON_LIMITS[platform]

  if (choices.length <= limit) return originalType

  const conversion = shouldConvertToList(choices.length, platform)

  if (!conversion.shouldConvert) {
    // Can't convert (e.g., web doesn't have interactiveList) — trim choices
    node.data = { ...node.data, choices: choices.slice(0, limit) }
    warnings.push(`quickReply trimmed from ${choices.length} to ${limit} choices (${platform} limit)`)
    return originalType
  }

  // Convert: swap node type, keep data.choices intact
  try {
    const listNode = createNode("interactiveList", platform, node.position, node.id)
    node.type = listNode.type
    node.data = {
      ...listNode.data,
      ...node.data,
      listTitle: (node.data as any)?.listTitle || "Select an option",
    }
  } catch {
    // Fallback: trim choices if createNode fails
    node.data = { ...node.data, choices: choices.slice(0, limit) }
    warnings.push(`quickReply trimmed from ${choices.length} to ${limit} choices (createNode fallback)`)
    return originalType
  }

  warnings.push(`quickReply auto-converted to interactiveList: ${choices.length} choices exceeds ${platform} limit of ${limit}`)
  return "interactiveList"
}
```

- [ ] **Step 5: Update `findFreeHandle`**

Find the function (line 1108). Replace its body:

```ts
function findFreeHandle(
  anchorNode: Node,
  existingEdges: Edge[],
  newEdges: Edge[]
): string | undefined {
  const choices = readChoices(anchorNode)
  const allHandles = choices.map(c => c.id).filter(Boolean) as string[]
  if (allHandles.length === 0) return undefined

  const occupied = new Set<string>()
  for (const e of existingEdges) {
    if (e.source === anchorNode.id && e.sourceHandle) occupied.add(e.sourceHandle)
  }
  for (const e of newEdges) {
    if (e.source === anchorNode.id && e.sourceHandle) occupied.add(e.sourceHandle)
  }

  return allHandles.find(h => !occupied.has(h))
}
```

- [ ] **Step 6: Unify the ID-stamper in `utils/node-data-injection.ts`**

Find the legacy ID-stamping migration around lines 48-66. It currently has separate paths for `data.buttons` and `data.options`. Replace with a unified `data.choices` path:

```ts
// OLD:
if (Array.isArray(data.buttons)) {
  const allHaveIds = (data.buttons as ButtonData[]).every((btn) => !!btn.id)
  if (!allHaveIds) {
    data.buttons = (data.buttons as ButtonData[]).map((btn, i) => {
      if (btn.id) return btn
      return { ...btn, id: `btn-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}` }
    })
  }
}
if (Array.isArray(data.options)) {
  const allHaveIds = (data.options as OptionData[]).every((opt) => !!opt.id)
  if (!allHaveIds) {
    data.options = (data.options as OptionData[]).map((opt, i) => {
      if (opt.id) return opt
      return { ...opt, id: `opt-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}` }
    })
  }
}

// NEW:
if (Array.isArray(data.choices)) {
  const allHaveIds = (data.choices as ChoiceData[]).every((c) => !!c.id)
  if (!allHaveIds) {
    data.choices = (data.choices as ChoiceData[]).map((c, i) => {
      if (c.id) return c
      return { ...c, id: `choice-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}` }
    })
  }
}
```

Update the type imports at the top of the file:
```ts
import type { ChoiceData } from "@/types"
```

Drop `ButtonData` and `OptionData` imports if they're no longer used elsewhere in the file.

- [ ] **Step 7: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: clean. (Tests will still fail because fixtures use `data.buttons` / `data.options` — that's Task 10.)

- [ ] **Step 8: Commit**

```bash
git add utils/flow-plan-builder.ts utils/node-data-injection.ts
git commit -m "refactor(builder): produce data.choices and read via readChoices helper

contentToNodeData now always emits data.choices regardless of which
legacy input field the AI used. Six dual-read sites in flow-plan-builder
collapse to a single readChoices(node) helper. The nodeUpdate
processing path drops ~80 lines of buttons-vs-options coercion. The
auto-convert path (quickReply → interactiveList) now only swaps
node.type — data.choices stays put, so handle IDs survive.

node-data-injection's legacy ID stamper (which assigned stable handle
IDs to legacy buttons/options on first load) collapses to a single
data.choices path."
```

---

### Task 5: Update both whatsapp + instagram quickReply / list components

**Files:**
- Modify: `components/nodes/whatsapp/whatsapp-quick-reply-node.tsx`
- Modify: `components/nodes/whatsapp/whatsapp-list-node.tsx`
- Modify: `components/nodes/instagram/instagram-quick-reply-node.tsx`

For each component, the migration is mechanical:

**`whatsapp-quick-reply-node.tsx`:**

- [ ] **Step 1: Update the data read at line 36**

```ts
// OLD:
const buttons = data.buttons || []

// NEW:
const choices = data.choices ?? data.buttons ?? []  // legacy fallback for un-migrated nodes
```

- [ ] **Step 2: Rename references throughout the file**

Search for `buttons` (the local const) and rename to `choices`. Be careful with:
- `maxButtons` (a UI limit constant — KEEP as-is)
- `editingButtonValue`, `editingButtonIndex`, `improvingButtonIndex` (UI state — keep)
- `removeButton`, `startEditingButton`, `finishEditingButton`, `cancelEditingButton`, `handleImproveButton`, `handleShortenButton`, `handleUpdateButtons` (handler names — rename to `removeChoice`, etc.)
- `data.buttons` writes → `data.choices` writes
- `"Add Button"` UI string — KEEP as-is
- `Plus className="w-3 h-3 mr-1" /> Add Button` button label — KEEP

The UI labels stay because users still call them buttons on WhatsApp; only the internal data field is unified. The test for whether to rename a token: does it touch data shape or AI prompts? If yes, rename. If it's a UI string or shadcn nomenclature, keep.

- [ ] **Step 3: Drop `convertButtonsToOptions` import and rewrite `doConvertToList`**

Replace the `doConvertToList` function with:

```ts
const doConvertToList = (currentChoices: any[]) => {
  // Convert to List node — only the node type changes, data.choices is unchanged.
  if (data.onConvert) {
    data.onConvert(data.id, 'whatsappInteractiveList', {
      ...data,
      question: editingQuestionValue || data.question || "",
      choices: currentChoices,
    })
    toast.success('Upgraded to WhatsApp List!', {
      description: `Now you have ${currentChoices.length} choices (was limited to ${maxButtons} on Quick Reply)`
    })
  }
}
```

Drop the import:
```ts
// REMOVE:
import { convertButtonsToOptions } from "@/utils/node-operations"
```

- [ ] **Step 4: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: tsc errors only in the other components / consumers — this file should compile clean on its own.

- [ ] **Step 5: Apply the same migration to `whatsapp-list-node.tsx`**

Same pattern but with `data.options` → `data.choices` and `options` → `choices` for local variable names. Handler renames: `removeOption` → `removeChoice`, etc.

The component is simpler (no auto-convert button). Just rename data reads/writes.

- [ ] **Step 6: Apply the same migration to `instagram-quick-reply-node.tsx`**

Same pattern as whatsapp-quick-reply-node.

- [ ] **Step 7: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: still some errors in the consumers that read `data.buttons` / `data.options` (question nodes, validator, converter, properties-panel) — those are fixed in subsequent tasks. No new errors in the three component files.

- [ ] **Step 8: Commit**

```bash
git add components/nodes/whatsapp/whatsapp-quick-reply-node.tsx \
        components/nodes/whatsapp/whatsapp-list-node.tsx \
        components/nodes/instagram/instagram-quick-reply-node.tsx
git commit -m "refactor(nodes): switch quickReply/list components to data.choices

WhatsApp + Instagram quickReply/list components now read and write
data.choices instead of the split data.buttons / data.options. UI
strings ('Add Button', 'Add Option') stay because users still call them
that on each platform — only the internal field unifies. doConvertToList
no longer maps buttons → options; the conversion just swaps node type
and leaves data.choices intact."
```

- [ ] **Step 9: MANUAL TEST — quickReply read/edit/save round trip**

These components have no unit tests in the repo. Manual verification is mandatory.

```bash
docker compose up -d
docker logs magic-flow-app-1 --tail 20
```

Confirm the app is serving on port 3002. Then in your browser:

1. **Create flow:** open MagicFlow → New Flow → pick WhatsApp platform.
2. **Add quickReply:** drag a "Quick Reply" node onto the canvas. Verify it renders with no console errors. Open browser DevTools → Components tab → click the quickReply node → inspect its `data` object. **Expected:** `data.choices` exists (empty array `[]`). `data.buttons` should NOT exist.
3. **Add a button via the inline UI:** click "Add Button" on the node. Verify a new choice row appears. Inspect `data.choices` again. **Expected:** array now has one entry with `{ text: "Button 1", id: "choice-..." }`.
4. **Edit the button text:** click the button, type "Yes", press Enter. Inspect `data.choices`. **Expected:** the entry has `text: "Yes"`. The `id` should be unchanged from before the edit.
5. **Save the flow:** click the publish/save button. Reload the page. Inspect the quickReply node's data again. **Expected:** `data.choices` round-trips through save/load with the same IDs and text.
6. **Repeat steps 1-5 for WhatsApp List node** (drag a List node, add options, save, reload).
7. **Repeat for Instagram Quick Reply.**
8. **Console check:** `docker logs magic-flow-app-1 --tail 100 | grep -iE "error|warn"`. **Expected:** no new errors.

If any of these fail, **don't commit** — fix the component before moving on.

- [ ] **Step 10: MANUAL TEST — auto-convert quickReply → interactiveList**

This is the headline behavior. Test it explicitly:

1. Add a fresh whatsappQuickReply with 3 buttons (the limit).
2. Connect each button handle to a separate downstream message node (so all 3 button handles have outgoing edges).
3. Note the 3 button IDs from `data.choices` in DevTools (e.g., `choice-1700000000000-abc`, etc.). Note the edge `sourceHandle` IDs.
4. Click "Add Button" again — pushes count to 4, which exceeds the WhatsApp quickReply limit of 3.
5. **Expected:** the node auto-converts to whatsappInteractiveList. The visual style changes (now renders as a list).
6. **Critical assertion:** inspect the new list node's `data.choices`. The first 3 entries should have the **same IDs** as before the conversion. Their downstream edges should still work (no broken connections).
7. **Expected wire format check:** save the flow, then in the publish modal preview, verify the JSON has `step.buttons` with the same IDs you noted.

If handle IDs change or edges drop, **the auto-convert refactor regressed** — the whole point of Task 4's `maybeAutoConvertToList` rewrite is to preserve them. Fix and re-test.

---

### Task 5b: Migrate `properties-panel.tsx` to `data.choices`

**Files:**
- Modify: `components/properties-panel.tsx`

**Why a dedicated task:** The properties panel is a 3256-line component with **39 references** to `data.buttons` / `data.options` / `localButtons` / `localOptions` and their setters/effects/handlers. There are two parallel `useState` arrays, two `useEffect` sync blocks, separate add/remove/edit handlers for buttons vs options, and dedicated render sections for each. Folding this into a generic component task buries it; a dedicated task with explicit grep-driven steps gives the executor a clear target list and makes review tractable.

- [ ] **Step 1: Generate the full hit list**

```bash
grep -n "data\.buttons\|data\.options\|localButtons\|localOptions\|setLocalButtons\|setLocalOptions" \
  components/properties-panel.tsx
```

Expected: ~39 line numbers. Print the list and walk it top-to-bottom in the next steps.

- [ ] **Step 2: Unify the local state**

Find the two `useState` declarations (around line 932-933):

```ts
// OLD:
const [localButtons, setLocalButtons] = useState<any[]>(withIds(selectedNode.data.buttons || [], "button"))
const [localOptions, setLocalOptions] = useState<any[]>(withIds(selectedNode.data.options || [], "option"))

// NEW:
const [localChoices, setLocalChoices] = useState<any[]>(
  withIds(selectedNode.data.choices ?? selectedNode.data.buttons ?? selectedNode.data.options ?? [], "choice")
)
```

Update the `withIds` second-arg prefix to `"choice"` so generated IDs use the unified prefix. (If `withIds` is defined in this file, also update its implementation to take the new prefix.)

- [ ] **Step 3: Unify the sync useEffects**

Find the two effects (around line 936-942):

```ts
// OLD:
useEffect(() => {
  setLocalButtons(withIds(selectedNode.data.buttons || [], "button"))
}, [selectedNode.id, selectedNode.data.buttons])

useEffect(() => {
  setLocalOptions(withIds(selectedNode.data.options || [], "option"))
}, [selectedNode.id, selectedNode.data.options])

// NEW:
useEffect(() => {
  setLocalChoices(
    withIds(selectedNode.data.choices ?? selectedNode.data.buttons ?? selectedNode.data.options ?? [], "choice")
  )
}, [selectedNode.id, selectedNode.data.choices])
```

The dependency drops the legacy fields — once the load migration runs, `data.choices` is the only field that changes.

- [ ] **Step 4: Walk every other hit from Step 1**

For each remaining line:
- Local variable references `localButtons` / `localOptions` → `localChoices`
- Setter calls `setLocalButtons` / `setLocalOptions` → `setLocalChoices`
- Read accesses `selectedNode.data.buttons` / `selectedNode.data.options` → `selectedNode.data.choices ?? selectedNode.data.buttons ?? selectedNode.data.options` for in-render reads (legacy fallback for one render cycle), or `selectedNode.data.choices` for write paths
- Write paths via `onNodeUpdate` or similar → write to `data.choices`, NOT `data.buttons` / `data.options`. Make sure no write site leaves the legacy fields populated.
- UI labels ("Add Button", "Options (Max 10)", etc.) → KEEP unchanged (these are user-facing nomenclature per platform)

- [ ] **Step 5: Search for handler functions that may have been parallel**

```bash
grep -n "addButton\|addOption\|removeButton\|removeOption\|updateButton\|updateOption" \
  components/properties-panel.tsx
```

Each pair of handlers (one for buttons, one for options) collapses to a single handler that operates on `localChoices`. Rename to `addChoice` / `removeChoice` / `updateChoice`. Keep the body identical except for the field name.

- [ ] **Step 6: Verify zero residual references**

```bash
grep -n "localButtons\|localOptions\|setLocalButtons\|setLocalOptions" \
  components/properties-panel.tsx
```

Expected: zero hits.

```bash
grep -n "data\.buttons\|data\.options" components/properties-panel.tsx
```

Expected: zero hits in WRITE positions. May still have hits in the in-render legacy fallback reads (acceptable — the migration handles them).

- [ ] **Step 7: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: no errors in properties-panel.tsx.

- [ ] **Step 8: Commit**

```bash
git add components/properties-panel.tsx
git commit -m "refactor(properties-panel): unify local state to localChoices

The properties panel had two parallel useState arrays (localButtons,
localOptions), two sync useEffects, and parallel add/remove/edit
handlers — all of which collapse to a single localChoices/setLocalChoices
pair operating on the unified data.choices field. UI labels stay
unchanged (still say 'Add Button' / 'Options (Max 10)' per platform
nomenclature) — only the internal state and write paths unify."
```

- [ ] **Step 9: MANUAL TEST — properties panel edits sync to canvas**

The properties panel has no unit tests. Verify in-browser:

1. Open MagicFlow, create a flow with a whatsappQuickReply node.
2. Click the node to select it. The properties panel opens on the right.
3. **Add a choice via the panel:** click "Add Button" inside the properties panel. **Expected:** the new choice appears both in the panel AND on the canvas node. Inspect `data.choices` in DevTools — should have one new entry.
4. **Edit a choice text via the panel:** click the choice text input, type "Updated", blur. **Expected:** the canvas node updates to show "Updated". `data.choices[i].text === "Updated"`.
5. **Remove a choice via the panel:** click the trash/X button next to a choice. **Expected:** the choice disappears from both panel and canvas. `data.choices` length decreases.
6. **Switch to a different node and back:** click another node, then click back to the quickReply. **Expected:** the panel re-syncs and shows the current choices (the `useEffect` sync block).
7. **Repeat for whatsappInteractiveList** (uses the same properties panel surface, but as a list).
8. **Save the flow:** click save, reload the page. Reopen the same node. **Expected:** all choices persist with the same text and IDs.

If the panel and canvas get out of sync, the `setLocalChoices` calls or the `useEffect` dependency array is wrong. Fix before moving on.

---

### Task 6: Update question nodes that store transient buttons

**Files:**
- Modify: `components/nodes/whatsapp/whatsapp-question-node.tsx`
- Modify: `components/nodes/instagram/instagram-question-node.tsx`

- [ ] **Step 1: Update whatsapp-question-node.tsx**

Find the `manualButtons` state declaration (around line 27):

```ts
// OLD:
const [manualButtons, setManualButtons] = useState<ButtonData[]>(data.buttons || [])

// NEW:
const [manualChoices, setManualChoices] = useState<ChoiceData[]>(data.choices ?? data.buttons ?? [])
```

Update the type import to use `ChoiceData`. Search for all `manualButtons` references and rename to `manualChoices`. Update the sync `useEffect` to use `data.choices`:

```ts
useEffect(() => {
  if (data.choices && JSON.stringify(data.choices) !== JSON.stringify(manualChoices)) {
    setManualChoices(data.choices)
  }
}, [data.choices])
```

When the question converts to quickReply (the existing logic), the conversion call should write `data.choices`, not `data.buttons`.

- [ ] **Step 2: Apply the same migration to instagram-question-node.tsx**

- [ ] **Step 3: Verify tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/nodes/whatsapp/whatsapp-question-node.tsx \
        components/nodes/instagram/instagram-question-node.tsx
git commit -m "refactor(nodes): question nodes store transient choices in data.choices

The manualButtons/manualChoices state on question nodes (used for the
button-driven question → quickReply conversion) now lives in
data.choices to match the unified field name. Functionally identical."
```

- [ ] **Step 5: MANUAL TEST — question → quickReply conversion**

1. Add a fresh whatsappQuestion node to a canvas.
2. Click "Add Button" on the question node (the inline button-add affordance).
3. **Expected:** the question node converts into a whatsappQuickReply. Inspect `data.choices` in DevTools — should have one entry.
4. Add 2 more buttons (total 3, the limit). Verify all 3 choices have stable IDs that don't change as you add more.
5. Save and reload. Verify the converted node persists as a quickReply with `data.choices` populated.
6. Repeat for instagramQuestion → instagramQuickReply.

If the conversion drops the buttons or the IDs change unexpectedly, the `manualChoices` state or the conversion call site is wrong.

---

### Task 7: Update the whatsapp-converter forward + reverse paths

**Files:**
- Modify: `utils/whatsapp-converter.ts`

- [ ] **Step 1: Update the forward path for whatsappQuickReply (around line 285)**

```ts
// OLD:
case "whatsappQuickReply":
case "quickReply": {
  step.message_type = "buttons"
  const buttons = (data.buttons || []) as Array<{ id?: string; text?: string; label?: string }>
  step.buttons = buttons.map((btn, idx) => ({
    id: btn.id || `btn-${idx}`,
    title: btn.text || btn.label || `Button ${idx + 1}`,
  }))
  // ... conditional_next using buttons
  for (const btn of buttons) {
    const btnId = btn.id || `btn-${buttons.indexOf(btn)}`
    // ...
  }

// NEW:
case "whatsappQuickReply":
case "quickReply": {
  step.message_type = "buttons"
  const choices = (data.choices ?? data.buttons ?? []) as Array<{ id?: string; text?: string; label?: string }>
  step.buttons = choices.map((c, idx) => ({
    id: c.id || `btn-${idx}`,
    title: c.text || c.label || `Button ${idx + 1}`,
  }))
  // ... conditional_next using choices
  for (const c of choices) {
    const cId = c.id || `btn-${choices.indexOf(c)}`
    // ...
  }
```

- [ ] **Step 2: Update the forward path for whatsappInteractiveList (around line 319)**

Same pattern with `data.options` → `data.choices ?? data.options`. Local variable `options` → `choices`.

- [ ] **Step 3: Update the reverse path (around line 755)**

```ts
// OLD:
case "whatsappQuickReply":
  data.question = step.message
  data.buttons = (step.buttons || []).map((btn) => ({ ... }))
  // ...
  break
case "whatsappInteractiveList":
  data.question = step.message
  data.options = (step.buttons || []).map((btn) => ({ ... }))
  // ...
  break

// NEW:
case "whatsappQuickReply":
  data.question = step.message
  data.choices = (step.buttons || []).map((btn) => ({
    id: btn.id,
    text: btn.title,
    label: btn.title,
    value: btn.title.toLowerCase().replace(/\s+/g, "_"),
  }))
  // ...
  break
case "whatsappInteractiveList":
  data.question = step.message
  data.choices = (step.buttons || []).map((btn) => ({
    id: btn.id,
    text: btn.title,
  }))
  // ...
  break
```

- [ ] **Step 4: Update the `instagramQuickReply` forward case at line 452**

The instagramQuickReply case (lines 452-479) is identical structure to whatsappQuickReply — it reads `data.buttons`, maps to `step.buttons` on the wire, and resolves conditional_next from button IDs. Migrate it to `data.choices` the same way:

```ts
// OLD:
case "instagramQuickReply": {
  step.message_type = "buttons"
  step.input_type = "button"
  const igButtons = (data.buttons || []) as Array<{ id?: string; text?: string; label?: string }>
  step.buttons = igButtons.map((btn, idx) => ({
    id: btn.id || `btn-${idx}`,
    title: btn.text || btn.label || `Button ${idx + 1}`,
  }))
  const igConditionalNext: Record<string, string> = {}
  for (const btn of igButtons) {
    const btnId = btn.id || `btn-${igButtons.indexOf(btn)}`
    // ...
  }

// NEW:
case "instagramQuickReply": {
  step.message_type = "buttons"
  step.input_type = "button"
  const igChoices = (data.choices ?? data.buttons ?? []) as Array<{ id?: string; text?: string; label?: string }>
  step.buttons = igChoices.map((c, idx) => ({
    id: c.id || `btn-${idx}`,
    title: c.text || c.label || `Button ${idx + 1}`,
  }))
  const igConditionalNext: Record<string, string> = {}
  for (const c of igChoices) {
    const cId = c.id || `btn-${igChoices.indexOf(c)}`
    // ...
  }
```

The reverse path for `instagramQuickReply` (if one exists in the file) gets the same treatment as whatsappQuickReply — produces `data.choices`.

- [ ] **Step 5: Verify tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Run the converter test file**

```bash
npm run test -- --run utils/__tests__/whatsapp-converter.test.ts
```

Expected: existing converter tests may fail because their fixtures use `data.buttons` / `data.options` — those will be migrated in Task 10. **Note** which tests fail. The new round-trip tests added in Task 10 step 8 will only pass after this commit.

- [ ] **Step 7: MANUAL TEST — wire format round-trip**

The wire format is opaque from inside the codebase. Test it end-to-end:

1. In the browser, create a flow with a whatsappQuickReply containing 3 choices ("Yes", "No", "Maybe"). Note their IDs in DevTools.
2. Save the flow. Open the publish modal. Click "Preview JSON" (or whatever the modal calls the JSON viewer).
3. **Expected:** the JSON shows a `step.buttons` array with the 3 entries. Each `step.buttons[i].id` matches the corresponding `data.choices[i].id` you noted.
4. Publish the flow (or close the modal — depends on what's safe in your environment).
5. Reload the flow. Inspect the quickReply node in DevTools.
6. **Expected:** `data.choices` round-trips with the SAME IDs and text.
7. **Same test for whatsappInteractiveList** — create one with 5 options, publish, reload, verify IDs survive.

If the publish JSON has missing/different IDs, the forward path is wrong. If the reload loses IDs, the reverse path is wrong.

- [ ] **Step 8: Commit**

```bash
git add utils/whatsapp-converter.ts
git commit -m "refactor(converter): forward and reverse use data.choices

Forward: read data.choices ?? data.buttons / data.options for both
quickReply and interactiveList — wire format unchanged (still emits
step.buttons). Reverse: produce data.choices regardless of node type.
The instagramQuickReply case at line 452 gets the same treatment."
```

---

### Task 8: Update node-factory, node-categories, node-documentation, AI prompts, validator

**Files:**
- Modify: `utils/node-factory.ts`
- Modify: `constants/node-categories.ts`
- Modify: `lib/ai/core/node-documentation.ts`
- Modify: `lib/ai/tools/flow-prompts.ts`
- Modify: `utils/flow-validator.ts`
- Modify: `utils/ai-data-transform.ts`
- Modify: `utils/flow-variables.ts`
- Modify: `hooks/use-flow-ai.ts`
- Modify: `lib/ai/tools/generate-flow-edit.ts`

(properties-panel.tsx is migrated in Task 5b — not part of this task.)

- [ ] **Step 1: `utils/node-factory.ts` — default data starts with `choices: []`**

Find the cases for `whatsappQuickReply`, `whatsappInteractiveList`, `instagramQuickReply`. Replace `buttons: []` / `options: []` defaults with `choices: []`.

- [ ] **Step 2: `constants/node-categories.ts` — NODE_TEMPLATES contentFields**

Find the entries for the three node types. Replace `["buttons"]` / `["options"]` in `ai.contentFields` with `["choices"]`.

- [ ] **Step 3: `lib/ai/core/node-documentation.ts` — buildDataStructure**

Find the cases for the three node types. Replace the `buttons: ButtonData[]` / `options: OptionData[]` data structure descriptions with `choices: ChoiceData[]`.

- [ ] **Step 4: `lib/ai/tools/flow-prompts.ts` — delete CRITICAL rules, add choices rule**

Search for the "buttons vs options" CRITICAL rule and the "Adding a new button/option" rule. Delete both. Add (in the appropriate section):

```
- Use `content.choices` (string[]) for both whatsappQuickReply and
  whatsappInteractiveList nodes. The system unifies the field — you do
  NOT need to choose between `buttons` and `options`. If a quickReply has
  more than 3 choices, it auto-converts to interactiveList.
```

- [ ] **Step 5: `utils/flow-validator.ts` — delete `mixed_button_option_fields` rule**

Delete the case (around line 144) that emits `mixed_button_option_fields`. Delete the type union member at line 16 (`| "mixed_button_option_fields"`).

Update the `unconnected_button` rule to read from `data.choices` instead of `data.buttons` / `data.options`.

- [ ] **Step 6: `utils/ai-data-transform.ts` — drop coercion branches**

Find the `transformAiNodeData` function. Drop the buttons↔options coercion branches. The function should now produce `data.choices` from any input shape (delegating to `contentToNodeData` if appropriate, or directly mapping).

- [ ] **Step 7: `hooks/use-flow-ai.ts` — drop the conversion in onAcceptAISuggestion**

Find `onAcceptAISuggestion` (around line 756). Find this block:

```ts
// Auto-convert list→quickReply when ≤3 options (WhatsApp/Instagram button limit)
const gc = suggestion.generatedContent
if (normalizedType === "list" && gc?.options && gc.options.length <= BUTTON_LIMITS[platform]) {
  normalizedType = "quickReply"
  // Convert options → buttons format
  gc.buttons = gc.options.map((o: any) => ({ text: o.text || o }))
  delete gc.options
}
```

Replace with:

```ts
// Auto-convert list→quickReply when ≤3 choices (WhatsApp/Instagram limit).
// The choices field is unified across both types so no field rename needed.
const gc = suggestion.generatedContent
if (normalizedType === "list" && gc?.choices && gc.choices.length <= BUTTON_LIMITS[platform]) {
  normalizedType = "quickReply"
}
```

Find the NodeContent construction below it:

```ts
const content: NodeContent = {
  label: gc?.label,
  question: gc?.question,
  text: gc?.text,
  buttons: gc?.buttons?.map((b: any) => b.text || b.label || ""),
  options: gc?.options?.map((o: any) => o.text || ""),
}
```

Replace with:

```ts
const content: NodeContent = {
  label: gc?.label,
  question: gc?.question,
  text: gc?.text,
  choices: gc?.choices?.map((c: any) => c.text || c.label || c)
    ?? gc?.buttons?.map((b: any) => b.text || b.label || "")
    ?? gc?.options?.map((o: any) => o.text || ""),
}
```

Drop the import of `convertButtonsToOptions` if present.

- [ ] **Step 8: `lib/ai/tools/generate-flow-edit.ts` — update suggestion text**

If the file references `buttons`/`options` in error messages or suggestion strings (e.g., the `apply_edit` rollback message), update them to say `choices`.

- [ ] **Step 9: `utils/flow-variables.ts` — variable extraction reads `data.choices`**

Find the block that walks `data.buttons` for variable references (around line 292):

```ts
// OLD:
if (Array.isArray(data.buttons)) {
  for (const btn of data.buttons) {
    if (typeof btn.text === "string") allRefs.push(...extractVariableReferences(btn.text))
  }
}

// NEW:
if (Array.isArray(data.choices)) {
  for (const c of data.choices) {
    if (typeof c.text === "string") allRefs.push(...extractVariableReferences(c.text))
  }
}
```

If a parallel block exists for `data.options`, drop it (it's now redundant since both shapes flow through `data.choices`).

- [ ] **Step 10: Verify tsc**

```bash
npx tsc --noEmit
```

Expected: clean — all consumers should now reference `data.choices` (or the legacy fallback in helper helpers).

- [ ] **Step 11: Commit**

```bash
git add utils/node-factory.ts constants/node-categories.ts \
        lib/ai/core/node-documentation.ts lib/ai/tools/flow-prompts.ts \
        utils/flow-validator.ts utils/ai-data-transform.ts \
        utils/flow-variables.ts hooks/use-flow-ai.ts \
        lib/ai/tools/generate-flow-edit.ts
git commit -m "refactor: switch factories, validator, AI prompts, and consumers to data.choices

Node factories produce data.choices defaults. NODE_TEMPLATES content
fields and node-documentation buildDataStructure reference choices.
Validator drops the mixed_button_option_fields rule entirely (it can
no longer fire). AI prompt drops the CRITICAL buttons-vs-options rule
and the 'adding a new button/option' rule, replaced by one line about
content.choices. ai-data-transform drops the coercion branches.
flow-variables reads data.choices when extracting variable refs.
use-flow-ai uses choices in suggestion content."
```

---

### Task 9: Add the load migration in use-flow-persistence.ts

**Files:**
- Modify: `hooks/use-flow-persistence.ts`
- Modify: `hooks/__tests__/flow-migrations.test.ts`

- [ ] **Step 1: Add `migrateChoicesField` to `use-flow-persistence.ts`**

Alongside the existing `migrateApiFetchEdges` and `migrateSuperNodesToTemplates` exports, add:

```ts
const CHOICE_NODE_TYPES = new Set([
  "whatsappQuickReply",
  "whatsappInteractiveList",
  "instagramQuickReply",
  "whatsappQuestion",
  "instagramQuestion",
])

/**
 * Migrate legacy `data.buttons` / `data.options` fields to the unified
 * `data.choices` field on choice-bearing node types. Forward-only,
 * idempotent — nodes already on `data.choices` are untouched. Runs once
 * per flow load.
 */
export function migrateChoicesField(nodes: Node[]): { migrated: boolean; nodes: Node[] } {
  let migrated = false
  const result = nodes.map((node) => {
    if (!CHOICE_NODE_TYPES.has(node.type || "")) return node
    const data = node.data as any
    if (data.choices) return node // already migrated
    const legacy = data.buttons ?? data.options
    if (!legacy || !Array.isArray(legacy) || legacy.length === 0) return node

    migrated = true
    const { buttons: _b, options: _o, ...rest } = data
    return {
      ...node,
      data: {
        ...rest,
        choices: legacy,
      },
    }
  })
  return { migrated, nodes: result }
}
```

Wire it into the existing migration pipeline (find where `migrateApiFetchEdges` and `migrateSuperNodesToTemplates` are called on flow load):

```ts
// In the flow-load function (e.g., loadFlow or similar):
const choicesMigration = migrateChoicesField(nodes)
if (choicesMigration.migrated) {
  nodes = choicesMigration.nodes
  console.log("[flow-load] Migrated legacy buttons/options → data.choices")
}
```

- [ ] **Step 2: Add migration tests to `hooks/__tests__/flow-migrations.test.ts`**

Append a new describe block:

```ts
import { migrateChoicesField } from "../use-flow-persistence"

describe("migrateChoicesField", () => {
  it("returns migrated: false when there are no choice-bearing nodes", () => {
    const nodes = [node("1", "start"), node("2", "message")]
    const result = migrateChoicesField(nodes)
    expect(result.migrated).toBe(false)
  })

  it("renames data.buttons → data.choices for whatsappQuickReply", () => {
    const nodes = [node("1", "whatsappQuickReply", {
      buttons: [{ id: "btn-a", text: "A" }, { id: "btn-b", text: "B" }],
    })]
    const result = migrateChoicesField(nodes)
    expect(result.migrated).toBe(true)
    const data = result.nodes[0].data as any
    expect(data.choices).toEqual([{ id: "btn-a", text: "A" }, { id: "btn-b", text: "B" }])
    expect(data.buttons).toBeUndefined()
  })

  it("renames data.options → data.choices for whatsappInteractiveList", () => {
    const nodes = [node("1", "whatsappInteractiveList", {
      options: [{ id: "opt-a", text: "A" }],
    })]
    const result = migrateChoicesField(nodes)
    expect(result.migrated).toBe(true)
    const data = result.nodes[0].data as any
    expect(data.choices).toEqual([{ id: "opt-a", text: "A" }])
    expect(data.options).toBeUndefined()
  })

  it("is idempotent on already-migrated nodes", () => {
    const nodes = [node("1", "whatsappQuickReply", {
      choices: [{ id: "c-1", text: "A" }],
    })]
    const result = migrateChoicesField(nodes)
    expect(result.migrated).toBe(false)
    expect(result.nodes[0]).toBe(nodes[0])
  })

  it("does not touch non-choice node types", () => {
    const nodes = [node("1", "message", { buttons: [{ text: "A" }] })]
    const result = migrateChoicesField(nodes)
    expect(result.migrated).toBe(false)
  })

  it("handles instagramQuickReply", () => {
    const nodes = [node("1", "instagramQuickReply", {
      buttons: [{ id: "btn-1", text: "A" }],
    })]
    const result = migrateChoicesField(nodes)
    expect(result.migrated).toBe(true)
    const data = result.nodes[0].data as any
    expect(data.choices).toBeDefined()
  })

  it("preserves all other data fields", () => {
    const nodes = [node("1", "whatsappQuickReply", {
      buttons: [{ id: "btn-a", text: "A" }],
      question: "Pick one",
      label: "Quick Reply",
      storeAs: "answer",
    })]
    const result = migrateChoicesField(nodes)
    const data = result.nodes[0].data as any
    expect(data.question).toBe("Pick one")
    expect(data.label).toBe("Quick Reply")
    expect(data.storeAs).toBe("answer")
  })
})
```

- [ ] **Step 3: Run the new tests**

```bash
npm run test -- --run hooks/__tests__/flow-migrations.test.ts
```

Expected: all migration tests pass.

- [ ] **Step 4: Verify tsc + full suite**

```bash
npx tsc --noEmit && npm run test -- --run
```

Some other tests will still fail (fixtures using `data.buttons` / `data.options`) — that's Task 10. The migration tests should be green.

- [ ] **Step 5: Commit**

```bash
git add hooks/use-flow-persistence.ts hooks/__tests__/flow-migrations.test.ts
git commit -m "feat(migration): one-shot data.buttons/options → data.choices on flow load

migrateChoicesField walks every node loaded from storage and renames
the legacy data.buttons (whatsappQuickReply, instagramQuickReply,
whatsapp/instagram question nodes) and data.options
(whatsappInteractiveList) fields to the canonical data.choices field.
Forward-only, idempotent. Runs in the existing migration pipeline
alongside migrateApiFetchEdges and migrateSuperNodesToTemplates.

Six unit tests cover legacy buttons, legacy options, idempotent
re-runs, untouched non-choice nodes, instagramQuickReply, and field
preservation."
```

---

### Task 10: Update test fixtures across the affected suites

**Files:**
- Modify: `utils/__tests__/flow-plan-builder.test.ts`
- Modify: `utils/__tests__/whatsapp-converter.test.ts`
- Modify: `utils/__tests__/flow-validator.test.ts`
- Modify: `utils/__tests__/ai-data-transform.test.ts`
- Modify: `utils/__tests__/node-factory.test.ts`
- Modify: `utils/__tests__/node-operations.test.ts`
- Modify: `lib/ai/tools/__tests__/generate-flow.test.ts`
- Modify: `hooks/__tests__/use-undo-redo.test.ts`

For each test file:

- [ ] **Step 1: Find every fixture that creates a quickReply or list node with `data.buttons` / `data.options`**

```bash
grep -rn "data\.buttons\|data\.options" utils/__tests__ lib/ai/tools/__tests__ hooks/__tests__
```

- [ ] **Step 2: Replace fixture data with `data.choices`**

For each match, change the fixture from e.g.:

```ts
{ id: "qr-1", type: "whatsappQuickReply", data: { buttons: [{ text: "A", id: "btn-a" }] } }
```

to:

```ts
{ id: "qr-1", type: "whatsappQuickReply", data: { choices: [{ text: "A", id: "btn-a" }] } }
```

- [ ] **Step 3: Update assertions**

Tests asserting on `result.nodes[0].data.buttons` → `result.nodes[0].data.choices`. Same for options.

- [ ] **Step 4: Drop the N5 coercion-warning test**

In `utils/__tests__/flow-plan-builder.test.ts`, the test added in PR #61 for the "coerced to buttons" warning is no longer relevant (the coercion no longer exists). Remove the test case "emits nodeUpdate coercion warnings that do NOT match the skip-rollback prefix" but keep the tightened `nodeUpdate target ` prefix assertion on the existing test.

- [ ] **Step 5: Drop tests for `convertButtonsToOptions` in `node-operations.test.ts`**

The function will be deleted in Task 11. Remove its tests now (they'd fail to compile).

- [ ] **Step 6: Drop tests for `mixed_button_option_fields` in `flow-validator.test.ts`**

The rule is gone. Remove the test cases.

> **Likely no-op as of 2026-04-15:** grep shows zero matches for `mixed_button_option_fields` in `flow-validator.test.ts` — no explicit test cases exist for this rule (pre-existing coverage gap). Verify with `grep -n mixed_button_option_fields utils/__tests__/flow-validator.test.ts` and skip if empty.

- [ ] **Step 7: Add a regression test for handle-ID preservation across auto-convert**

In `utils/__tests__/flow-plan-builder.test.ts`, add a new test in the auto-conversion describe block:

```ts
it("preserves choice IDs when auto-converting quickReply → interactiveList", () => {
  const existingNodes = [
    {
      id: "qr-1",
      type: "whatsappQuickReply",
      position: { x: 0, y: 0 },
      data: {
        question: "Pick one",
        choices: [
          { text: "Yes", id: "choice-keep-1" },
          { text: "No", id: "choice-keep-2" },
          { text: "Maybe", id: "choice-keep-3" },
        ],
      },
    },
  ] as any[]

  // AI sends a nodeUpdate that pushes the quickReply over the limit
  const editPlan: EditFlowPlan = {
    message: "Add a 4th choice",
    nodeUpdates: [{
      nodeId: "qr-1",
      content: { choices: ["Yes", "No", "Maybe", "Definitely"] },
    }],
  }

  const result = buildEditFlowFromPlan(editPlan, "whatsapp", existingNodes)

  // Auto-converted to interactiveList
  expect(result.nodeUpdates[0].newType).toBe("whatsappInteractiveList")
  // Original 3 IDs preserved (by index match in the nodeUpdate processing)
  const updatedChoices = result.nodeUpdates[0].data.choices as ChoiceData[]
  expect(updatedChoices[0].id).toBe("choice-keep-1")
  expect(updatedChoices[1].id).toBe("choice-keep-2")
  expect(updatedChoices[2].id).toBe("choice-keep-3")
  // 4th choice gets a fresh ID (the AI didn't supply one)
  expect(updatedChoices[3].id).toBeDefined()
  expect(updatedChoices[3].text).toBe("Definitely")
})
```

This guards the headline bug fix — the whole reason `maybeAutoConvertToList` was rewritten in Task 4 step 4. If a future refactor accidentally reintroduces the buttons → options ID rewrite, this test catches it.

- [ ] **Step 8: Add a converter round-trip test**

In `utils/__tests__/whatsapp-converter.test.ts`, add:

```ts
it("round-trips quickReply choices through forward → reverse without ID loss", () => {
  const originalNodes = [
    { id: "start", type: "start", position: { x: 0, y: 0 }, data: { platform: "whatsapp", label: "Start" } },
    {
      id: "qr-1",
      type: "whatsappQuickReply",
      position: { x: 200, y: 0 },
      data: {
        platform: "whatsapp",
        question: "Pick one",
        choices: [
          { text: "Yes", id: "btn-yes" },
          { text: "No", id: "btn-no" },
        ],
      },
    },
  ] as any[]
  const originalEdges = [
    { id: "e1", source: "start", target: "qr-1" },
  ] as any[]

  // Forward: nodes → fs-whatsapp wire format
  const wire = convertToFsWhatsApp(originalNodes, originalEdges, "Test flow")

  // Reverse: wire format → nodes
  const { nodes: roundTrippedNodes } = convertFromFsWhatsApp(wire)
  const qr = roundTrippedNodes.find((n: any) => n.type === "whatsappQuickReply")
  expect(qr).toBeDefined()

  // The choices array round-trips with the same IDs and text
  const choices = (qr!.data as any).choices as ChoiceData[]
  expect(choices).toHaveLength(2)
  expect(choices[0].id).toBe("btn-yes")
  expect(choices[0].text).toBe("Yes")
  expect(choices[1].id).toBe("btn-no")
  expect(choices[1].text).toBe("No")
})

it("round-trips interactiveList choices through forward → reverse without ID loss", () => {
  const originalNodes = [
    { id: "start", type: "start", position: { x: 0, y: 0 }, data: { platform: "whatsapp", label: "Start" } },
    {
      id: "list-1",
      type: "whatsappInteractiveList",
      position: { x: 200, y: 0 },
      data: {
        platform: "whatsapp",
        question: "Pick from many",
        choices: [
          { text: "Option A", id: "opt-a" },
          { text: "Option B", id: "opt-b" },
          { text: "Option C", id: "opt-c" },
          { text: "Option D", id: "opt-d" },
        ],
      },
    },
  ] as any[]
  const originalEdges = [
    { id: "e1", source: "start", target: "list-1" },
  ] as any[]

  const wire = convertToFsWhatsApp(originalNodes, originalEdges, "Test flow")
  const { nodes: roundTrippedNodes } = convertFromFsWhatsApp(wire)
  const list = roundTrippedNodes.find((n: any) => n.type === "whatsappInteractiveList")
  expect(list).toBeDefined()

  const choices = (list!.data as any).choices as ChoiceData[]
  expect(choices).toHaveLength(4)
  expect(choices.map(c => c.id)).toEqual(["opt-a", "opt-b", "opt-c", "opt-d"])
  expect(choices.map(c => c.text)).toEqual(["Option A", "Option B", "Option C", "Option D"])
})
```

These two tests verify that the converter produces `data.choices` on the reverse path AND that handle IDs survive the round trip — the two invariants that the whatsapp-converter changes in Task 7 must satisfy.

- [ ] **Step 9: Verify the full suite**

```bash
npm run test -- --run
```

Expected: all tests pass, with the new round-trip and handle-preservation tests added (≈758-763 total).

- [ ] **Step 10: Commit**

```bash
git add utils/__tests__/flow-plan-builder.test.ts \
        utils/__tests__/whatsapp-converter.test.ts \
        utils/__tests__/flow-validator.test.ts \
        utils/__tests__/ai-data-transform.test.ts \
        utils/__tests__/node-factory.test.ts \
        utils/__tests__/node-operations.test.ts \
        lib/ai/tools/__tests__/generate-flow.test.ts \
        hooks/__tests__/use-undo-redo.test.ts
git commit -m "test: update fixtures to data.choices + handle preservation + round-trip

All test fixtures for whatsapp/instagram quickReply / interactiveList /
question nodes now use data.choices instead of data.buttons /
data.options. Drops obsolete tests for convertButtonsToOptions, the
mixed_button_option_fields validator rule, and the N5 coercion-warning
test from PR #61.

Adds two regression tests for the headline invariants:
- handle-ID preservation across quickReply → interactiveList auto-convert
  (guards the rewrite of maybeAutoConvertToList in Task 4)
- converter forward → reverse round-trip preserves choice IDs and text
  for both quickReply and interactiveList (guards Task 7 changes)"
```

---

### Task 11: Delete dead code

**Files:**
- Modify: `utils/node-operations.ts`
- Modify: `utils/index.ts`
- Modify: `hooks/use-node-operations.ts`

- [ ] **Step 1: Delete `convertButtonsToOptions` from `utils/node-operations.ts`**

Find the function and delete it. Also delete `createButtonData` and `createOptionData` if no callers remain (`grep` to confirm). If callers remain in test files, leave them deprecated.

- [ ] **Step 2: Drop the export from `utils/index.ts`**

Remove the `convertButtonsToOptions` re-export.

> **Likely no-op as of 2026-04-15:** `utils/index.ts` does not currently re-export `convertButtonsToOptions`. Verify with `grep -n convertButtonsToOptions utils/index.ts` and skip if empty.

- [ ] **Step 3: Update `hooks/use-node-operations.ts` callers**

If it imports `convertButtonsToOptions`, replace with the simpler "swap node type" pattern (the conversion no longer needs to map data — just change `node.type`).

- [ ] **Step 4: Verify nothing references the deleted symbols**

```bash
grep -rn "convertButtonsToOptions" --include="*.ts" --include="*.tsx" .
grep -rn "mixed_button_option_fields" --include="*.ts" --include="*.tsx" .
```

Expected: zero hits in production code (memory and ROADMAP may still mention them).

- [ ] **Step 5: Verify tsc + full suite**

```bash
npx tsc --noEmit && npm run test -- --run
```

Expected: clean, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add utils/node-operations.ts utils/index.ts hooks/use-node-operations.ts
git commit -m "chore: delete convertButtonsToOptions and dead callers

Now that data.choices is unified across both whatsappQuickReply and
whatsappInteractiveList, the buttons → options conversion helper has no
purpose. Auto-convert just swaps node.type — data.choices stays. Drops
~30 lines net."
```

---

### Task 12: Sanity check + smoke test

- [ ] **Step 1: Final verification**

```bash
npx tsc --noEmit
npm run test -- --run
```

Expected: tsc clean, all tests pass.

- [ ] **Step 2: Grep for orphaned references**

```bash
grep -rn "data\.buttons\|data\.options" --include="*.ts" --include="*.tsx" \
  components/nodes/whatsapp components/nodes/instagram \
  utils/whatsapp-converter.ts utils/flow-plan-builder.ts \
  utils/flow-validator.ts utils/node-factory.ts \
  lib/ai/core/node-documentation.ts constants/node-categories.ts
```

Expected: zero hits (or only inside `readChoices` fallback comments).

```bash
grep -rn "convertButtonsToOptions\|mixed_button_option_fields" \
  --include="*.ts" --include="*.tsx" .
```

Expected: zero hits in production code.

- [ ] **Step 3: Manual smoke test (recommended before merging)**

1. Open MagicFlow in the browser.
2. Load an existing flow that has a whatsappQuickReply node from before this PR. Verify it renders with the migrated `data.choices` field — buttons appear, handles work, no console errors.
3. Add a 4th button to a quickReply. Verify it auto-converts to interactiveList without losing the button labels or handle IDs.
4. Save the flow, reload, verify it round-trips through the converter without losing data.
5. Open the AI chat panel and ask "add a quickReply with options Yes, No, Maybe". Verify the AI's plan uses `content.choices` and the resulting node has `data.choices`.
6. Open an interactiveList node, add an 11th option (over the limit). Verify it doesn't allow it (the validator should catch it).
7. Run `apply_edit` via the AI on a node — verify the changes modal renders the diff correctly.

- [ ] **Step 4: Code review pass**

Use `superpowers:code-reviewer` to review the full diff against `main`. The reviewer should confirm:
- No remaining references to `data.buttons` / `data.options` in production code (other than the fallback in `readChoices`)
- The load migration is idempotent and forward-only
- The auto-convert path no longer mutates `data.choices`
- The AI prompt rule changes are accurate
- Test coverage hasn't regressed

- [ ] **Step 5: Open the PR**

```bash
git push -u origin refactor/data-choices-unification
gh pr create --title "refactor: unify data.buttons/data.options → data.choices" \
  --body "..."  # use a structured body summarizing the 11 commits
```

---

## Open scope questions

These are explicit decision points the user should weigh in on before execution:

1. **Web nodes (`web-quick-reply-node.tsx`, `web-question-node.tsx`)** — included or not? Recommendation: NOT in this PR. Web flows don't go through the whatsapp-converter and aren't in the AI prompt's choice schema. A separate PR after Phase D ships keeps this one focused.

2. **Template message nodes (`template-message-node.tsx`)** — these use `data.buttons` for WhatsApp template button definitions, which is a separate concept from quickReply choices (template buttons have URL/phone variants). Recommendation: explicitly out of scope.

3. **Should `ButtonData` and `OptionData` types be deleted entirely**, or kept as deprecated aliases? Recommendation: keep deprecated for now; delete in a follow-up PR once we've confirmed no external consumers.

4. **Auto-convert direction (list → quickReply)** when count ≤ 3. The current `onAcceptAISuggestion` path does this. Should the load migration also normalize lists with ≤3 items down to quickReply? Recommendation: NO — users may have intentionally chosen list (different render style). Migration is a pure rename only.

---

## Risks

1. **Round-trip regression** — the converter forward + reverse must round-trip an existing flow without data loss. The risk is the reverse path producing a `data.choices` shape that differs from what the components expect. Mitigation: round-trip tests in Task 10, manual smoke in Task 12.

2. **Handle ID stability across the auto-convert** — when a quickReply auto-converts to interactiveList, the existing buttons' handle IDs must survive (otherwise existing addEdges to `btn-xxx` break). The new `maybeAutoConvertToList` keeps `data.choices` intact, so handle IDs are preserved. Mitigation: explicit test for the auto-convert case asserting handle ID preservation.

3. **AI prompt regression** — dropping the "buttons vs options" CRITICAL rule could cause the AI to occasionally still send the wrong field name. Mitigation: `contentToNodeData` accepts all three (`choices`, `buttons`, `options`) for backward compat. The AI's mistake is silently corrected.

4. **Properties panel field editing** — if I miss a write site in `properties-panel.tsx`, edits made through the side panel could write to `data.buttons` instead of `data.choices` and the migration would not catch them on save (only on load). Mitigation: thorough grep in Task 8 step 9, manual smoke in Task 12.

---

## Verification checklist (run after Task 12)

- [ ] `npx tsc --noEmit` — exit 0
- [ ] `npm run test -- --run` — all tests pass (≈755 + new migration tests)
- [ ] `grep -rn "data\.buttons\|data\.options" components/nodes/whatsapp components/nodes/instagram` — only `readChoices` fallback comments
- [ ] `grep -rn "convertButtonsToOptions" --include="*.ts" --include="*.tsx" .` — zero hits in production
- [ ] `grep -rn "mixed_button_option_fields" --include="*.ts" --include="*.tsx" .` — zero hits in production
- [ ] Manual: load a pre-PR flow, add a 4th button, verify auto-convert preserves handles
- [ ] Manual: AI generates a quickReply via chat, verify `content.choices` is in the request and `data.choices` is in the resulting node
- [ ] Code-reviewer subagent pass on the full diff
