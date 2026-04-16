# AI Tool: `list_approved_templates` + `templateMessage` Node in AI Pipeline

**Date:** 2026-04-16
**Status:** Design — pending implementation plan

## Summary

Add a new AI reconnaissance tool, `list_approved_templates`, that lets the generation agent fetch the authenticated user's Meta-approved WhatsApp templates on demand during flow create/edit. In the same change, plumb the existing `templateMessage` node type through the AI flow-plan pipeline so the agent can actually produce a fully-configured template message node from a plan.

End-state user experience: a prompt like *"build me a flow that starts with the `order_confirmation` template"* or *"replace the welcome message with the greeting template"* results in a canvas with a real `templateMessage` node whose `templateName`, `bodyPreview`, `buttons`, and `parameterMappings` are populated from the actual approved template.

## Motivation

Today, the AI cannot place a `templateMessage` node. The node exists on the canvas (`components/nodes/action/template-message-node.tsx`) and in the palette (`constants/node-categories.ts:428`), but:

- It is not in `VALID_BASE_NODE_TYPES` (`types/flow-plan.ts`), so `buildFlowFromPlan` silently drops any AI-emitted templateMessage step.
- The AI has no way to discover which Meta templates the user has approved, which means even if it could emit the step, it would hallucinate template names.

Meta templates are the main way businesses send messages outside the 24-hour customer service window, so a flow without access to them is a flow with a big hole in it.

## Non-Goals (v1)

- Header variables (`{{customer_name}}` in a TEXT header) — body-only mappings in v1.
- Media header filling (IMAGE/VIDEO/DOCUMENT template headers) — the agent can pick the template, the user fills the media handle in the properties panel.
- WhatsApp Flows attachments on templates.
- Filter/search arguments on the tool — return everything, optimize later if needed.
- Instagram/web. Tool is WhatsApp-only.
- Support in the non-streaming `executeCreateMode` fallback path (single-JSON call, no agent loop).

## Design

### Component overview

```
┌─────────────────────────────┐
│ lib/ai/tools/               │
│  list-approved-templates.ts │  ← NEW: the tool factory
└────────────┬────────────────┘
             │ registered into
             ▼
┌─────────────────────────────────────────┐
│ executeEditMode / executeEditModeStreaming │
│ executeCreateModeStreaming                 │
└─────────────┬───────────────────────────┘
              │ emits plan with templateMessage step
              ▼
┌─────────────────────────────────────────┐
│ types/flow-plan.ts                       │  ← EXTEND: whitelist + NodeContent fields
│ utils/flow-plan-builder.ts               │  ← EXTEND: templateMessage case
│ utils/template-helpers.ts                │  ← NEW: shared {{var}} extractor
│ lib/ai/core/node-documentation.ts        │  ← EXTEND: buildDataStructure case
│ constants/node-categories.ts             │  ← EXTEND: `ai` field on templateMessage
└─────────────────────────────────────────┘
```

### 1. The tool — `list-approved-templates.ts`

Exported as `createListApprovedTemplatesTool(toolContext)` — factory pattern that closes over `authHeader` + `FS_WHATSAPP_API_URL`, matching how `trigger_flow` is built inside `generate-flow-edit.ts`.

```ts
// lib/ai/tools/list-approved-templates.ts
import { tool } from 'ai'
import { z } from 'zod'
import { extractTemplateVariables } from '@/utils/template-helpers'
import type { GenerateFlowRequest } from './generate-flow'

export function createListApprovedTemplatesTool(
  toolContext: GenerateFlowRequest['toolContext'] | undefined
) {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  if (!apiUrl || !toolContext?.authHeader) return null

  return tool({
    description:
      'List the authenticated user\'s Meta-approved WhatsApp templates. ' +
      'Call this before placing a templateMessage node. Returns template ' +
      'id, name, body, variables, buttons, category, and language for each ' +
      'approved template. Never invent template names — always call this first.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const res = await fetch(`${apiUrl}/api/templates?status=APPROVED`, {
          headers: { Authorization: toolContext.authHeader! },
        })
        if (!res.ok) {
          return {
            success: false,
            error: `HTTP ${res.status}`,
          }
        }
        const data = await res.json()
        const raw = Array.isArray(data) ? data : data?.templates || []
        const templates = raw.map(shapeTemplate)
        return { success: true, templates, count: templates.length }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Network error',
        }
      }
    },
  })
}

function shapeTemplate(t: any) {
  return {
    id: t.id,
    name: t.name,
    displayName: t.display_name || undefined,
    language: t.language,
    category: t.category,
    headerType: t.header_type || undefined,
    body: t.body_content || '',
    variables: extractTemplateVariables(t.body_content || ''),
    buttons: (t.buttons || []).map((b: any) => ({
      type: b.type,
      text: b.text,
      ...(b.url ? { url: b.url } : {}),
    })),
  }
}
```

### 2. Tool registration

**Edit mode (`lib/ai/tools/generate-flow-edit.ts`):** inside `createEditTools`, add the tool to `baseTools` unconditionally. If the factory returns `null` (auth missing), skip it. Same guard pattern as `trigger_flow`.

**Create streaming (`lib/ai/tools/generate-flow-create-streaming.ts`):** add to the inline `tools: { ... }` map passed to `streamText`. The tool sits alongside `build_and_validate`.

Platform gate: only register when `request.platform === 'whatsapp'`.

Step budget in streaming create: `stepCountIs(8)` already leaves headroom for `list_approved_templates → build_and_validate → (optional retry) → build_and_validate`. Revisit if logs show step exhaustion.

### 3. Tool return payload

```ts
type ShapedTemplate = {
  id: string
  name: string              // the Meta template name (maps to data.templateName)
  displayName?: string      // maps to data.displayName
  language: string
  category: string          // MARKETING | UTILITY | AUTHENTICATION
  headerType?: string       // TEXT | IMAGE | VIDEO | DOCUMENT | null
  body: string              // full body content with {{vars}} intact (maps to data.bodyPreview)
  variables: string[]       // extracted from body, deduped, ordered by first occurrence
  buttons: Array<{
    type: string            // QUICK_REPLY | URL | PHONE_NUMBER | COPY_CODE
    text: string
    url?: string
  }>
}

type ToolReturn =
  | { success: true; templates: ShapedTemplate[]; count: number }
  | { success: false; error: string }
```

Dropped fields (present on API response, not useful to the AI): `created_at`, `updated_at`, internal status flags, sample values, footer text, header sub-fields beyond `header_type`. The UI owns those; the agent doesn't reason about them.

Rough token budget: ~200 tokens per template. A user with 20 approved templates is ~4k tokens per tool return — well within the step budget.

### 4. `templateMessage` in the AI pipeline

#### 4a. `types/flow-plan.ts`

Add to `VALID_BASE_NODE_TYPES` under the `// Action` group:

```ts
"templateMessage",
```

Extend `NodeContent` with template fields:

```ts
export interface NodeContent {
  // ... existing fields
  templateName?: string
  displayName?: string
  language?: string
  category?: string
  headerType?: string
  bodyPreview?: string
  parameterMappings?: Array<{ templateVar: string; flowValue: string }>
  templateButtons?: Array<{ type: string; text: string; url?: string; id?: string }>
}
```

`templateButtons` is separate from `choices` because template button semantics are different (types: `QUICK_REPLY` / `URL` / `PHONE_NUMBER` / `COPY_CODE`) and we don't want to collide with the quickReply/interactiveList field.

#### 4b. `utils/flow-plan-builder.ts`

Node construction in the builder happens in two steps:

1. `createNode(step.nodeType, platform, position, nodeId)` from `utils/node-factory.ts` — the factory already knows about `templateMessage` (see `node-factory.ts:437, 525`), so no change needed here once the type is whitelisted.
2. `node.data = { ...node.data, ...contentToNodeData(step.content, step.nodeType) }` — this is where we merge plan content onto the factory defaults.

So the only builder change is in `contentToNodeData` (currently `flow-plan-builder.ts:1312-1342`). Add the template-specific field mapping:

```ts
// inside contentToNodeData, after the existing field assignments:

if (nodeType === 'templateMessage') {
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

  // Parameter mappings — explicit, or seeded from body variables as a fallback
  if (content.parameterMappings) {
    data.parameterMappings = content.parameterMappings
  } else if (content.bodyPreview) {
    data.parameterMappings = extractTemplateVariables(content.bodyPreview)
      .map(v => ({ templateVar: v, flowValue: '' }))
  }
}
```

Fallback behavior: if the AI omits `parameterMappings` but includes `bodyPreview`, variables get extracted from the body and mappings are seeded with empty `flowValue`s. The user can still fill values in the properties panel; the node isn't half-broken.

#### 4c. `utils/template-helpers.ts` (new)

Single shared source of truth for the `{{var}}` extraction logic. Current duplication lives in `properties-panel.tsx:2694-2700`; dedupe as part of this change.

```ts
// utils/template-helpers.ts
export function extractTemplateVariables(body: string): string[] {
  const matches = body.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g) || []
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const m of matches) {
    const name = m.replace(/\{\{|\}\}/g, '')
    if (!seen.has(name)) {
      seen.add(name)
      ordered.push(name)
    }
  }
  return ordered
}
```

Update `properties-panel.tsx:2694-2700` to call this helper. Same behavior as today, just deduplicated.

#### 4d. `lib/ai/core/node-documentation.ts`

Add a `templateMessage` case in `buildDataStructure()`:

```
templateMessage data: {
  templateId, templateName, displayName, language, category,
  bodyPreview, headerType,
  templateButtons: [{ type: "QUICK_REPLY"|"URL"|"PHONE_NUMBER"|"COPY_CODE", text, url? }],
  parameterMappings: [{ templateVar, flowValue }]
}
```

Plus prompt guidance: *"Only usable on WhatsApp. Never invent template names — always call `list_approved_templates` first. For each `{{var}}` in the template body, emit a `parameterMappings` entry whose `templateVar` matches the variable name. `flowValue` is a literal string or a `{{variable_name}}` reference to a flow variable."*

#### 4e. `constants/node-categories.ts`

Fill the `ai` field on the `templateMessage` template:

- `description`: "Send a pre-approved Meta template message. Required for outbound-initiated conversations and messages outside the 24-hour customer service window."
- `whenToUse`: "When the conversation needs to send a pre-approved Meta template — e.g. order confirmations, appointment reminders, re-engagement outside the 24-hour window."
- `selectionRule`: "Only usable on WhatsApp. Requires calling `list_approved_templates` first to discover available templates. Never guess a template name."
- `contentFields`: list the fields from 4d.
- `bestPractices`: "Map every `{{var}}` in the body to a `parameterMappings` entry. Use `{{variable_name}}` from flow variables when data flows from earlier in the conversation, or literal values for static substitutions."

### 5. Validation

`validateGeneratedFlow` (`utils/flow-validator.ts`) runs on every plan. Add a soft warning (not a hard error) when a `templateMessage` node has `parameterMappings.length !== extractTemplateVariables(bodyPreview).length`. The user can still fix in the panel, but the warning surfaces the issue in the AI's self-correction loop.

## Error Handling

| Scenario | Behavior |
|---|---|
| User has no approved templates | Tool returns `{success: true, templates: [], count: 0}`. AI prompt tells it to explain and fall back to a plain message node. |
| User not authenticated (no `authHeader`) | Factory returns `null`. Tool is not registered. AI never sees it. Same pattern as `trigger_flow`. |
| Platform is Instagram/web | Tool is not registered. AI can't call it. System-prompt platform guidelines already steer away from templateMessage. |
| Backend returns non-OK (500, 401, …) | Tool returns `{success: false, error: "HTTP N"}`. AI can apologize or fall back. |
| Network failure | Tool returns `{success: false, error: message}`. Same as above. |
| AI emits `templateMessage` step without calling the tool first | `buildFlowFromPlan` builds the node anyway — but with `templateId: undefined`, which fails at publish time. First defense: the `ai` field's "Never invent" rule + the prompt. v2 could add a hard validator that rejects the plan. |
| Template has no variables | `variables: []`, `parameterMappings: []`, node builds cleanly. |
| Template body uses positional `{{1}}` | Extraction preserves the numeric name. Mappings work the same way. |

## Testing

### Unit

- `lib/ai/tools/__tests__/list-approved-templates.test.ts`
  - Mock `fetch`. Assert the tool hits `${FS_WHATSAPP_API_URL}/api/templates?status=APPROVED` with the `Authorization` header from `toolContext.authHeader`.
  - Success path: returns the shaped payload with all expected fields.
  - 401 / 500: returns `{success: false, error: "HTTP N"}`.
  - Network failure: returns `{success: false, error: message}`.
  - Factory returns `null` when `authHeader` is missing.
  - Factory returns `null` when `FS_WHATSAPP_API_URL` is unset.

- `utils/__tests__/template-helpers.test.ts`
  - Named variables: `Hi {{first_name}} {{last_name}}` → `["first_name", "last_name"]`.
  - Positional: `Order {{1}} ready {{2}}` → `["1", "2"]`.
  - Mixed: `{{name}} ordered {{1}}` → `["name", "1"]`.
  - Dedup: `Hi {{name}} — your order {{name}}` → `["name"]`.
  - Order-of-first-occurrence preserved.
  - Empty string → `[]`.

- `utils/__tests__/flow-plan-builder.test.ts`
  - Plan with `nodeType: "templateMessage"` and full content → node with expected data shape.
  - Same plan with `parameterMappings` omitted but `bodyPreview` present → mappings seeded from body variables.
  - Templates with no variables → clean node, empty mappings array.

### Integration

- Extend `lib/ai/tools/__tests__/generate-flow.test.ts`:
  - Mock the AI client to return a plan containing a `templateMessage` step.
  - Verify the returned flow has a templateMessage node the canvas can render.

### Manual smoke (Docker)

Two prompts, one per mode:

1. **Create** (fresh canvas, streaming): *"Build me a flow that starts with the `order_confirmation` template, then asks the customer for delivery feedback."*
2. **Edit** (existing canvas with a welcome message): *"Replace the welcome message with the `greeting` template."*

For each, confirm:
- Canvas renders a `templateMessage` node.
- `templateName`, `bodyPreview`, `buttons`, and `parameterMappings` are populated.
- The node can be selected and edited in the properties panel without inconsistency.
- Cmd+Z reverts the AI generation as a single undo step.

## Risks

1. **Stale React Query cache** — the tool hits the API fresh each call, but `useTemplates("APPROVED")` in the properties panel may have cached older data. Low risk; the properties panel invalidates on template mutations already.
2. **Templates deleted mid-session** — AI could reference a template that's no longer approved by the time the user publishes. `buildFlowFromPlan` still builds the node with stale data; publish will fail, which is the right failure location.
3. **Backend contract drift** — the field shape (`id`, `name`, `display_name`, `body_content`, `buttons`) is assumed from `properties-panel.tsx:2706-2718`. If the fs-whatsapp API renames fields, both the panel and the tool break together — not worse than today.
4. **Step-count exhaustion in streaming create** — adding a second tool could consume steps. Current `stepCountIs(8)` leaves headroom. Monitor logs; raise to 10 if needed.
5. **Token blowup with many templates** — ~200 tokens per template × 100 templates = 20k tokens on the return. Fits in Sonnet's window but wasteful. v2 accepts a `namePattern?: string` arg. Ship v1 without it and measure.

## Files Changed

**New**
- `lib/ai/tools/list-approved-templates.ts`
- `lib/ai/tools/__tests__/list-approved-templates.test.ts`
- `utils/template-helpers.ts`
- `utils/__tests__/template-helpers.test.ts`

**Modified**
- `lib/ai/tools/generate-flow-edit.ts` — register tool in `createEditTools`
- `lib/ai/tools/generate-flow-create-streaming.ts` — register tool in the `tools` map
- `types/flow-plan.ts` — whitelist + extend `NodeContent`
- `utils/flow-plan-builder.ts` — `templateMessage` case in node construction
- `utils/flow-validator.ts` — optional soft warning for mapping mismatch
- `lib/ai/core/node-documentation.ts` — `buildDataStructure` case + prompt guidance
- `constants/node-categories.ts` — fill the `ai` field on the templateMessage template
- `components/properties-panel.tsx` — replace inline regex with the shared helper
- `lib/ai/tools/__tests__/generate-flow.test.ts` — extend with templateMessage plan integration case
- `utils/__tests__/flow-plan-builder.test.ts` — new cases for templateMessage construction
