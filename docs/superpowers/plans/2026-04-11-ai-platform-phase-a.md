# AI Platform Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 new tools (list_variables, undo_last, trigger_flow) to the flow assistant's edit-mode tool-use loop, cache node documentation, and switch create mode to Sonnet.

**Architecture:** Phase A extends the existing edit-mode tool-use loop (Vercel AI SDK `generateText()` with `tools` param) by adding 3 new tools alongside the existing 5. A `toolContext` object threads client-side context (publishedFlowId, waAccountId, auth header) through to server-side tool execution. Node documentation gets module-level memoization.

**Tech Stack:** TypeScript, Vercel AI SDK (`ai` package), Next.js API routes, React

**Spec:** `docs/superpowers/specs/2026-04-11-ai-platform-phase-a-design.md`

---

### Task 1: A1 — Cache node documentation

**Files:**
- Modify: `lib/ai/core/node-documentation.ts:84-175`

- [ ] **Step 1: Add module-level caches and memoize `getSimplifiedNodeDocumentation`**

```typescript
// At top of file, after imports, add:
const simplifiedDocsCache = new Map<string, string>()
const baseSelectionRulesCache = new Map<string, string>()
const dependenciesCache = new Map<string, string>()
```

Then wrap `getSimplifiedNodeDocumentation` — add cache check at start, cache set before return:

```typescript
export function getSimplifiedNodeDocumentation(platform: Platform): string {
  const cached = simplifiedDocsCache.get(platform)
  if (cached) return cached

  const lines: string[] = [
    `Available node types for ${platform}:`,
    "",
  ]

  // ... existing logic unchanged ...

  const result = lines.join("\n")
  simplifiedDocsCache.set(platform, result)
  return result
}
```

- [ ] **Step 2: Memoize `getNodeDependencies`**

Same pattern:

```typescript
export function getNodeDependencies(platform: Platform): string {
  const cached = dependenciesCache.get(platform)
  if (cached) return cached

  const lines: string[] = ["NODE DEPENDENCIES:"]
  let hasAny = false

  for (const t of NODE_TEMPLATES) {
    if (!t.platforms.includes(platform)) continue
    if (!t.ai?.dependencies || t.ai.dependencies.length === 0) continue
    lines.push(`- ${t.type} requires: ${t.ai.dependencies.join(", ")}`)
    hasAny = true
  }

  const result = hasAny ? lines.join("\n") : ""
  dependenciesCache.set(platform, result)
  return result
}
```

- [ ] **Step 3: Split-cache `getNodeSelectionRules`**

Replace the entire function. Cache the platform-specific NODE_TEMPLATES loop. Append user template rules fresh each call:

```typescript
export function getNodeSelectionRules(
  platform: Platform,
  userTemplates?: Array<{ id: string; name: string; aiMetadata?: TemplateAIMetadata }>
): string {
  let base = baseSelectionRulesCache.get(platform)
  if (!base) {
    const lines: string[] = ["NODE SELECTION RULES:"]
    for (const t of NODE_TEMPLATES) {
      if (!t.platforms.includes(platform)) continue
      if (!t.ai?.selectionRule) continue
      lines.push(`- ${t.type}: ${t.ai.selectionRule}`)
    }
    base = lines.join("\n")
    baseSelectionRulesCache.set(platform, base)
  }

  if (userTemplates) {
    const templateLines: string[] = []
    for (const t of userTemplates) {
      if (t.aiMetadata?.selectionRule) {
        templateLines.push(`- flowTemplate:${t.id}: ${t.aiMetadata.selectionRule}`)
      }
    }
    if (templateLines.length > 0) return base + "\n" + templateLines.join("\n")
  }
  return base
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS (no type errors)

- [ ] **Step 5: Commit**

```bash
git add lib/ai/core/node-documentation.ts
git commit -m "perf: cache node documentation for AI prompts

Module-level memoization for getSimplifiedNodeDocumentation,
getNodeSelectionRules (split cache for userTemplates), and
getNodeDependencies. Node types don't change at runtime."
```

---

### Task 2: A5 — Switch create mode to Sonnet

**Files:**
- Modify: `lib/ai/tools/generate-flow-create.ts:49`
- Modify: `lib/ai/tools/generate-flow.ts:125`

- [ ] **Step 1: Change create mode model**

In `lib/ai/tools/generate-flow-create.ts:49`, change:

```typescript
      model: 'claude-haiku',
```

to:

```typescript
      model: 'claude-sonnet',
```

- [ ] **Step 2: Change fallback model**

In `lib/ai/tools/generate-flow.ts:125`, change:

```typescript
    model: isEditRequest ? 'claude-sonnet' : 'claude-haiku',
```

to:

```typescript
    model: 'claude-sonnet',
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/generate-flow-create.ts lib/ai/tools/generate-flow.ts
git commit -m "feat: switch AI create mode from Haiku to Sonnet

Dev mode — cost isn't the priority. Sonnet produces better flows.
Also updates the text fallback to use Sonnet for both modes."
```

---

### Task 3: Extract `buildCurrentNodes`/`buildCurrentEdges` helpers + refactor `validate_result`

**Files:**
- Modify: `lib/ai/tools/generate-flow-edit.ts:236-291`

- [ ] **Step 1: Add helper functions above `createEditTools`**

Add these two functions before `createEditTools` (after the `EditToolCallbacks` interface, around line 125):

```typescript
/**
 * Build the current flow state by merging existing nodes with applied edits.
 * Shared by validate_result and list_variables tools.
 */
function buildCurrentNodes(
  existingNodes: Node[],
  editResult: BuildEditFlowResult | null,
): Node[] {
  if (!editResult) return [...existingNodes]
  const nodes = [...existingNodes, ...editResult.newNodes]
  for (const update of editResult.nodeUpdates) {
    const idx = nodes.findIndex(n => n.id === update.nodeId)
    if (idx !== -1) {
      nodes[idx] = {
        ...nodes[idx],
        type: update.newType || nodes[idx].type,
        data: { ...nodes[idx].data, ...update.data },
      }
    }
  }
  const removeIds = new Set(editResult.removeNodeIds)
  return nodes.filter(n => !removeIds.has(n.id))
}

function buildCurrentEdges(
  existingEdges: Edge[],
  editResult: BuildEditFlowResult | null,
): Edge[] {
  if (!editResult) return [...existingEdges]
  const edges = [...existingEdges, ...editResult.newEdges]
  const removeEdgeKeys = new Set(
    editResult.removeEdges.map(e => `${e.source}-${e.target}-${e.sourceHandle || ""}`)
  )
  return edges.filter(e =>
    !removeEdgeKeys.has(`${e.source}-${e.target}-${e.sourceHandle || ""}`)
  )
}
```

- [ ] **Step 2: Refactor `validate_result` to use the helpers**

Replace the inline merge logic in `validate_result.execute` (lines 251-274) with:

```typescript
      execute: async () => {
        const finalEditResult = callbacks.getEditResult()
        if (!finalEditResult) {
          return {
            valid: false,
            issueCount: 0,
            issues: [],
            suggestion: "No edits applied yet. Call apply_edit first.",
          }
        }

        const filteredNodes = buildCurrentNodes(existingNodes, finalEditResult)
        const filteredEdges = buildCurrentEdges(existingEdges, finalEditResult)

        const validation = validateGeneratedFlow(filteredNodes, filteredEdges, request.platform)
        console.log("[generate-flow] Tool validate_result:", {
          valid: validation.isValid,
          issueCount: validation.issues.length,
          issues: validation.issues.map(i => i.type),
        })
        return {
          valid: validation.isValid,
          issueCount: validation.issues.length,
          issues: validation.issues.map(i => ({ type: i.type, nodeId: i.nodeId, detail: i.detail })),
          suggestion: validation.isValid
            ? "Flow looks good — no issues found."
            : "Issues found. Call apply_edit to fix them, then validate_result again.",
        }
      },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/generate-flow-edit.ts
git commit -m "refactor: extract buildCurrentNodes/buildCurrentEdges helpers

Shared by validate_result and upcoming list_variables tool.
No behavior change."
```

---

### Task 4: A4 — Add `undo_last` tool + update callback type

**Files:**
- Modify: `lib/ai/tools/generate-flow-edit.ts:120-124` (EditToolCallbacks)
- Modify: `lib/ai/tools/generate-flow-edit.ts` (inside createEditTools, after save_as_template)
- Modify: `lib/ai/tools/flow-prompts.ts:175`

- [ ] **Step 1: Update `EditToolCallbacks` interface**

In `lib/ai/tools/generate-flow-edit.ts`, change line 121:

```typescript
  setEditResult: (result: BuildEditFlowResult) => void
```

to:

```typescript
  setEditResult: (result: BuildEditFlowResult | null) => void
```

- [ ] **Step 2: Add `undo_last` tool inside `createEditTools`**

After the `save_as_template` tool closing brace (before the final `}` of `createEditTools`), add:

```typescript
    undo_last: tool({
      description: 'Revert ALL your apply_edit changes and return the flow to its original state (before any edits this turn). Use this if validate_result found issues that are too complex to fix, or if the user asks to undo. After undoing, you can start fresh with a new apply_edit or just respond with a message.',
      inputSchema: z.object({
        reason: z.string().describe('Why you are undoing the edit'),
      }),
      execute: async ({ reason }) => {
        const currentResult = callbacks.getEditResult()
        if (!currentResult) {
          return { success: false, error: 'No edit to undo — apply_edit has not been called yet.' }
        }
        callbacks.setEditResult(null)
        console.log("[generate-flow] Tool undo_last:", { reason })
        return { success: true, message: `Edit reverted: ${reason}. The flow is back to its original state before any edits this turn.` }
      },
    }),
```

- [ ] **Step 3: Add `undo_last` to edit instructions in `flow-prompts.ts`**

In `lib/ai/tools/flow-prompts.ts`, in the `getEditInstructions()` function, after step 5 (line 175 — `'5. Once validate_result reports no issues...'`), add:

```typescript
    '6. If issues are too complex to fix, call `undo_last` to revert ALL your edits and start over or explain the problem to the user.',
```

And add to the CRITICAL RULES section (after the line about `NEVER create disconnected nodes`):

```typescript
    '- **`undo_last` reverts ALL edits this turn** — not just the last apply_edit. Use it as a full reset.',
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ai/tools/generate-flow-edit.ts lib/ai/tools/flow-prompts.ts
git commit -m "feat: add undo_last tool for AI self-correction

Resets finalEditResult to null so edits never reach the client.
Updates EditToolCallbacks to accept null. Adds to edit instructions."
```

---

### Task 5: A3 — Add `list_variables` tool

**Files:**
- Modify: `lib/ai/tools/generate-flow-edit.ts` (inside createEditTools, add import)
- Modify: `lib/ai/tools/flow-prompts.ts`

- [ ] **Step 1: Add import for `collectFlowVariablesRich`**

In `lib/ai/tools/generate-flow-edit.ts`, add to imports:

```typescript
import { collectFlowVariablesRich } from "@/utils/flow-variables"
```

- [ ] **Step 2: Add `list_variables` tool inside `createEditTools`**

After the `undo_last` tool (before the closing `}` of `createEditTools`), add:

```typescript
    list_variables: tool({
      description: 'List all available variables in the current flow, including any created by recent apply_edit calls. Returns flow variables (from storeAs, API response mapping, action nodes), system variables, and global variables. Use this AFTER apply_edit to check what new variables are available — the initial prompt already lists variables at conversation start.',
      inputSchema: z.object({}),
      execute: async () => {
        const currentNodes = buildCurrentNodes(existingNodes, callbacks.getEditResult())
        const flowVars = collectFlowVariablesRich(currentNodes)

        return {
          flowVariables: flowVars.map(v => ({
            name: v.name,
            reference: `{{${v.name}}}`,
            titleVariant: v.hasTitleVariant ? `{{${v.name}_title}}` : null,
            source: `${v.sourceNodeType}: "${v.sourceNodeLabel}"`,
          })),
          systemVariables: [
            { name: 'system.contact_name', reference: '{{system.contact_name}}', description: 'Contact display name' },
            { name: 'system.phone_number', reference: '{{system.phone_number}}', description: 'Contact phone number' },
          ],
          globalVariables: '(use {{global.variable_name}} syntax — available variables depend on org settings)',
          usage: {
            textInput: '{{variable_name}} — the raw response',
            buttonSelection: '{{variable_name}} — internal ID, {{variable_name_title}} — display text',
            system: '{{system.variable_name}} — always available',
            global: '{{global.variable_name}} — org-wide settings',
            crossFlow: '{{flow.slug.variable_name}} — from another flow',
          },
        }
      },
    }),
```

- [ ] **Step 3: Add `list_variables` guidance to edit instructions**

In `lib/ai/tools/flow-prompts.ts`, in `getEditInstructions()`, add after the Variables line (after the `**Variables:**` section around line 203):

```typescript
    '',
    '**list_variables tool:** Variables from the current flow are already listed in the prompt above. Only call `list_variables` after `apply_edit` if you need to check what new variables are available from nodes you just created.',
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ai/tools/generate-flow-edit.ts lib/ai/tools/flow-prompts.ts
git commit -m "feat: add list_variables tool to flow assistant

Returns flow variables (including from recent apply_edit), system
variables, and global variables. Uses shared buildCurrentNodes helper.
Prompt guidance: use after apply_edit, not at conversation start."
```

---

### Task 6: A2 — Add `toolContext` to request types + route handler

**Files:**
- Modify: `lib/ai/tools/generate-flow.ts:12-24` (GenerateFlowRequest type)
- Modify: `app/api/ai/flow-assistant/route.ts`

- [ ] **Step 1: Add `toolContext` to `GenerateFlowRequest`**

In `lib/ai/tools/generate-flow.ts`, add to the `GenerateFlowRequest` interface (after `userTemplateData?`):

```typescript
  toolContext?: {
    publishedFlowId?: string
    waAccountId?: string
    authHeader?: string
  }
```

- [ ] **Step 2: Update the route handler to build `toolContext`**

In `app/api/ai/flow-assistant/route.ts`, add extraction of new fields. After the existing destructuring (line 16-23), add:

```typescript
    const {
      message,
      platform,
      flowContext,
      conversationHistory,
      existingFlow,
      selectedNode,
      userTemplates,
      userTemplateData,
      publishedFlowId,
      waAccountId,
    } = body

    const authHeader = request.headers.get('Authorization') || ''
```

Then update the `generateFlow()` call to include `toolContext`:

```typescript
    const result = await generateFlow({
      prompt: message,
      platform: platform as Platform,
      flowContext,
      conversationHistory,
      existingFlow,
      selectedNode,
      userTemplates,
      userTemplateData,
      toolContext: {
        publishedFlowId,
        waAccountId,
        authHeader,
      },
    })
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/generate-flow.ts app/api/ai/flow-assistant/route.ts
git commit -m "feat: add toolContext to AI request pipeline

Threads publishedFlowId, waAccountId, and auth header from
route handler through to tool execution. Prepares for trigger_flow."
```

---

### Task 7: A2 — Add `trigger_flow` tool to edit tools

**Files:**
- Modify: `lib/ai/tools/generate-flow-edit.ts` (createEditTools signature + tool)
- Modify: `lib/ai/tools/flow-prompts.ts`

- [ ] **Step 1: Update `createEditTools` signature to accept `toolContext`**

In `lib/ai/tools/generate-flow-edit.ts`, change the `createEditTools` function signature:

```typescript
function createEditTools(
  existingNodes: Node[],
  existingEdges: Edge[],
  request: GenerateFlowRequest,
  templateResolver: TemplateResolver | undefined,
  callbacks: EditToolCallbacks,
  toolContext?: GenerateFlowRequest['toolContext'],
) {
```

- [ ] **Step 2: Update the call site in `executeEditMode`**

In `executeEditMode` (around line 50), update the `createEditTools` call to pass `toolContext`:

```typescript
    tools: createEditTools(existingNodes, existingEdges, request, templateResolver, {
      setEditResult: (r) => { finalEditResult = r },
      setTemplateMetadata: (m) => { finalTemplateMetadata = m },
      getEditResult: () => finalEditResult,
    }, request.toolContext),
```

- [ ] **Step 3: Add `trigger_flow` tool conditionally**

Inside `createEditTools`, change the return from a plain object to a built object with conditional spread. Replace the opening `return {` with:

```typescript
  const apiUrl = process.env.FS_WHATSAPP_API_URL

  const baseTools = {
    get_node_details: tool({ /* ... existing ... */ }),
    // ... all existing tools stay exactly as they are ...
    // ... undo_last and list_variables from previous tasks ...
  }

  // Conditionally add trigger_flow for published WhatsApp flows
  if (toolContext?.publishedFlowId && request.platform === 'whatsapp' && apiUrl && toolContext.authHeader) {
    const { publishedFlowId, waAccountId, authHeader } = toolContext
    return {
      ...baseTools,
      trigger_flow: tool({
        description: 'Trigger a test run of the published flow by sending it to a phone number via WhatsApp. Only use when the user asks to test the flow or you have just finished a significant edit.',
        inputSchema: z.object({
          phone_number: z.string().describe('Phone number in E.164 format (e.g. "+919876543210")'),
          variables: z.record(z.string()).optional().describe('Template parameter values if the flow starts with a template message'),
        }),
        execute: async ({ phone_number, variables }) => {
          const body: Record<string, any> = { phone_number }
          if (waAccountId) body.whatsapp_account = waAccountId
          if (variables && Object.keys(variables).length > 0) body.variables = variables

          try {
            const response = await fetch(`${apiUrl}/api/chatbot/flows/${publishedFlowId}/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
              body: JSON.stringify(body),
            })
            const data = await response.json()

            if (!response.ok) {
              const msg = data?.message || data?.error || `HTTP ${response.status}`
              if (msg.toLowerCase().includes('active session')) {
                return { success: false, error: 'Cannot send: contact has an active session. The user needs to end it first or wait for it to expire.' }
              }
              return { success: false, error: msg }
            }
            console.log("[generate-flow] Tool trigger_flow: sent to", phone_number)
            return { success: true, message: `Flow sent to ${phone_number}` }
          } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Network error calling fs-whatsapp' }
          }
        },
      }),
    }
  }

  return baseTools
```

**Important:** The existing tools stay exactly where they are in `baseTools`. Only the `return` statement changes from `return { ... }` to `const baseTools = { ... }` + conditional return.

- [ ] **Step 4: Add conditional `trigger_flow` mention in system prompt**

In `lib/ai/tools/flow-prompts.ts`, in `buildSystemPrompt()`, add after the `${dependencyRules}` line (around line 31):

```typescript
  if (isEdit && request.toolContext?.publishedFlowId) {
    prompt += `\n\n**Testing:** This flow is published. You can use \`trigger_flow\` to send a test message after making changes. Only offer this if the user asks to test or you have just finished a significant edit.`
  }
```

This requires `request` to be the full `GenerateFlowRequest` type — it already is (passed as first param to `buildSystemPrompt`).

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/ai/tools/generate-flow-edit.ts lib/ai/tools/flow-prompts.ts
git commit -m "feat: add trigger_flow tool for AI-assisted testing

Conditionally included for published WhatsApp flows. Calls
POST /api/chatbot/flows/{id}/send via fs-whatsapp API.
Handles active session conflicts and network errors."
```

---

### Task 8: A2 — Wire client-side props for `trigger_flow`

**Files:**
- Modify: `components/ai/ai-assistant.tsx:32-41` (AIAssistantProps)
- Modify: `components/ai/ai-assistant.tsx:264-281` (handleSendMessage fetch body)
- Modify: `app/flow/[id]/page.tsx:766-775` (AIAssistant render)

- [ ] **Step 1: Add props to `AIAssistantProps`**

In `components/ai/ai-assistant.tsx`, add to `AIAssistantProps` (after `onUpdateFlow?`):

```typescript
  publishedFlowId?: string
  waAccountId?: string
```

- [ ] **Step 2: Destructure new props in component**

In the `AIAssistant` function signature (around line 73), add:

```typescript
export function AIAssistant({
  flowId,
  platform,
  flowContext,
  existingFlow,
  selectedNode,
  onApplyFlow,
  onUpdateFlow,
  publishedFlowId,
  waAccountId,
```

- [ ] **Step 3: Include new fields in fetch body**

In the `handleSendMessage` fetch call (around line 267), add `publishedFlowId` and `waAccountId` to the body:

```typescript
        body: JSON.stringify({
          message: userMessage.content,
          platform,
          flowContext,
          existingFlow,
          selectedNode: selectedNode
            ? { id: selectedNode.id, type: selectedNode.type, data: selectedNode.data, position: selectedNode.position }
            : undefined,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          userTemplates,
          userTemplateData,
          publishedFlowId,
          waAccountId,
        }),
```

- [ ] **Step 4: Pass props from page**

In `app/flow/[id]/page.tsx`, update the `<AIAssistant>` render (around line 766) to include the new props:

```typescript
              <AIAssistant
                flowId={flowId}
                platform={platform}
                flowContext={persistence.currentFlow?.description}
                existingFlow={{ nodes, edges }}
                selectedNode={nodeOps.selectedNode}
                onApplyFlow={flowAI.handleApplyFlow}
                onUpdateFlow={flowAI.handleUpdateFlow}
                publishedFlowId={persistence.currentFlow?.publishedFlowId}
                waAccountId={persistence.currentFlow?.waAccountId}
              />
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/ai/ai-assistant.tsx app/flow/[id]/page.tsx
git commit -m "feat: wire publishedFlowId and waAccountId to AI assistant

Threads from persistence.currentFlow through AIAssistant props
to the flow-assistant API request body. Enables trigger_flow tool."
```

---

### Task 9: Manual smoke test

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/pratikgupta/Freestand && docker compose up`

- [ ] **Step 2: Test edit mode with new tools**

Open a flow with existing nodes in MagicFlow. Open the AI assistant chat panel. Ask the AI to make an edit. Verify in the browser console:
- `[generate-flow] Step` logs show tool calls as before
- No errors related to the new tools
- The AI can use `list_variables` after making edits
- The AI mentions `undo_last` in its reasoning if the edit has issues

- [ ] **Step 3: Test create mode with Sonnet**

Create a new flow. Ask the AI to "create a lead capture flow for WhatsApp". Verify:
- The flow generates successfully (should be higher quality than before with Haiku)
- No errors in the console

- [ ] **Step 4: Test trigger_flow (if a published WhatsApp flow exists)**

Open a published WhatsApp flow. Ask the AI to test the flow. Verify:
- The AI calls `trigger_flow` with a phone number
- If no published flow, the AI should explain the flow needs publishing first
