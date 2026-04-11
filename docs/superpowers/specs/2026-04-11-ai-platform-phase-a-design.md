# AI Platform Phase A — Direct Tools Design

Phase A adds 3 new tools to the flow assistant's edit-mode tool-use loop, caches node documentation, and switches create mode to Sonnet.

## Current Architecture

The flow assistant has two modes:

- **Edit mode** (`generate-flow-edit.ts`): Vercel AI SDK `generateText()` with 5 tools (`get_node_details`, `get_node_connections`, `apply_edit`, `validate_result`, `save_as_template`), max 12 steps, Claude Sonnet.
- **Create mode** (`generate-flow-create.ts`): `generateObject()` with structured JSON output, self-correction retry loop (max 2 retries), Claude Haiku.
- **Fallback** (`generate-flow.ts` `handleFallback`): text generation with JSON extraction, Sonnet for edit / Haiku for create.

Create mode uses `aiClient.generateJSON()` (which wraps Vercel AI SDK `generateObject()`), not the `getModel()` + `generateText()` pattern used by edit mode.

Tools are defined in `createEditTools()` in `generate-flow-edit.ts`. Signature: `createEditTools(existingNodes, existingEdges, request, templateResolver, callbacks)`. Callbacks type: `{ setEditResult, setTemplateMetadata, getEditResult }`.

## A1: node_docs_cache

**Problem:** `getSimplifiedNodeDocumentation(platform)`, `getNodeSelectionRules(platform, userTemplates?)`, and `getNodeDependencies(platform)` are called every prompt in `buildSystemPrompt()`. Node types don't change at runtime.

**Solution:** Module-level memoization inside `lib/ai/core/node-documentation.ts`.

**Implementation:**

```typescript
// lib/ai/core/node-documentation.ts

// Module-level cache — platform is the key (required param, not optional)
const simplifiedDocsCache = new Map<string, string>()
const baseSelectionRulesCache = new Map<string, string>()
const dependenciesCache = new Map<string, string>()

export function getSimplifiedNodeDocumentation(platform: Platform): string {
  const cached = simplifiedDocsCache.get(platform)
  if (cached) return cached
  
  // ... existing logic ...
  const result = /* existing return value */
  simplifiedDocsCache.set(platform, result)
  return result
}

export function getNodeDependencies(platform: Platform): string {
  // Same pattern — cache by platform
}
```

**`getNodeSelectionRules` needs a split cache strategy.** Signature: `getNodeSelectionRules(platform: Platform, userTemplates?)`. The NODE_TEMPLATES loop (lines 141-145) is platform-only and cacheable. The userTemplates loop (lines 148-154) is per-request. Cache the base rules, append user template rules fresh:

```typescript
export function getNodeSelectionRules(
  platform: Platform,
  userTemplates?: Array<{ id: string; name: string; aiMetadata?: TemplateAIMetadata }>
): string {
  // Cache the platform-specific base rules
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

  // Append user template rules (not cached — changes per request)
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

**Also benefits:** `suggest-nodes.ts` calls these same 3 functions — caching helps there too.

**Files changed:** `lib/ai/core/node-documentation.ts` only.

## A2: trigger_flow

**Problem:** After generating or editing a flow, the AI can't help test it. Users must manually go to the test panel.

**Solution:** Add a `trigger_flow` tool to the edit-mode tool set.

**How testing works today:** The start node's properties panel calls `POST /api/chatbot/flows/{publishedFlowId}/send` with `{ phone_number, whatsapp_account?, variables? }`. `publishedFlowId` is the slug stored in the flow's published version (the `chatbot_flows` slug, not the MagicFlow project ID).

**Tool definition:**

```typescript
trigger_flow: tool({
  description: 'Trigger a test run of the published flow by sending it to a phone number. Only available for WhatsApp flows that have been published. The AI should offer this after building or editing a flow.',
  inputSchema: z.object({
    phone_number: z.string().describe('Phone number in E.164 format (e.g. "+919876543210")'),
    variables: z.record(z.string()).optional().describe('Template parameter values if the flow starts with a template message'),
  }),
  execute: async ({ phone_number, variables }) => {
    if (!publishedFlowId) {
      return { success: false, error: 'Flow is not published yet. Publish the flow first, then trigger a test.' }
    }
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
        const hasActiveSession = msg.toLowerCase().includes('active session')
        if (hasActiveSession) {
          return { success: false, error: `Cannot send: contact has an active session. The user needs to end it first or wait for it to expire.` }
        }
        return { success: false, error: msg }
      }
      return { success: true, message: `Flow sent to ${phone_number}` }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error calling fs-whatsapp' }
    }
  },
})
```

**Platform restriction:** Don't include `trigger_flow` in the tools object for non-WhatsApp flows. In `createEditTools()`, conditionally include it:

```typescript
const tools = {
  get_node_details: tool({ ... }),
  // ... existing tools ...
  list_variables: tool({ ... }),
  undo_last: tool({ ... }),
  // Conditionally include trigger_flow
  ...(toolContext.platform === 'whatsapp' && toolContext.publishedFlowId ? {
    trigger_flow: tool({ ... }),
  } : {}),
}
```

**Auth header threading — full path:**

The JWT must flow from client → route handler → generateFlow → executeEditMode → createEditTools → trigger_flow.execute().

1. **`route.ts`** extracts the `Authorization` header from `NextRequest`:
   ```typescript
   const authHeader = request.headers.get('Authorization') || ''
   ```

2. **`GenerateFlowRequest`** gets a new `toolContext` field (groups all tool-specific context, avoids polluting the core request type):
   ```typescript
   interface GenerateFlowRequest {
     // ... existing fields ...
     toolContext?: {
       publishedFlowId?: string   // slug from chatbot_flows
       waAccountId?: string       // WhatsApp account ID (not resolved name)
       authHeader?: string        // JWT from client request
     }
   }
   ```

3. **`generateFlow()`** passes `request.toolContext` through to `executeEditMode()` (already passes the full request).

4. **`executeEditMode()`** passes `request.toolContext` to `createEditTools()` — add as new parameter after `callbacks`:
   ```typescript
   function createEditTools(
     existingNodes: Node[],
     existingEdges: Edge[],
     request: GenerateFlowRequest,
     templateResolver: TemplateResolver | undefined,
     callbacks: EditToolCallbacks,
     toolContext?: GenerateFlowRequest['toolContext'],  // NEW
   )
   ```

5. **`trigger_flow.execute()`** reads from the closure: `toolContext?.authHeader`, `toolContext?.publishedFlowId`, `toolContext?.waAccountId`.

6. **Server env var:** Use `process.env.FS_WHATSAPP_API_URL` (server-only, used by all existing API routes like `auth/login`). NOT `NEXT_PUBLIC_FS_WHATSAPP_URL` (client-only).

**Client-side changes — `ai-assistant.tsx`:**

`publishedFlowId` is already available: the flow page passes `publishedFlowId={persistence.currentFlow?.publishedFlowId}` to the start node (line 861). Add it as a prop to `AIAssistantProps`:

```typescript
interface AIAssistantProps {
  // ... existing props ...
  publishedFlowId?: string
  waAccountId?: string
}
```

The page passes these from `persistence.currentFlow`. `waAccountId` is already on the flow data (`persistence.currentFlow?.waAccountId`, used at page.tsx:453).

The `handleSendMessage()` function in `ai-assistant.tsx` includes them in the request body:

```typescript
const response = await fetch('/api/ai/flow-assistant', {
  body: JSON.stringify({
    // ... existing fields ...
    publishedFlowId,  // from props
    waAccountId,      // from props
  }),
})
```

**System prompt update:** Add a conditional line in `buildSystemPrompt()`:

```
If the flow is published, you can use `trigger_flow` to send a test message. Offer this after making changes.
```

Only include this when `toolContext.publishedFlowId` is present. Also add to edit instructions: "Do NOT call `trigger_flow` unless the user explicitly asks to test the flow or you've just finished a significant edit."

**Files changed:**
- `lib/ai/tools/generate-flow-edit.ts` — add tool to `createEditTools()`, add `toolContext` param
- `lib/ai/tools/generate-flow.ts` — update `GenerateFlowRequest` type, pass toolContext through
- `lib/ai/tools/flow-prompts.ts` — conditional system prompt line
- `app/api/ai/flow-assistant/route.ts` — extract auth header, accept `publishedFlowId`/`waAccountId`, build `toolContext`
- `components/ai/ai-assistant.tsx` — add `publishedFlowId`/`waAccountId` props, include in request
- `app/flow/[id]/page.tsx` — pass `publishedFlowId`/`waAccountId` to `<AIAssistant />`

## A3: list_variables

**Problem:** Variables are injected into the user prompt at the start of the conversation, but the AI can't refresh this list mid-conversation after creating new nodes with `storeAs`.

**Solution:** Add a `list_variables` tool to the edit-mode tool set.

**Tool definition:**

```typescript
list_variables: tool({
  description: 'List all available variables in the current flow, including any created by recent apply_edit calls. Returns flow variables (from storeAs, API response mapping, action nodes), system variables, and global variables. Use this AFTER apply_edit to check what variables are now available — the initial prompt already contains variables at conversation start.',
  inputSchema: z.object({}),
  execute: async () => {
    // Build current nodes: existing + applied edits (same merge as validate_result)
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
})
```

**Current state awareness:** The tool must reflect edits applied during the current tool-use loop. After `apply_edit` creates a new question node with `storeAs: "flavor"`, `list_variables` should include it.

**Extract shared `buildCurrentNodes` helper:** Both `validate_result` (lines 252-268) and `list_variables` need the same merge logic: existing nodes + new nodes from edit result, with node updates applied and removed nodes filtered out. Extract this into a shared helper inside `generate-flow-edit.ts`:

```typescript
function buildCurrentNodes(
  existingNodes: Node[],
  editResult: BuildEditFlowResult | null,
): Node[] {
  if (!editResult) return existingNodes
  const nodes = [...existingNodes, ...editResult.newNodes]
  // Apply node updates
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
  // Remove deleted nodes
  const removeIds = new Set(editResult.removeNodeIds)
  return nodes.filter(n => !removeIds.has(n.id))
}
```

Refactor `validate_result` to use this same helper (also needs edges version — extract `buildCurrentEdges` too).

**System prompt guidance:** In edit instructions, add: "Variables from the current flow are already listed in the prompt above. Only call `list_variables` after `apply_edit` if you need to check what new variables are available from nodes you just created."

**Files changed:**
- `lib/ai/tools/generate-flow-edit.ts` — add tool, extract `buildCurrentNodes`/`buildCurrentEdges` helpers, refactor `validate_result` to use them
- `lib/ai/tools/flow-prompts.ts` — mention `list_variables` in edit instructions with guidance on when to use

## A4: undo_last

**Problem:** If the AI makes a bad edit, the only option is for the user to Cmd+Z after the response arrives. The AI can't self-correct by reverting.

**Solution:** Add an `undo_last` tool that resets the edit result within the current tool-use loop.

**Key constraint:** The undo system (`useUndoRedo`) is client-side. The AI tools run server-side in `generateText()`. The tool cannot call `undo()` directly.

**How it works:** When `apply_edit` is called, it stores the result via `callbacks.setEditResult()`. The server returns this as the final response, and the client applies it. If `undo_last` is called, it resets `finalEditResult` to `null`. The server then returns no updates, and the client's canvas is unchanged — the edit never reaches the client.

**Tool definition:**

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
    return { success: true, message: `Edit reverted: ${reason}. The flow is back to its original state before any edits this turn.` }
  },
})
```

**Semantics with multiple `apply_edit` calls:** Each `apply_edit` overwrites the previous result (the existing pattern — line 206 `callbacks.setEditResult(editResult)`). So after apply_edit → validate_result → apply_edit (correction), only the latest result exists. `undo_last` resets to `null`, which reverts ALL edits for this turn — not just the correction. This is the correct behavior: a full revert is simpler and less error-prone than a stack. The AI can always re-apply a fresh edit after undoing.

**Callback type change (required):** The current `EditToolCallbacks` interface at line 121 types `setEditResult` as `(result: BuildEditFlowResult) => void` — it does NOT accept `null`. Must update:

```typescript
interface EditToolCallbacks {
  setEditResult: (result: BuildEditFlowResult | null) => void
  setTemplateMetadata: (metadata: { suggestedName: string; description: string; aiMetadata: TemplateAIMetadata }) => void
  getEditResult: () => BuildEditFlowResult | null
}
```

The variable `finalEditResult` in `executeEditMode` is already typed as `BuildEditFlowResult | null` (line 43), so only the interface needs updating.

**Restriction:** Only works within the current tool-use loop. Once the response is sent to the client and applied, server-side undo is impossible. The user's Cmd+Z handles that case (the AI's entire edit is one undo entry thanks to `undoSnapshot`/`undoResumeTracking`).

**Files changed:**
- `lib/ai/tools/generate-flow-edit.ts` — add tool, update `EditToolCallbacks` interface
- `lib/ai/tools/flow-prompts.ts` — mention `undo_last` in edit instructions

## A5: Switch to Sonnet

**Problem:** Create mode uses Claude Haiku. Sonnet produces better flows.

**Change:**

```typescript
// generate-flow-create.ts
- model: 'claude-haiku',
+ model: 'claude-sonnet',

// generate-flow.ts (handleFallback)
- model: isEditRequest ? 'claude-sonnet' : 'claude-haiku',
+ model: 'claude-sonnet',
```

**Files changed:**
- `lib/ai/tools/generate-flow-create.ts` — change model
- `lib/ai/tools/generate-flow.ts` — change fallback model

## Summary of Changes by File

| File | Changes |
|------|---------|
| `lib/ai/core/node-documentation.ts` | A1: memoize 3 functions (split cache for `getNodeSelectionRules`) |
| `lib/ai/tools/generate-flow-edit.ts` | A2+A3+A4: add 3 tools, add `toolContext` param, extract `buildCurrentNodes`/`buildCurrentEdges` helpers, refactor `validate_result`, update `EditToolCallbacks` type |
| `lib/ai/tools/generate-flow.ts` | A2: add `toolContext` to `GenerateFlowRequest`, pass through to edit mode. A5: update fallback model |
| `lib/ai/tools/generate-flow-create.ts` | A5: change model from `'claude-haiku'` to `'claude-sonnet'` (in `aiClient.generateJSON()` call) |
| `lib/ai/tools/flow-prompts.ts` | A2: conditional trigger_flow mention. A3: list_variables guidance (use after apply_edit, not at start). A4: mention undo_last in edit instructions |
| `app/api/ai/flow-assistant/route.ts` | A2: extract `Authorization` header, accept `publishedFlowId`/`waAccountId`, build `toolContext` |
| `components/ai/ai-assistant.tsx` | A2: add `publishedFlowId`/`waAccountId` props, include in request body |
| `app/flow/[id]/page.tsx` | A2: pass `publishedFlowId`/`waAccountId` to `<AIAssistant />` |

## Build Order

1. **A1: node_docs_cache** — zero dependencies, pure optimization
2. **A5: Switch to Sonnet** — one-line change, independent
3. **A3: list_variables** — uses existing `collectFlowVariablesRich`, hooks into edit tools
4. **A4: undo_last** — simple callback reset, hooks into edit tools
5. **A2: trigger_flow** — needs request payload changes, client changes, API call

A1 and A5 are independent. A3 and A4 are independent of each other but both modify `createEditTools()`. A2 has the most moving parts (client + server + prompt).

## Not In Scope

- Create mode tool-use (stays as `generateObject`)
- Streaming (Phase B)
- Subagents (Phase C)
- MCP server (Phase D)
- User model selection UI
