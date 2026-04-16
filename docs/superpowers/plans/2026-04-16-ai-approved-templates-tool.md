# `list_approved_templates` Tool + `templateMessage` AI Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI flow-generation agent discover a user's Meta-approved WhatsApp templates on demand and emit fully-configured `templateMessage` nodes in create/edit flows.

**Architecture:** A new `list_approved_templates` tool (factory pattern matching `trigger_flow`) is registered into the edit-mode tool loop and the streaming-create tool loop. Five companion changes plumb `templateMessage` through the AI flow-plan pipeline (whitelist, NodeContent extension, `contentToNodeData` mapping, node documentation, `ai` field on the node template). A shared helper deduplicates `{{variable}}` extraction between the tool, the builder, and the properties panel.

**Tech Stack:** TypeScript, Next.js 14 (server-side tool execution), `ai` SDK (`streamText` / `generateText` / `tool`), Zod, vitest.

**Spec:** `docs/superpowers/specs/2026-04-16-ai-approved-templates-tool-design.md`

---

## File Map

**New files**

| Path | Responsibility |
|---|---|
| `utils/template-helpers.ts` | Shared `extractTemplateVariables(body)` — the single source of truth for `{{var}}` parsing from a template body. Used by the new tool, the flow-plan-builder, and the properties panel. |
| `utils/__tests__/template-helpers.test.ts` | Unit tests for the helper. |
| `lib/ai/tools/list-approved-templates.ts` | Tool factory `createListApprovedTemplatesTool(toolContext)` — returns `null` when auth is missing, otherwise returns a `tool()` that fetches & shapes approved templates. |
| `lib/ai/tools/__tests__/list-approved-templates.test.ts` | Unit tests for factory + tool execute. |

**Modified files**

| Path | Change |
|---|---|
| `types/flow-plan.ts` | Add `"templateMessage"` to `VALID_BASE_NODE_TYPES`. Extend `NodeContent` with template fields. |
| `utils/flow-plan-builder.ts` | Add `templateMessage` block to `contentToNodeData`. |
| `utils/__tests__/flow-plan-builder.test.ts` *(create if absent)* | Test: plan step with `nodeType: "templateMessage"` → node with expected data. |
| `components/properties-panel.tsx` | Replace inline regex at 2694-2700 with the shared helper. |
| `lib/ai/tools/generate-flow-edit.ts` | Register `list_approved_templates` in `createEditTools`. |
| `lib/ai/tools/generate-flow-create-streaming.ts` | Register `list_approved_templates` in the inline `tools` map. |
| `lib/ai/core/node-documentation.ts` | Add `templateMessage` branch to `buildDataStructure`. |
| `constants/node-categories.ts` | Fill the `ai` field on the `templateMessage` template with full guidance (the existing entry is thin). |
| `utils/flow-validator.ts` | Soft warning when a templateMessage node's `parameterMappings.length` doesn't match variables extracted from `bodyPreview`. |
| `lib/ai/tools/__tests__/generate-flow.test.ts` | Integration test: templateMessage plan step → built flow. |

---

## Task 1: Shared `extractTemplateVariables` helper

**Files:**
- Create: `utils/template-helpers.ts`
- Test: `utils/__tests__/template-helpers.test.ts`

Reason this comes first: both the tool (Task 5) and the builder (Task 4) consume this, and it's independently testable.

- [ ] **Step 1: Write the failing tests**

Create `utils/__tests__/template-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { extractTemplateVariables } from "@/utils/template-helpers"

describe("extractTemplateVariables", () => {
  it("extracts named variables in first-occurrence order", () => {
    expect(extractTemplateVariables("Hi {{first_name}} {{last_name}}"))
      .toEqual(["first_name", "last_name"])
  })

  it("extracts positional variables", () => {
    expect(extractTemplateVariables("Order {{1}} ready {{2}}"))
      .toEqual(["1", "2"])
  })

  it("handles mixed named and positional", () => {
    expect(extractTemplateVariables("{{name}} ordered {{1}}"))
      .toEqual(["name", "1"])
  })

  it("deduplicates repeated variables", () => {
    expect(extractTemplateVariables("Hi {{name}} — your order {{name}}"))
      .toEqual(["name"])
  })

  it("preserves first-occurrence order when deduping", () => {
    expect(extractTemplateVariables("{{b}} then {{a}} then {{b}} then {{c}}"))
      .toEqual(["b", "a", "c"])
  })

  it("returns empty array for body with no variables", () => {
    expect(extractTemplateVariables("No variables here")).toEqual([])
  })

  it("returns empty array for empty string", () => {
    expect(extractTemplateVariables("")).toEqual([])
  })

  it("ignores malformed braces", () => {
    expect(extractTemplateVariables("{not a var} {{valid}} {also not}"))
      .toEqual(["valid"])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- utils/__tests__/template-helpers.test.ts`
Expected: FAIL with `Cannot find module '@/utils/template-helpers'` (the implementation file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `utils/template-helpers.ts`:

```ts
/**
 * Extract variable names from a WhatsApp template body string.
 * Matches both named (`{{first_name}}`) and positional (`{{1}}`) vars.
 * Deduplicates; preserves first-occurrence order.
 *
 * Single source of truth for template variable parsing. Used by:
 * - lib/ai/tools/list-approved-templates.ts (for tool payload)
 * - utils/flow-plan-builder.ts (fallback when AI omits parameterMappings)
 * - components/properties-panel.tsx (when user picks a template)
 */
export function extractTemplateVariables(body: string): string[] {
  const matches = body.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g) || []
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const m of matches) {
    const name = m.replace(/\{\{|\}\}/g, "")
    if (!seen.has(name)) {
      seen.add(name)
      ordered.push(name)
    }
  }
  return ordered
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- utils/__tests__/template-helpers.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: no new errors. If there were pre-existing errors, they should be unchanged.

- [ ] **Step 6: Commit**

```bash
git add utils/template-helpers.ts utils/__tests__/template-helpers.test.ts
git commit -m "feat: shared extractTemplateVariables helper for {{var}} parsing"
```

---

## Task 2: Use the helper in `properties-panel.tsx`

**Files:**
- Modify: `components/properties-panel.tsx:2694-2700` (inline regex + dedup)

Reason this comes before the AI changes: it validates the helper against the exact production use, and the refactor is a no-op for behavior — easy to verify.

- [ ] **Step 1: Read the current inline logic**

Open `components/properties-panel.tsx` and locate this block (around line 2694):

```ts
const bodyVars = (tmpl.body_content || "").match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g) || []
const varNames = [...new Set<string>(bodyVars.map((m: string) => m.replace(/\{\{|\}\}/g, "")))]
// Auto-create parameter mappings for detected variables
const mappings = varNames.map((v: string) => {
  const existing = (selectedNode.data.parameterMappings || []).find((m: any) => m.templateVar === v)
  return { templateVar: v, flowValue: existing?.flowValue || "" }
})
```

- [ ] **Step 2: Replace the inline regex with the helper call**

Add to the import block at the top of the file (keep existing imports intact):

```ts
import { extractTemplateVariables } from "@/utils/template-helpers"
```

Replace the two `bodyVars`/`varNames` lines (the first two lines of the block above) with a single line:

```ts
const varNames = extractTemplateVariables(tmpl.body_content || "")
```

The rest of the block (`mappings = varNames.map(...)`) stays identical.

**NOTE:** The new helper preserves first-occurrence order; the prior `[...new Set(...)]` preserved insertion order too, so behavior is unchanged.

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: all existing tests still pass.

- [ ] **Step 5: Manual smoke in the UI**

Start the dev environment: `docker compose up -d`
Wait until the app is serving on `http://localhost:3002`.
Navigate to an existing flow, add a Template Message node (drag from sidebar), open the properties panel, pick any approved template with `{{var}}` in its body.

Expected: parameter mappings auto-populate the same as before the refactor. If you don't have approved templates to test with, skip to Step 6 — the unit tests already cover the helper.

- [ ] **Step 6: Commit**

```bash
git add components/properties-panel.tsx
git commit -m "refactor: use shared extractTemplateVariables helper in properties panel"
```

---

## Task 3: Whitelist `templateMessage` + extend `NodeContent`

**Files:**
- Modify: `types/flow-plan.ts`

- [ ] **Step 1: Add `templateMessage` to `VALID_BASE_NODE_TYPES`**

In `types/flow-plan.ts`, locate the `VALID_BASE_NODE_TYPES` array (around line 5). Under the `// Action` comment group (around line 27-29), add the new entry:

```ts
  // Action
  "apiFetch",
  "action",
  "templateMessage",
```

- [ ] **Step 2: Extend the `NodeContent` interface**

In the same file, find the `NodeContent` interface (around line 49). After the existing `// action node fields` block, append:

```ts
  // templateMessage fields (Meta-approved WhatsApp templates)
  templateName?: string
  displayName?: string
  language?: string
  category?: string
  headerType?: string
  bodyPreview?: string
  parameterMappings?: Array<{ templateVar: string; flowValue: string }>
  templateButtons?: Array<{ type: string; text: string; url?: string; id?: string }>
```

Do NOT rename or touch the existing `templateId?: string` field (line 59) — that's used by `flowTemplate` nodes and is being reused for templateMessage too.

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: all tests still pass (we haven't changed any runtime code yet, only types + the whitelist constant).

- [ ] **Step 5: Commit**

```bash
git add types/flow-plan.ts
git commit -m "feat: whitelist templateMessage in flow plan + extend NodeContent"
```

---

## Task 4: Handle `templateMessage` in `contentToNodeData`

**Files:**
- Modify: `utils/flow-plan-builder.ts` (function `contentToNodeData`, around line 1312)
- Test: `utils/__tests__/flow-plan-builder.test.ts` (create if absent — check first)

- [ ] **Step 1: Check whether the test file already exists**

Run: `ls utils/__tests__/flow-plan-builder.test.ts 2>/dev/null && echo EXISTS || echo MISSING`

If EXISTS, the tests in step 2 will be appended; if MISSING, create the file with the full contents shown.

- [ ] **Step 2: Write the failing tests**

Add to (or create) `utils/__tests__/flow-plan-builder.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildFlowFromPlan } from "@/utils/flow-plan-builder"
import type { FlowPlan } from "@/types/flow-plan"

describe("buildFlowFromPlan — templateMessage", () => {
  const basePlan = (content: any): FlowPlan => ({
    message: "test",
    steps: [
      {
        step: "node",
        nodeType: "templateMessage",
        content,
      },
    ],
  })

  it("builds a templateMessage node with full content", () => {
    const plan = basePlan({
      templateId: "tpl-123",
      templateName: "order_confirmation",
      displayName: "Order Confirmation",
      language: "en",
      category: "UTILITY",
      headerType: "TEXT",
      bodyPreview: "Hi {{first_name}}, your order {{order_id}} is ready",
      parameterMappings: [
        { templateVar: "first_name", flowValue: "{{user_name}}" },
        { templateVar: "order_id", flowValue: "{{order_id}}" },
      ],
      templateButtons: [
        { type: "QUICK_REPLY", text: "Track order" },
        { type: "URL", text: "View", url: "https://example.com" },
      ],
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined)

    const templateNode = result.nodes.find((n) => n.type === "templateMessage")
    expect(templateNode).toBeDefined()
    const data = templateNode!.data as any
    expect(data.templateId).toBe("tpl-123")
    expect(data.templateName).toBe("order_confirmation")
    expect(data.displayName).toBe("Order Confirmation")
    expect(data.language).toBe("en")
    expect(data.category).toBe("UTILITY")
    expect(data.headerType).toBe("TEXT")
    expect(data.bodyPreview).toBe("Hi {{first_name}}, your order {{order_id}} is ready")
    expect(data.parameterMappings).toEqual([
      { templateVar: "first_name", flowValue: "{{user_name}}" },
      { templateVar: "order_id", flowValue: "{{order_id}}" },
    ])
    expect(data.buttons).toHaveLength(2)
    expect(data.buttons[0]).toMatchObject({ type: "QUICK_REPLY", text: "Track order", id: "btn-0" })
    expect(data.buttons[1]).toMatchObject({ type: "URL", text: "View", url: "https://example.com", id: "btn-1" })
  })

  it("seeds parameterMappings from bodyPreview when AI omits them", () => {
    const plan = basePlan({
      templateName: "welcome",
      bodyPreview: "Hi {{first_name}}, welcome {{company}}",
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined)
    const data = result.nodes.find((n) => n.type === "templateMessage")!.data as any

    expect(data.parameterMappings).toEqual([
      { templateVar: "first_name", flowValue: "" },
      { templateVar: "company", flowValue: "" },
    ])
  })

  it("uses displayName for label when label is absent", () => {
    const plan = basePlan({
      templateName: "x",
      displayName: "Welcome Template",
      bodyPreview: "hello",
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined)
    const data = result.nodes.find((n) => n.type === "templateMessage")!.data as any

    // Factory default is "Template Message"; content.displayName should NOT
    // overwrite label unless content.label is provided (current pattern for
    // other node types). Verify factory-default label is preserved.
    expect(data.label).toBe("Template Message")
    expect(data.displayName).toBe("Welcome Template")
  })

  it("builds a clean node when the template has no variables", () => {
    const plan = basePlan({
      templateName: "simple",
      bodyPreview: "Thanks for shopping with us!",
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined)
    const data = result.nodes.find((n) => n.type === "templateMessage")!.data as any

    expect(data.parameterMappings).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- utils/__tests__/flow-plan-builder.test.ts`
Expected: FAIL. The `templateNode` assertion succeeds (factory creates the node), but the template-specific `data.*` fields will be `""` or missing because `contentToNodeData` doesn't copy them over yet.

- [ ] **Step 4: Implement the `templateMessage` branch in `contentToNodeData`**

Open `utils/flow-plan-builder.ts`. Add the import at the top (near the other `utils/` imports around lines 34-41):

```ts
import { extractTemplateVariables } from "./template-helpers"
```

Locate `contentToNodeData` (around line 1312). Immediately before the `return data` line (around line 1341), append:

```ts
  // templateMessage — Meta-approved WhatsApp templates
  if (nodeType === "templateMessage") {
    if (content.templateId) data.templateId = content.templateId
    if (content.templateName) data.templateName = content.templateName
    if (content.displayName) data.displayName = content.displayName
    if (content.language) data.language = content.language
    if (content.category) data.category = content.category
    if (content.headerType) data.headerType = content.headerType
    if (content.bodyPreview) data.bodyPreview = content.bodyPreview

    if (content.templateButtons) {
      data.buttons = content.templateButtons.map((b, i) => ({
        ...b,
        id: b.id || `btn-${i}`,
      }))
    }

    if (content.parameterMappings) {
      data.parameterMappings = content.parameterMappings
    } else if (content.bodyPreview) {
      data.parameterMappings = extractTemplateVariables(content.bodyPreview)
        .map((v) => ({ templateVar: v, flowValue: "" }))
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- utils/__tests__/flow-plan-builder.test.ts`
Expected: PASS (4 new tests).

- [ ] **Step 6: Run the full test suite to check for regressions**

Run: `npm run test`
Expected: no previously-passing tests break.

- [ ] **Step 7: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add utils/flow-plan-builder.ts utils/__tests__/flow-plan-builder.test.ts
git commit -m "feat: map templateMessage plan content to node data in builder"
```

---

## Task 5: `list_approved_templates` tool

**Files:**
- Create: `lib/ai/tools/list-approved-templates.ts`
- Test: `lib/ai/tools/__tests__/list-approved-templates.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/ai/tools/__tests__/list-approved-templates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  createListApprovedTemplatesTool,
  fetchApprovedTemplates,
} from "../list-approved-templates"

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.FS_WHATSAPP_API_URL = "http://fs-wa.test"
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("createListApprovedTemplatesTool (factory)", () => {
  it("returns null when authHeader is missing", () => {
    const t = createListApprovedTemplatesTool({ publishedFlowId: "x" } as any)
    expect(t).toBeNull()
  })

  it("returns null when FS_WHATSAPP_API_URL is unset", () => {
    delete process.env.FS_WHATSAPP_API_URL
    const t = createListApprovedTemplatesTool({ authHeader: "Bearer abc" })
    expect(t).toBeNull()
  })

  it("returns null when toolContext is undefined", () => {
    expect(createListApprovedTemplatesTool(undefined)).toBeNull()
  })

  it("returns a tool object when auth + apiUrl present", () => {
    const t = createListApprovedTemplatesTool({ authHeader: "Bearer abc" })
    expect(t).not.toBeNull()
    expect(t).toHaveProperty("description")
  })
})

describe("fetchApprovedTemplates (executor)", () => {
  function mockFetchResponse(status: number, body: any) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  it("hits the correct URL with Authorization header", async () => {
    const fetchMock = mockFetchResponse(200, { templates: [] })

    await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")

    expect(fetchMock).toHaveBeenCalledWith(
      "http://fs-wa.test/api/templates?status=APPROVED",
      { headers: { Authorization: "Bearer abc" } }
    )
  })

  it("shapes a template response into the expected payload", async () => {
    mockFetchResponse(200, {
      templates: [
        {
          id: "tpl-1",
          name: "order_confirmation",
          display_name: "Order Confirmation",
          language: "en",
          category: "UTILITY",
          header_type: "TEXT",
          body_content: "Hi {{first_name}}, order {{order_id}} is ready",
          buttons: [
            { type: "QUICK_REPLY", text: "Track" },
            { type: "URL", text: "View", url: "https://x.test/{{order_id}}" },
          ],
        },
      ],
    })

    const result = await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")

    expect(result.success).toBe(true)
    if (!result.success) return // narrow for TS
    expect(result.count).toBe(1)
    expect(result.templates[0]).toEqual({
      id: "tpl-1",
      name: "order_confirmation",
      displayName: "Order Confirmation",
      language: "en",
      category: "UTILITY",
      headerType: "TEXT",
      body: "Hi {{first_name}}, order {{order_id}} is ready",
      variables: ["first_name", "order_id"],
      buttons: [
        { type: "QUICK_REPLY", text: "Track" },
        { type: "URL", text: "View", url: "https://x.test/{{order_id}}" },
      ],
    })
  })

  it("handles bare-array response (no 'templates' wrapper)", async () => {
    mockFetchResponse(200, [
      { id: "t1", name: "a", language: "en", category: "UTILITY", body_content: "hi", buttons: [] },
    ])

    const result = await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.templates).toHaveLength(1)
  })

  it("returns success=false on non-OK response", async () => {
    mockFetchResponse(500, { error: "boom" })
    const result = await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")
    expect(result).toEqual({ success: false, error: "HTTP 500" })
  })

  it("returns success=false on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))
    const result = await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")
    expect(result).toEqual({ success: false, error: "ECONNREFUSED" })
  })

  it("omits url field for non-URL buttons", async () => {
    mockFetchResponse(200, {
      templates: [
        {
          id: "t",
          name: "x",
          language: "en",
          category: "MARKETING",
          body_content: "",
          buttons: [
            { type: "QUICK_REPLY", text: "Hi", url: undefined },
            { type: "PHONE_NUMBER", text: "Call" },
          ],
        },
      ],
    })

    const result = await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")
    if (!result.success) throw new Error("expected success")
    const btns = result.templates[0].buttons
    expect(btns[0]).not.toHaveProperty("url")
    expect(btns[1]).not.toHaveProperty("url")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- lib/ai/tools/__tests__/list-approved-templates.test.ts`
Expected: FAIL with `Cannot find module '../list-approved-templates'`.

- [ ] **Step 3: Implement the tool**

Create `lib/ai/tools/list-approved-templates.ts`:

```ts
import { tool } from "ai"
import { z } from "zod"
import { extractTemplateVariables } from "@/utils/template-helpers"
import type { GenerateFlowRequest } from "./generate-flow"

type ShapedTemplate = {
  id: string
  name: string
  displayName?: string
  language: string
  category: string
  headerType?: string
  body: string
  variables: string[]
  buttons: Array<{ type: string; text: string; url?: string }>
}

export type FetchApprovedTemplatesResult =
  | { success: true; templates: ShapedTemplate[]; count: number }
  | { success: false; error: string }

/**
 * Pure executor: hits the backend, shapes the response, returns a discriminated
 * union. Exported separately so tests can exercise the logic without dealing
 * with the AI SDK's tool() wrapper types.
 */
export async function fetchApprovedTemplates(
  apiUrl: string,
  authHeader: string,
): Promise<FetchApprovedTemplatesResult> {
  try {
    const res = await fetch(`${apiUrl}/api/templates?status=APPROVED`, {
      headers: { Authorization: authHeader },
    })
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` }
    }
    const data = await res.json()
    const raw = Array.isArray(data) ? data : data?.templates || []
    const templates = raw.map(shapeTemplate)
    return { success: true, templates, count: templates.length }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    }
  }
}

/**
 * Factory for the `list_approved_templates` AI tool. Returns `null` when
 * auth context or backend URL is missing — in which case the tool should
 * not be registered in the agent's tool map. Same pattern as `trigger_flow`.
 *
 * The tool lists the authenticated user's Meta-approved WhatsApp templates
 * with enough detail for the AI to drop a fully-configured templateMessage
 * node (name, body, variables, buttons, category, language) in one call.
 */
export function createListApprovedTemplatesTool(
  toolContext: GenerateFlowRequest["toolContext"] | undefined,
) {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  if (!apiUrl || !toolContext?.authHeader) return null
  const authHeader = toolContext.authHeader

  return tool({
    description:
      "List the authenticated user's Meta-approved WhatsApp templates. Call this before placing a templateMessage node. Returns id, name, body, extracted variables, buttons, category, and language for each approved template. Never invent template names — always call this first.",
    inputSchema: z.object({}),
    execute: async () => fetchApprovedTemplates(apiUrl, authHeader),
  })
}

function shapeTemplate(t: any): ShapedTemplate {
  const body = t.body_content || ""
  return {
    id: t.id,
    name: t.name,
    ...(t.display_name ? { displayName: t.display_name } : {}),
    language: t.language,
    category: t.category,
    ...(t.header_type ? { headerType: t.header_type } : {}),
    body,
    variables: extractTemplateVariables(body),
    buttons: (t.buttons || []).map((b: any) => ({
      type: b.type,
      text: b.text,
      ...(b.url ? { url: b.url } : {}),
    })),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- lib/ai/tools/__tests__/list-approved-templates.test.ts`
Expected: PASS (10 tests — 4 factory cases + 6 executor cases).

- [ ] **Step 5: Run full test suite + typecheck**

Run: `npm run test && npx tsc --noEmit`
Expected: all pass, no new type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/tools/list-approved-templates.ts lib/ai/tools/__tests__/list-approved-templates.test.ts
git commit -m "feat: list_approved_templates AI tool for Meta-approved WhatsApp templates"
```

---

## Task 6: Register the tool in edit mode

**Files:**
- Modify: `lib/ai/tools/generate-flow-edit.ts` (function `createEditTools`, around line 449)

- [ ] **Step 1: Add the import**

At the top of `lib/ai/tools/generate-flow-edit.ts`, below the other local tool imports (around line 23):

```ts
import { createListApprovedTemplatesTool } from "./list-approved-templates"
```

- [ ] **Step 2: Register inside `createEditTools`**

Find `createEditTools` (around line 449). The function builds `baseTools` as a const, then conditionally merges `trigger_flow` before returning. Modify it so the new tool is merged into `baseTools` when available AND the platform is WhatsApp.

Replace the final return block of `createEditTools` — the one that looks like this:

```ts
  const apiUrl = process.env.FS_WHATSAPP_API_URL

  if (toolContext?.publishedFlowId && request.platform === 'whatsapp' && apiUrl && toolContext.authHeader) {
    const { publishedFlowId, waAccountName, authHeader } = toolContext
    return {
      ...baseTools,
      trigger_flow: tool({ /* ... */ }),
    }
  }

  return baseTools
}
```

With:

```ts
  const apiUrl = process.env.FS_WHATSAPP_API_URL

  // Attach list_approved_templates whenever the user is authenticated AND
  // on WhatsApp — doesn't require a published flow.
  const listTemplatesTool =
    request.platform === 'whatsapp'
      ? createListApprovedTemplatesTool(toolContext)
      : null
  const toolsWithTemplates = listTemplatesTool
    ? { ...baseTools, list_approved_templates: listTemplatesTool }
    : baseTools

  if (toolContext?.publishedFlowId && request.platform === 'whatsapp' && apiUrl && toolContext.authHeader) {
    const { publishedFlowId, waAccountName, authHeader } = toolContext
    return {
      ...toolsWithTemplates,
      trigger_flow: tool({ /* ... keep the EXISTING trigger_flow definition unchanged ... */ }),
    }
  }

  return toolsWithTemplates
}
```

**NOTE:** Do NOT re-type the body of `trigger_flow`; leave its full definition (lines 795-827 in the current file) intact — only change the return object so both `list_approved_templates` and `trigger_flow` can appear in the final tool map together when applicable.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: all pass, including the existing phase-a tests that assert the presence of `toolContext` wiring.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/tools/generate-flow-edit.ts
git commit -m "feat: register list_approved_templates in edit-mode tool loop"
```

---

## Task 7: Register the tool in streaming create mode

**Files:**
- Modify: `lib/ai/tools/generate-flow-create-streaming.ts`

- [ ] **Step 1: Add the import**

At the top of `lib/ai/tools/generate-flow-create-streaming.ts` (near the other local imports, after the `buildToolStepPayload, nodeBrief` import around line 12):

```ts
import { createListApprovedTemplatesTool } from "./list-approved-templates"
```

- [ ] **Step 2: Conditionally add the tool to the `tools` map**

In `executeCreateModeStreaming`, find the `streamText({ ... tools: { build_and_validate: tool({ ... }) } })` call (starts around line 31). Currently the `tools` object contains only `build_and_validate`. Replace the static `tools` field with a variable computed just above `streamText()`:

```ts
  const listTemplatesTool =
    request.platform === 'whatsapp'
      ? createListApprovedTemplatesTool(request.toolContext)
      : null

  const result = streamText({
    model: getModel('claude-sonnet'),
    system: systemPrompt + `\n\n**IMPORTANT:** You have a \`build_and_validate\` tool. After describing your plan, call it with your flow plan JSON. The tool will build the flow and validate it. If there are issues, fix them and call the tool again. Do NOT output raw JSON — always use the tool.`,
    prompt: userPrompt,
    tools: {
      ...(listTemplatesTool ? { list_approved_templates: listTemplatesTool } : {}),
      build_and_validate: tool({
        // ... keep the EXISTING build_and_validate definition unchanged ...
      }),
    },
    stopWhen: stepCountIs(8),
    // ... rest unchanged ...
  })
```

**NOTE:** Do NOT re-type the body of `build_and_validate`; leave its full definition intact. Only add the conditional spread for `list_approved_templates` ahead of it in the `tools` object.

- [ ] **Step 3: Extend the system prompt nudge**

Since streaming create previously had one tool, the system-prompt hint mentioned only `build_and_validate`. Update the `system:` string inside `streamText` to mention both. Change this line:

```ts
    system: systemPrompt + `\n\n**IMPORTANT:** You have a \`build_and_validate\` tool. After describing your plan, call it with your flow plan JSON. The tool will build the flow and validate it. If there are issues, fix them and call the tool again. Do NOT output raw JSON — always use the tool.`,
```

To:

```ts
    system: systemPrompt + `\n\n**IMPORTANT:** You have a \`build_and_validate\` tool. After describing your plan, call it with your flow plan JSON. The tool will build the flow and validate it. If there are issues, fix them and call the tool again. Do NOT output raw JSON — always use the tool.${
      listTemplatesTool
        ? "\n\nIf the user mentions a WhatsApp template by name or asks for a template message, FIRST call \`list_approved_templates\` to see what's available, THEN call \`build_and_validate\` with real template data."
        : ""
    }`,
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/tools/generate-flow-create-streaming.ts
git commit -m "feat: register list_approved_templates in streaming create tool loop"
```

---

## Task 8: Teach the AI about `templateMessage` data in `buildDataStructure`

**Files:**
- Modify: `lib/ai/core/node-documentation.ts` (function `buildDataStructure`, around line 255)

- [ ] **Step 1: Add the `templateMessage` branch**

In `lib/ai/core/node-documentation.ts`, find `buildDataStructure` (line 255). After the `whatsappFlow` branch (around line 334) and before the `trackingNotification` branch, insert:

```ts
  // Template message (Meta-approved WhatsApp templates)
  if (t === "templateMessage") {
    base.templateId = "string (template's backend ID — from list_approved_templates)"
    base.templateName = "string (Meta-registered template name — from list_approved_templates.name)"
    base.displayName = "string (optional human-readable name)"
    base.language = "string (e.g., 'en', 'en_US')"
    base.category = "MARKETING | UTILITY | AUTHENTICATION"
    base.headerType = "TEXT | IMAGE | VIDEO | DOCUMENT (optional)"
    base.bodyPreview = "string (full template body with {{vars}} intact)"
    base.templateButtons = [
      {
        type: "QUICK_REPLY | URL | PHONE_NUMBER | COPY_CODE",
        text: "string (button label)",
        url: "string (for URL buttons only)",
      },
    ]
    base.parameterMappings = [
      {
        templateVar: "string (variable name from the template body, e.g. 'first_name' or '1')",
        flowValue: "string (literal value or {{variable_name}} reference to a flow variable)",
      },
    ]
  }
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/core/node-documentation.ts
git commit -m "feat: document templateMessage data shape for AI prompts"
```

---

## Task 9: Fill the `ai` field on the `templateMessage` node template

**Files:**
- Modify: `constants/node-categories.ts` (entry at line 428)

- [ ] **Step 1: Replace the thin `ai` field with full guidance**

In `constants/node-categories.ts`, locate the `templateMessage` entry (starts at line 428). Replace the existing `ai: { ... }` block (currently lines 435-448 — `whenToUse`, `bestPractices`, `examples`, `requiredProperties`, `optionalProperties`) with this expanded version. Keep all fields around the `ai` block (`type`, `icon`, `label`, `description`, `category`, `platforms`, `limits`) untouched.

```ts
    ai: {
      description:
        "Send a pre-approved Meta WhatsApp template message. Required for outbound-initiated conversations and messages outside the 24-hour customer service window.",
      whenToUse:
        "When the conversation needs to send a pre-approved Meta template — e.g. order confirmations, appointment reminders, re-engagement campaigns, any outbound message outside the 24-hour customer service window.",
      selectionRule:
        "Only usable on WhatsApp. Requires calling `list_approved_templates` first to discover available templates. NEVER guess a template name — always use one returned by the tool.",
      contentFields:
        "templateId, templateName, displayName, language, category, bodyPreview, headerType, templateButtons[{type,text,url?}], parameterMappings[{templateVar, flowValue}]",
      bestPractices: [
        "Always call `list_approved_templates` before choosing a template — never guess names",
        "Map every `{{var}}` in the body to a parameterMappings entry",
        "Use `{{variable_name}}` in flowValue when the value comes from earlier in the flow",
        "Use literal strings in flowValue for static substitutions",
        "Templates must be pre-approved by Meta before use — only APPROVED status is selectable",
      ],
      examples: [
        "Send order_confirmation template with customer name and order ID",
        "Send appointment_reminder template the day before a booking",
        "Re-engage a dormant contact with a marketing template",
      ],
      requiredProperties: ["label", "platform", "templateId", "templateName", "language"],
      optionalProperties: ["displayName", "category", "headerType", "bodyPreview", "templateButtons", "parameterMappings"],
    },
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all pass. If any test asserts on the prior `ai` content (unlikely — this is guidance, not structure), update the assertion to match.

- [ ] **Step 4: Commit**

```bash
git add constants/node-categories.ts
git commit -m "feat: flesh out templateMessage ai field for flow-generation guidance"
```

---

## Task 10: Validator soft warning for mapping mismatch

**Files:**
- Modify: `utils/flow-validator.ts` (function `validateGeneratedFlow`)

Purpose: when a `templateMessage` node's `parameterMappings` doesn't cover every variable in its `bodyPreview`, flag it — so the streaming agent self-corrects in the build_and_validate retry loop.

- [ ] **Step 1: Add the import**

At the top of `utils/flow-validator.ts`, below the other `utils` imports:

```ts
import { extractTemplateVariables } from "./template-helpers"
```

- [ ] **Step 2: Extend `FlowIssue`'s `type` union**

Locate `FlowIssue` (around line 8). Add a new issue type to the union:

```ts
export interface FlowIssue {
  type:
    | "orphaned_node"
    | "undefined_variable"
    | "button_limit_exceeded"
    | "empty_content"
    | "unconnected_handle"
    | "unconnected_button"
    | "converter_error"
    | "template_mapping_gap"
  // ... rest unchanged
```

- [ ] **Step 3: Add the validation check**

In `validateGeneratedFlow` (line 34), find a stable spot near the other per-node checks — e.g. right after the "unconnected handles" block (around line 95, before any post-node aggregation). Insert:

```ts
  // templateMessage: parameterMappings should cover every {{var}} in bodyPreview.
  // Soft warning — doesn't invalidate the flow (user can still fill in the panel),
  // but surfaces the gap to the AI's self-correction loop.
  for (const node of contentNodes) {
    if (node.type !== "templateMessage") continue
    const data = node.data as any
    const body = data?.bodyPreview || ""
    const bodyVars = extractTemplateVariables(body)
    const mappedVars = new Set(
      (data?.parameterMappings || [])
        .map((m: any) => m.templateVar)
        .filter(Boolean),
    )
    const missing = bodyVars.filter((v) => !mappedVars.has(v))
    if (missing.length > 0) {
      issues.push({
        type: "template_mapping_gap",
        nodeId: node.id,
        nodeLabel: data?.label || "templateMessage",
        detail: `Template body references {{${missing.join("}}, {{")}}} but parameterMappings is missing these variables.`,
        hint: `Add a parameterMappings entry for each missing variable, using either a literal value or a {{flow_variable}} reference.`,
      })
    }
  }
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: all pass. If any existing flow-validator test builds a templateMessage node, it may now produce a new warning — update those assertions if needed.

- [ ] **Step 6: Commit**

```bash
git add utils/flow-validator.ts
git commit -m "feat: validator soft warning when templateMessage mappings miss body vars"
```

---

## Task 11: Integration test — plan with `templateMessage` end-to-end

**Files:**
- Modify: `lib/ai/tools/__tests__/generate-flow.test.ts`

Goal: one integration-level test that exercises the full plan → builder → validator path for a `templateMessage` step.

- [ ] **Step 1: Add the test**

Append to `lib/ai/tools/__tests__/generate-flow.test.ts` (use the existing `describe`/`it` import already at the top of the file):

```ts
import { buildFlowFromPlan } from "@/utils/flow-plan-builder"
import { validateGeneratedFlow } from "@/utils/flow-validator"
import type { FlowPlan } from "@/types/flow-plan"

describe("integration: templateMessage plan → flow", () => {
  it("builds and validates a flow starting with a fully-mapped template", () => {
    const plan: FlowPlan = {
      message: "Start with the order_confirmation template",
      steps: [
        {
          step: "node",
          nodeType: "templateMessage",
          content: {
            templateId: "tpl-oc",
            templateName: "order_confirmation",
            displayName: "Order Confirmation",
            language: "en",
            category: "UTILITY",
            bodyPreview: "Hi {{first_name}}, your order {{order_id}} is confirmed",
            parameterMappings: [
              { templateVar: "first_name", flowValue: "{{user_name}}" },
              { templateVar: "order_id", flowValue: "{{last_order_id}}" },
            ],
            templateButtons: [
              { type: "QUICK_REPLY", text: "Track order" },
            ],
          },
        },
      ],
    }

    const result = buildFlowFromPlan(plan, "whatsapp", undefined)
    const templateNode = result.nodes.find((n) => n.type === "templateMessage")
    expect(templateNode).toBeDefined()

    const validation = validateGeneratedFlow(result.nodes, result.edges, "whatsapp")
    // The flow may produce other warnings (orphan start edge etc. depending
    // on builder behavior for a 1-step plan) — just assert no template-mapping
    // gap is reported since all vars are mapped.
    const templateIssues = validation.issues.filter((i) => i.type === "template_mapping_gap")
    expect(templateIssues).toHaveLength(0)
  })

  it("reports template_mapping_gap when AI forgot a variable", () => {
    const plan: FlowPlan = {
      message: "Welcome template",
      steps: [
        {
          step: "node",
          nodeType: "templateMessage",
          content: {
            templateId: "tpl-w",
            templateName: "welcome",
            language: "en",
            category: "MARKETING",
            bodyPreview: "Hi {{first_name}} from {{company}}",
            parameterMappings: [
              { templateVar: "first_name", flowValue: "{{user_name}}" },
              // {{company}} intentionally missing
            ],
          },
        },
      ],
    }

    const result = buildFlowFromPlan(plan, "whatsapp", undefined)
    const validation = validateGeneratedFlow(result.nodes, result.edges, "whatsapp")
    const gap = validation.issues.find((i) => i.type === "template_mapping_gap")
    expect(gap).toBeDefined()
    expect(gap!.detail).toContain("company")
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npm run test -- lib/ai/tools/__tests__/generate-flow.test.ts`
Expected: PASS (both new tests, plus all pre-existing tests in the file).

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/__tests__/generate-flow.test.ts
git commit -m "test: integration — templateMessage plan built + validated end-to-end"
```

---

## Task 12: Manual smoke test in the running app

**Files:** none — runtime verification only.

- [ ] **Step 1: Start the dev environment**

Run: `docker compose up -d`
Wait until logs show the app is ready on `http://localhost:3002`:
Run: `docker logs magic-flow-app-1 --tail 50`
Expected: `✓ Ready in ...ms` line.

- [ ] **Step 2: Prepare at least one approved WhatsApp template**

Log into magic-flow. Navigate to Templates. If there are no `APPROVED` templates, either sync from Meta (if your sandbox is connected) or mark one manually via the backend for test purposes. Confirm at least one template with variables is visible as Approved.

- [ ] **Step 3: Smoke — streaming create path**

Open a **fresh** flow on WhatsApp platform. Open the AI assistant. Prompt:

> "Build me a flow that starts with the `<your_template_name>` template, then asks the customer for delivery feedback."

Expected:
- The AI emits a `list_approved_templates` tool step (visible in the chat activity log).
- A `build_and_validate` step follows.
- The canvas renders a `templateMessage` node with `templateName`, `bodyPreview`, and `parameterMappings` populated from the real template, followed by a question node for feedback.
- No errors in `docker logs magic-flow-app-1`.

- [ ] **Step 4: Smoke — edit path**

Open an existing flow that already has a `whatsappMessage` or welcome node. Prompt:

> "Replace the welcome message with the `<your_template_name>` template."

Expected:
- The AI emits `list_approved_templates`, then `apply_edit`, then `validate_result`.
- The canvas swaps the original node for a `templateMessage` with the real data.
- Cmd+Z reverts the AI edit as a single undo step.

- [ ] **Step 5: Smoke — empty-templates graceful fallback**

Temporarily ensure the user has **no** approved templates (or run against an account that doesn't). Prompt the same as Step 3. Expected: the AI explains no approved templates exist and falls back to a plain message node (no crash, no hallucinated template name).

- [ ] **Step 6: No commit**

This task has no code changes. If any of the smoke tests reveal a bug, fix it as a targeted commit in a follow-up task rather than bundling into this checkpoint.

---

## Post-implementation checklist

- [ ] All commits land in order; each task builds green on its own (`npm run test && npx tsc --noEmit` after every task).
- [ ] Spec doc (`docs/superpowers/specs/2026-04-16-ai-approved-templates-tool-design.md`) reflects final shape if anything diverged during implementation.
- [ ] No regression in existing flow-generation tests (`lib/ai/tools/__tests__/generate-flow.test.ts`, `lib/ai/__tests__/phase-a.test.ts`).
- [ ] Manual smoke results captured in the PR description (which template was used, which prompts were run).
