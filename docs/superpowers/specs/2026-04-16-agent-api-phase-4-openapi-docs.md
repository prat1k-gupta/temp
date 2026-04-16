# Phase 4 — Agent API OpenAPI Spec + Docs Polish

**For:** the engineer picking up Phase 4 of the Flow Assistant Agent API.
**Status:** handoff doc. Read top-to-bottom and implement. No other docs required.
**Prerequisite:** Phase 1-3 merged (magic-flow #78, fs-chat #34). Branch `main`.

---

## TL;DR

Three deliverables, all docs + one tiny endpoint. No product changes.

1. **D1 — OpenAPI 3.1 endpoint.** `GET /api/v1/agent/openapi.json` auto-generated from existing Zod schemas. ~50 LOC.
2. **D2 — Promote integration guide.** Move `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-integration.md` → `docs/agent-api/integration.md`, patch staleness, add AI-capabilities section, link to D3.
3. **D3 — New tool reference.** `docs/agent-api/tools.md` lists the 23 internal AI tools (2 create + 21 edit) with `tool_step` event shapes customers will see in the SSE stream.

Estimated effort: 1-2 engineer-days including review + test.

---

## Why this exists

Phase 3 shipped the full Agent API CRUD surface (`find`, `create`, `edit`, `publish`). It works. Customers can integrate today using the existing integration guide at `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-integration.md`. But:

1. **No machine-readable spec.** Customers hand-write fetch wrappers or read the guide to understand request/response shapes. An OpenAPI spec lets them run `openapi-generator` once and get a typed client in TypeScript, Python, Go, Ruby, whatever their stack is.
2. **Integration guide is stale.** It was written during Phase 2 brainstorming. Phase 3 added tools, changed error codes, and expanded what the AI can do during an edit. Six things in the guide need fixing (listed in D2 below).
3. **No tool reference.** During an edit SSE stream the customer sees 23 different `tool` names in `tool_step` events. Today they have to guess what each does. We give them a reference.

None of this unblocks new features — it makes the existing surface actually usable by external teams without a Freestand engineer holding their hand.

---

## Current state (Phase 1-3 shipped)

### The 4 REST endpoints

Zod schemas live in `lib/agent-api/schemas.ts`. All use `withAgentAuth` wrapper (`X-API-Key: whm_*`).

| Method | Path | Auth | Rate limit bucket | Returns |
|---|---|---|---|---|
| GET | `/api/v1/agent/flows` | X-API-Key | cheap (120/min) | JSON — paged list |
| POST | `/api/v1/agent/flows` | X-API-Key | expensive (10/min) | SSE stream — create + auto-publish |
| POST | `/api/v1/agent/flows/{id}/edit` | X-API-Key | expensive (10/min) | SSE stream — edit, optional publish via tool |
| POST | `/api/v1/agent/flows/{id}/publish` | X-API-Key | publish (30/min) | JSON — publish or already_published |

Source: `app/api/v1/agent/flows/route.ts`, `app/api/v1/agent/flows/[flow_id]/edit/route.ts`, `app/api/v1/agent/flows/[flow_id]/publish/route.ts`

### The 2 AI agents

Entry point: `generateFlowStreaming()` in `lib/ai/tools/generate-flow.ts`. Dispatches based on whether `existingFlow.nodes` has any non-start node:

- **Create agent** — `executeCreateModeStreaming()` in `lib/ai/tools/generate-flow-create-streaming.ts`. Has 2 tools.
- **Edit agent** — `executeEditModeStreaming()` in `lib/ai/tools/generate-flow-edit.ts`. Has 21 tools (5 editing + 3 lifecycle + 2 WhatsApp + 11 broadcast/campaign).

### What already exists in `docs/agent-api/`

- `README.md` — one-paragraph intro, endpoint table
- `reference.md` — per-endpoint reference (4 endpoints)
- `quickstart.md` — curl quickstart, Vercel AI SDK example, Python example
- `system-prompt.md` — 350-token system-prompt fragment for the customer's LLM

### What's still a draft (Phase 4 moves/updates it)

- `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-integration.md` — 780-line customer HOWTO. Was written during Phase 2 brainstorming. Needs moving + patching.
- `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-design.md` — internal design spec. Stays where it is — engineering reference only.

---

## Scope

### In scope (Phase 4)

1. OpenAPI 3.1 spec endpoint at `GET /api/v1/agent/openapi.json`
2. Promote + patch integration guide → `docs/agent-api/integration.md`
3. New tool reference → `docs/agent-api/tools.md`
4. Cross-links between integration.md and tools.md (one-way: integration → tools)
5. Update `docs/agent-api/README.md` endpoint table to include OpenAPI spec link
6. Unit tests: OpenAPI spec validates against the 3.1 schema, includes all 4 endpoints + all Zod schemas

### Out of scope

- SDK (TypeScript / Python / Go / etc. clients). Customers generate their own from the OpenAPI spec.
- MCP server wrapping the Agent API. That's a separate project.
- `x-tools` extension embedding AI tool schemas in the OpenAPI spec. Tools are documented as markdown (D3); embedding them in OpenAPI is speculative extra work.
- New endpoints. Agent API surface is frozen at 4 endpoints.
- Hosted docs site. Markdown lives in the repo; hosting is a separate deployment concern.
- Changing any existing Zod schema or endpoint behaviour.

---

## D1 — OpenAPI 3.1 spec endpoint

### What to build

A new Next.js route handler at `app/api/v1/agent/openapi.json/route.ts` that returns the OpenAPI spec as JSON. Spec is computed once on first request, cached in module scope, and served with long cache headers.

**Approach:** convert existing Zod schemas to JSON Schema via `zod-to-json-schema`, then hand-assemble the OpenAPI document structure around them.

**Why not auto-generate the entire spec from Next.js route exports?** Next.js doesn't have first-class OpenAPI support. Libraries that try to auto-discover routes are fragile. Hand-assembling ~80 lines of OpenAPI skeleton around the Zod-derived schemas is both simpler and more maintainable.

### Dependency

Add `zod-to-json-schema` to `package.json`:

```bash
cd magic-flow && npm install zod-to-json-schema --save
```

Version: `^3.24.0` or later. It's a lightweight converter (no runtime deps beyond Zod).

### Implementation

Create `app/api/v1/agent/openapi.json/route.ts`:

```typescript
import { zodToJsonSchema } from "zod-to-json-schema"
import {
  findFlowQuerySchema,
  createFlowBodySchema,
  editFlowBodySchema,
  publishFlowBodySchema,
} from "@/lib/agent-api/schemas"

// Module-scope cache. The spec is a pure function of the Zod schemas,
// which are stable per build.
let cachedSpec: Record<string, unknown> | null = null

function buildSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Freestand Agent API",
      description:
        "REST + SSE API for building, editing, and publishing Freestand chatbot flows " +
        "from inside your own AI agent. See the integration guide at " +
        "https://github.com/freestandtech/magic-flow/blob/main/docs/agent-api/integration.md",
      version: "1.0.0",
    },
    servers: [
      { url: "https://app.freestand.xyz", description: "Production" },
    ],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Freestand General API key with `whm_` prefix.",
        },
      },
      schemas: {
        FindFlowQuery: zodToJsonSchema(findFlowQuerySchema, { target: "openApi3" }),
        CreateFlowBody: zodToJsonSchema(createFlowBodySchema, { target: "openApi3" }),
        EditFlowBody: zodToJsonSchema(editFlowBodySchema, { target: "openApi3" }),
        PublishFlowBody: zodToJsonSchema(publishFlowBodySchema, { target: "openApi3" }),
        AgentError: {
          type: "object",
          required: ["code", "message"],
          properties: {
            code: {
              type: "string",
              enum: [
                "missing_required_param",
                "invalid_param",
                "invalid_instruction",
                "invalid_trigger_keyword",
                "channel_not_connected",
                "no_account_configured",
                "unsupported_edit",
                "unauthorized",
                "flow_not_found",
                "node_not_found",
                "keyword_conflict",
                "rate_limited",
                "validation_failed",
                "internal_error",
                "publish_failed",
              ],
            },
            message: { type: "string" },
          },
          additionalProperties: true,
          description:
            "Error envelope. Extra fields depend on the code — e.g., `keyword_conflict` includes `existing_flow`, `rate_limited` includes `retry_after_seconds`.",
        },
        Flow: {
          type: "object",
          properties: {
            flow_id: { type: "string" },
            name: { type: "string" },
            trigger_keyword: { type: "string" },
            node_count: { type: "integer" },
            current_version: { type: "integer" },
            magic_flow_url: { type: "string", format: "uri" },
            test_url: { type: "string", format: "uri", nullable: true },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
      },
    },
    paths: {
      "/api/v1/agent/flows": {
        get: {
          summary: "List flows",
          description:
            "Returns up to `limit` flows for the authenticated organization. Use to find " +
            "a `flow_id` when your agent has lost the reference from earlier in the conversation.",
          parameters: [
            { name: "query", in: "query", schema: { type: "string" }, required: false },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
              required: false,
            },
          ],
          responses: {
            "200": {
              description: "Paged list of flows",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      flows: { type: "array", items: { $ref: "#/components/schemas/Flow" } },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
        post: {
          summary: "Create a flow (SSE stream)",
          description:
            "Creates a flow from a natural-language instruction and publishes it to the runtime. " +
            "Returns a Server-Sent Events stream — see `docs/agent-api/integration.md` for event shapes. " +
            "Rate limit: 10/min per key.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateFlowBody" } } },
          },
          responses: {
            "200": {
              description: "Server-Sent Events stream",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "409": {
              description: "keyword_conflict — the trigger keyword is already in use.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/AgentError" } } },
            },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },
      "/api/v1/agent/flows/{flow_id}/edit": {
        post: {
          summary: "Edit a flow (SSE stream)",
          description:
            "Applies a natural-language edit instruction to an existing flow. Creates an " +
            "unpublished version unless the AI's `publish_flow` tool is invoked. Returns an " +
            "SSE stream. Rate limit: 10/min per key.",
          parameters: [
            { name: "flow_id", in: "path", schema: { type: "string", format: "uuid" }, required: true },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/EditFlowBody" } } },
          },
          responses: {
            "200": {
              description: "Server-Sent Events stream",
              content: { "text/event-stream": { schema: { type: "string" } } },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },
      "/api/v1/agent/flows/{flow_id}/publish": {
        post: {
          summary: "Publish the latest version of a flow",
          description:
            "Promotes the highest version to live. Idempotent — if already published, " +
            "returns 200 with `already_published: true`. Rate limit: 30/min per key.",
          parameters: [
            { name: "flow_id", in: "path", schema: { type: "string", format: "uuid" }, required: true },
          ],
          requestBody: {
            required: false,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PublishFlowBody" } } },
          },
          responses: {
            "200": {
              description: "Publish succeeded or already published",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      flow_id: { type: "string" },
                      version: { type: "integer" },
                      published: { type: "boolean" },
                      already_published: { type: "boolean" },
                      published_at: { type: "string", format: "date-time" },
                      test_url: { type: "string", format: "uri", nullable: true },
                      trigger_keyword: { type: "string" },
                      magic_flow_url: { type: "string", format: "uri" },
                    },
                  },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "404": { $ref: "#/components/responses/NotFound" },
            "429": { $ref: "#/components/responses/RateLimited" },
            "502": {
              description: "publish_failed — fs-whatsapp runtime deploy failed (retryable).",
              content: { "application/json": { schema: { $ref: "#/components/schemas/AgentError" } } },
            },
          },
        },
      },
    },
    "x-responses": {}, // placeholder so ESLint is happy; real responses go under components.responses
  }
}

export async function GET(): Promise<Response> {
  if (!cachedSpec) cachedSpec = buildSpec()
  return Response.json(cachedSpec, {
    headers: {
      // Safe to cache — spec changes only between deploys.
      "Cache-Control": "public, max-age=3600",
    },
  })
}
```

Move the shared responses (`Unauthorized`, `BadRequest`, `NotFound`, `RateLimited`) into `components.responses` to de-duplicate (not shown above — do it while writing).

### Tests

Create `app/api/v1/agent/openapi.json/__tests__/route.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { GET } from "../route"

describe("GET /api/v1/agent/openapi.json", () => {
  it("returns a valid OpenAPI 3.1 document", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const spec = await res.json()
    expect(spec.openapi).toBe("3.1.0")
    expect(spec.info.title).toBe("Freestand Agent API")
  })

  it("includes all 4 REST endpoints", async () => {
    const res = await GET()
    const spec = await res.json()
    const paths = Object.keys(spec.paths)
    expect(paths).toContain("/api/v1/agent/flows")
    expect(paths).toContain("/api/v1/agent/flows/{flow_id}/edit")
    expect(paths).toContain("/api/v1/agent/flows/{flow_id}/publish")
    // GET + POST on /flows
    expect(Object.keys(spec.paths["/api/v1/agent/flows"])).toEqual(
      expect.arrayContaining(["get", "post"]),
    )
  })

  it("includes all body schemas", async () => {
    const res = await GET()
    const spec = await res.json()
    expect(spec.components.schemas.CreateFlowBody).toBeDefined()
    expect(spec.components.schemas.EditFlowBody).toBeDefined()
    expect(spec.components.schemas.PublishFlowBody).toBeDefined()
    expect(spec.components.schemas.FindFlowQuery).toBeDefined()
  })

  it("declares X-API-Key security scheme", async () => {
    const res = await GET()
    const spec = await res.json()
    expect(spec.components.securitySchemes.ApiKeyAuth).toMatchObject({
      type: "apiKey",
      in: "header",
      name: "X-API-Key",
    })
  })

  it("lists all AgentError codes", async () => {
    const res = await GET()
    const spec = await res.json()
    const codes = spec.components.schemas.AgentError.properties.code.enum
    expect(codes).toContain("flow_not_found")
    expect(codes).toContain("keyword_conflict")
    expect(codes).toContain("rate_limited")
    expect(codes.length).toBeGreaterThanOrEqual(15)
  })
})
```

### Route registration

Next.js auto-discovers route files. No middleware change needed — the existing `middleware.ts` allows `/api/v1/agent/*` through (added in Phase 1). The spec endpoint does NOT require auth (it's a public, static document). Override by exporting a plain `GET` (not wrapped in `withAgentAuth`).

### Acceptance criteria D1

- [x] `curl https://app.freestand.xyz/api/v1/agent/openapi.json` returns a JSON document with `openapi: "3.1.0"`
- [x] Document validates against the official OpenAPI 3.1 meta-schema (verify with any OpenAPI validator, e.g. https://editor.swagger.io paste-in)
- [x] `npx openapi-typescript /api/v1/agent/openapi.json > client.ts` produces a compiling TypeScript client
- [x] All tests in `route.test.ts` pass
- [x] `npx tsc --noEmit` passes

---

## D2 — Promote + patch integration guide

### What to do

Move the existing guide into its production home and fix the stale parts.

```bash
git mv docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-integration.md docs/agent-api/integration.md
```

Then apply the patches below.

### Patches

#### Patch 1 — header says "four tools" / "five tools" inconsistently

Search for `four tools`, `five tools`, `The four tools`, `the five Freestand tools`. Unify to **four** (find, create, edit, publish). The integration guide is about the 4 REST-facing customer tools, NOT the 23 internal AI tools.

Also update:
- `## What this guide covers` → item 3 reads "The four tools"
- `## The four tools` heading remains as-is
- Anything that says "five" → "four"

#### Patch 2 — error code table missing entries

Current error table doesn't include codes that Phase 3 introduced or surfaced. Update `### Error codes reference` section:

| Code | HTTP | When | Payload extras |
|---|---|---|---|
| `missing_required_param` | 400 | Body missing a required field | — |
| `invalid_param` | 400 | Param fails Zod validation (e.g., too long) | `errors: [{path, message}]` |
| `invalid_instruction` | 400 | AI couldn't make sense of the instruction | — |
| `invalid_trigger_keyword` | 400 | Trigger keyword fails normalization | — |
| `channel_not_connected` | 400 | Requested channel isn't connected | `connected_channels: [...]` |
| `keyword_conflict` | 409 | Trigger keyword already used | `existing_flow: {id, name, magic_flow_url}` |
| `unauthorized` | 401 | Missing or invalid `whm_*` key | — |
| `flow_not_found` | 404 | `{id}` not found or not in your org | — |
| `rate_limited` | 429 | Bucket exhausted | `retry_after_seconds: N` |
| `validation_failed` | 500 | AI output failed structural validation | — |
| `publish_failed` | 502 | Runtime deploy failed (retryable) | — |
| `internal_error` | 500 | Catch-all | — |

Drop `unsupported_edit`, `node_not_found`, `no_account_configured` from the table if they're there — Phase 3 didn't ship those.

#### Patch 3 — add section: "What your user can instruct the AI to do during an edit"

Insert after `## The four tools` and before `## Integration examples`. Exact text:

```markdown
## What your user can instruct the AI to do during an edit

When you call `freestand_edit_flow`, the server-side AI agent has **21 tools** available. You don't call these directly — the AI decides which to invoke based on the user's instruction. But knowing what's available helps you understand what instructions will work.

**Categories of instruction the AI can handle:**

| Instruction style | What it triggers | Example |
|---|---|---|
| Modify nodes/edges | `apply_edit`, `get_node_details`, `get_node_connections` | "Change the welcome message tone" |
| Validate the result | `validate_result` | (the AI runs this automatically after every apply) |
| List available variables | `list_variables` | "What variables does this flow use?" |
| Save as template | `save_as_template` | "Save this as a template" |
| Undo the last AI change | `undo_last` | "Undo that" |
| Look up approved WA templates | `list_approved_templates` | "Use the 'welcome_template' here" |
| Test-send the flow | `trigger_flow` | "Send this to +1234567890" |
| Publish current edits | `publish_flow` | "Publish this" |
| Find an existing flow / account | `list_flows`, `list_accounts`, `get_flow_variables` | (usually called as lookup before broadcasting) |
| Preview a campaign audience | `preview_audience` | "How many contacts are in 'delhi' tag?" |
| Create / start / pause / cancel a campaign | `create_campaign`, `start_campaign`, `pause_campaign`, `cancel_campaign`, `list_campaigns`, `get_campaign_status` | "Broadcast this flow to contacts tagged 'delhi'" |

Each tool call surfaces as a `tool_step` SSE event in the stream — see the [SSE stream reference](#sse-stream-reference) below and the full [tools reference](./tools.md) for event shapes.

This is also why `freestand_edit_flow` is more capable than the name suggests: it's your one hook into everything the AI can do on behalf of a user in the context of an existing flow.
```

#### Patch 4 — add OpenAPI link in Prerequisites

After the API key step in `## Prerequisites`, add:

```markdown
3. **(Optional) OpenAPI spec** — if you want a typed client, download the OpenAPI 3.1 spec at:

   ```
   curl https://app.freestand.xyz/api/v1/agent/openapi.json > freestand-openapi.json
   ```

   Generate your client:

   ```bash
   # TypeScript
   npx openapi-typescript freestand-openapi.json -o freestand-client.ts

   # Python
   openapi-generator-cli generate -i freestand-openapi.json -g python -o ./freestand-client

   # Go, Ruby, Java, etc. — use any OpenAPI 3.1 generator
   ```

   The spec covers request/response shapes for all four endpoints. The SSE stream event shapes live in the rest of this guide — OpenAPI doesn't currently model streaming events well.
```

#### Patch 5 — FAQ additions

Add three new FAQ entries:

```markdown
**Q: What can my user instruct the AI to do during an edit call?**

21 tools' worth of things. See [tools.md](./tools.md) for the full reference, or the [capabilities section above](#what-your-user-can-instruct-the-ai-to-do-during-an-edit).

**Q: I see tool names in the SSE stream (`apply_edit`, `publish_flow`, etc.). What are they?**

Those are the server-side AI tools being invoked as the agent works on your user's instruction. The tool_step events are informational — you can display them as a progress log, or ignore them entirely. See [tools.md](./tools.md) for each tool's meaning.

**Q: Is there an OpenAPI spec?**

Yes — `GET /api/v1/agent/openapi.json`. OpenAPI 3.1, covers the four REST endpoints. Generate a client from it in any language. SSE stream shapes aren't covered by OpenAPI — see the Integration examples section in this guide.
```

#### Patch 6 — rename "Support" links

Change the hard-coded `docs.freestand.xyz/agent-api` URL in the Support section to point to the repo path:

```markdown
- **Documentation**: `https://github.com/freestandtech/magic-flow/tree/main/docs/agent-api`
- **OpenAPI spec**: `https://app.freestand.xyz/api/v1/agent/openapi.json`
```

### Acceptance criteria D2

- [x] File is at `docs/agent-api/integration.md`
- [x] Old file at `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-integration.md` is deleted (via `git mv`)
- [x] No occurrence of "five tools" or "the five" in the file
- [x] Error code table matches the patched version above
- [x] "What your user can instruct the AI to do during an edit" section exists and links to `tools.md`
- [x] Prerequisites section shows OpenAPI spec URL + generator examples
- [x] Three new FAQ entries present
- [x] `README.md` in `docs/agent-api/` lists `integration.md` alongside reference/quickstart/system-prompt

---

## D3 — New tool reference doc

### What to build

`docs/agent-api/tools.md`. Plain markdown. Lists the 23 AI tools the server invokes during create/edit flows, grouped by agent, with one entry per tool.

### Structure

```markdown
# Freestand AI Tool Reference

During a create or edit call, the server-side AI agent invokes internal tools. You see them as `tool_step` events in the SSE stream. This document is the reference for what each tool does, when it's invoked, and what event shape to expect.

**Customers do NOT call these tools directly** — they're invoked by the AI in response to the user's natural-language instruction. This doc helps you interpret the SSE stream and understand what instructions your user can send.

---

## The 2 agents

- **Create agent** — runs when `POST /api/v1/agent/flows` is called. Has 2 tools. Builds a flow from scratch.
- **Edit agent** — runs when `POST /api/v1/agent/flows/{id}/edit` is called. Has 21 tools. Modifies an existing flow plus handles broadcast, testing, publishing, templates.

The agent is selected by the endpoint — you can't mix tools across agents.

---

## Create agent tools (2)

### `build_and_validate`

**When invoked:** once per create call, after the AI drafts a flow plan.

**Effect:** builds the flow structure and validates it. On failure, the AI may call again with a fixed plan.

**SSE event shape:**
```json
{
  "event": "tool_step",
  "data": {
    "tool": "build_and_validate",
    "status": "done",
    "summary": "Built 4 nodes, 3 edges — valid",
    "details": {
      "kind": "validate",
      "valid": true,
      "issues": []
    }
  }
}
```

### `list_approved_templates`

**When invoked:** when the user mentions a WhatsApp template by name. WhatsApp only.

**Effect:** returns the list of Meta-approved templates in the org, lets the AI emit a `templateMessage` node with real data.

**SSE event shape:**
```json
{
  "event": "tool_step",
  "data": {
    "tool": "list_approved_templates",
    "status": "done",
    "summary": "Found 12 approved templates"
  }
}
```

---

## Edit agent tools (21)

### Flow editing (5)

#### `get_node_details`

**When invoked:** the AI wants the full data for a specific node before editing (e.g., to read choice handle IDs).

**Effect:** returns node type, label, data fields, choice handle IDs. Read-only.

**SSE event shape:**
```json
{ "event": "tool_step", "data": { "tool": "get_node_details", "status": "done", "summary": "Inspected Question node" } }
```

#### `get_node_connections`

**When invoked:** the AI wants to know which edges connect to a node (e.g., before rewiring).

**Effect:** returns incoming/outgoing edges with handle IDs. Read-only.

**SSE event shape:** `{ "tool": "get_node_connections", "status": "done", "summary": "Checked connections for plan-question-2-abc" }`

#### `apply_edit`

**When invoked:** the AI has a plan (chains / nodeUpdates / addEdges / removeNodeIds / removeEdges) and wants to apply it.

**Effect:** builds the edit result in memory. Not yet committed to the canvas — must be validated first via `validate_result`.

**SSE event shape:**
```json
{
  "event": "tool_step",
  "data": {
    "tool": "apply_edit",
    "status": "done",
    "summary": "Added 1 node, 2 edges, updated 1 node",
    "details": {
      "kind": "edit",
      "added": [{ "type": "Question", "label": "Name?" }],
      "removed": [],
      "updated": [{ "type": "Message", "label": "Thanks", "fields": ["text"] }],
      "edgesAdded": 2,
      "edgesRemoved": 0
    }
  }
}
```

#### `validate_result`

**When invoked:** after every `apply_edit`, to check the merged state for orphaned nodes, undefined variables, button limits, etc.

**Effect:** runs flow validator. If valid, emits `flow_ready` event and marks the edit as committed. If invalid, the AI usually calls `apply_edit` again with a fix.

**SSE event shape:**
```json
{
  "event": "tool_step",
  "data": {
    "tool": "validate_result",
    "status": "done",
    "summary": "Valid",
    "details": {
      "kind": "validate",
      "valid": true,
      "issues": []
    }
  }
}
```

#### `list_variables`

**When invoked:** the AI wants to know what `{{variables}}` are available in the current flow (e.g., before referencing one in a message).

**Effect:** returns flow variables, system variables, global variables.

**SSE event shape:** `{ "tool": "list_variables", "status": "done", "summary": "Listed 4 variables" }`

### Flow lifecycle (3)

#### `save_as_template`

**When invoked:** user says "save this as a template".

**Effect:** generates template metadata (name, description, when-to-use) via a sub-LLM call. Returns metadata for user confirmation. Does NOT save to templates until user confirms (but the internal UI's chat handles the confirmation; agent API callers receive it in the result payload).

**SSE event shape:** `{ "tool": "save_as_template", "status": "done", "summary": "Generated template metadata" }`

#### `undo_last`

**When invoked:** user says "undo that" or the AI gave up on its last apply.

**Effect:** clears the in-memory edit result so nothing is committed.

**SSE event shape:** `{ "tool": "undo_last", "status": "done", "summary": "Edit reverted" }`

#### `publish_flow`

**When invoked:** user says "publish this" or "edit and publish".

**Effect:** creates a version if needed, publishes it, deploys to the runtime, deletes the draft. On the agent API path, completely handles what the customer would otherwise do with a separate `POST /publish` call.

**SSE event shape:**
```json
{
  "event": "tool_step",
  "data": {
    "tool": "publish_flow",
    "status": "done",
    "summary": "Flow published! Version 4 is now live."
  }
}
```

### WhatsApp-specific (2, platform-gated)

#### `list_approved_templates`

Same as the create agent's version — returns approved Meta templates.

#### `trigger_flow`

**When invoked:** user says "test this on my phone number" AND the flow has been published (or was just published by `publish_flow`).

**Effect:** sends the published flow to a phone number via WhatsApp Cloud API. Fails with a clear error if the contact already has an active session.

**SSE event shape:** `{ "tool": "trigger_flow", "status": "done", "summary": "Flow sent to +1234567890" }`

### Broadcast & campaign (11)

These tools are available on both WhatsApp and other platforms (though campaigns currently default to WhatsApp in the runtime).

#### `list_flows`

**When invoked:** user wants to broadcast a flow but hasn't specified which one.

**Effect:** returns all published flows in the org.

**SSE event shape:** `{ "tool": "list_flows", "status": "done", "summary": "Found 8 flows" }`

#### `list_accounts`

**When invoked:** user needs to pick a WhatsApp account to send from.

**Effect:** returns connected WhatsApp accounts in the org.

**SSE event shape:** `{ "tool": "list_accounts", "status": "done", "summary": "Found 1 account" }`

#### `get_flow_variables`

**When invoked:** before creating a campaign with a flow, the AI wants to know what variables the flow uses.

**Effect:** returns variable names the flow collects/references.

**SSE event shape:** `{ "tool": "get_flow_variables", "status": "done", "summary": "4 variables" }`

#### `preview_audience`

**When invoked:** user describes an audience filter, the AI wants to show how many contacts match before creating the campaign.

**Effect:** returns audience count and type. Read-only.

**SSE event shape:** `{ "tool": "preview_audience", "status": "done", "summary": "237 matching contacts" }`

#### `create_campaign`

**When invoked:** user confirms they want to create a broadcast.

**Effect:** creates a draft campaign. Does NOT start sending.

**SSE event shape:** `{ "tool": "create_campaign", "status": "done", "summary": "Campaign created (draft)" }`

#### `start_campaign`

**When invoked:** user confirms they want to start sending.

**Effect:** transitions the draft campaign to processing state and starts sending.

**SSE event shape:** `{ "tool": "start_campaign", "status": "done", "summary": "Campaign started" }`

#### `pause_campaign`

**When invoked:** user says "pause that campaign".

**Effect:** pauses an active campaign mid-send. Can be resumed (though resume isn't currently exposed as a tool).

**SSE event shape:** `{ "tool": "pause_campaign", "status": "done", "summary": "Campaign paused" }`

#### `cancel_campaign`

**When invoked:** user says "cancel".

**Effect:** cancels the campaign permanently.

**SSE event shape:** `{ "tool": "cancel_campaign", "status": "done", "summary": "Campaign cancelled" }`

#### `list_campaigns`

**When invoked:** user asks "show me my campaigns".

**Effect:** returns recent campaigns with status and stats.

**SSE event shape:** `{ "tool": "list_campaigns", "status": "done", "summary": "7 campaigns" }`

#### `get_campaign_status`

**When invoked:** user asks about a specific campaign.

**Effect:** returns current status, recipient counts, delivery stats.

**SSE event shape:** `{ "tool": "get_campaign_status", "status": "done", "summary": "Campaign: processing (53% done)" }`

---

## Authentication

All tools call fs-whatsapp on behalf of the authenticated customer. Auth is handled transparently — the customer's `whm_*` API key is forwarded as `X-API-Key` on every downstream call. You don't need to do anything.

## Rate limits

AI tool calls count against the `expensive` bucket (10/min per key) because they happen inside an edit or create call, which itself is rate-limited.

## Errors inside tool calls

When a tool fails, the AI usually retries or adapts. If a tool fails terminally (e.g., campaign API down), the stream ends with an `error` event — see [integration.md Error handling](./integration.md#error-handling).
```

### Acceptance criteria D3

- [x] File at `docs/agent-api/tools.md`
- [x] All 23 tools present, grouped by agent (2 + 5 + 3 + 2 + 11 = 23)
- [x] Each tool entry has: when invoked, effect, SSE event shape
- [x] Cross-links to integration.md work
- [x] Linkable anchors for each tool (markdown auto-generates these from headings)

---

## D1-D3 cross-links (README update)

Update `docs/agent-api/README.md`:

```markdown
# Agent API docs

- [Quickstart](./quickstart.md) — first call in 5 minutes
- [API reference](./reference.md) — per-endpoint reference
- [Integration guide](./integration.md) — OpenAI / Anthropic / Python / Raw REST examples, error handling, FAQ
- [Tools reference](./tools.md) — what the server-side AI can do during a call
- [System prompt fragment](./system-prompt.md) — for your LLM's system prompt
- [OpenAPI spec](https://app.freestand.xyz/api/v1/agent/openapi.json) — machine-readable, for code generation

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/agent/flows` | List flows |
| POST | `/api/v1/agent/flows` | Create + publish (SSE) |
| POST | `/api/v1/agent/flows/{id}/edit` | Edit (SSE) |
| POST | `/api/v1/agent/flows/{id}/publish` | Publish |
| GET | `/api/v1/agent/openapi.json` | OpenAPI 3.1 spec (no auth) |

Auth: `X-API-Key: whm_...` on all endpoints except `openapi.json`.
```

---

## Reference appendix (self-contained)

### A — All 15 error codes

Already listed in D2 Patch 2 above. The source of truth is `lib/agent-api/errors.ts`:

```typescript
export type AgentErrorCode =
  | "missing_required_param"
  | "invalid_param"
  | "invalid_instruction"
  | "invalid_trigger_keyword"
  | "channel_not_connected"
  | "no_account_configured"
  | "unsupported_edit"
  | "unauthorized"
  | "flow_not_found"
  | "node_not_found"
  | "keyword_conflict"
  | "rate_limited"
  | "validation_failed"
  | "internal_error"
  | "publish_failed"
```

### B — SSE event types (for tools.md context)

From `lib/ai/tools/generate-flow.ts`:

```typescript
type StreamEvent =
  | { type: 'tool_step'; tool: string; status: 'running' | 'done'; summary?: string; details?: ToolStepDetails }
  | { type: 'text_delta'; delta: string }
  | { type: 'flow_ready'; flowData?: {...}; updates?: {...}; action: 'create' | 'edit'; warnings?: string[] }
  | { type: 'result'; data: GenerateFlowResponse }
  | { type: 'error'; message: string }
```

Agent API routes translate these into SSE frames with event types `progress`, `result`, `error`. The `tool_step` event maps to a `progress` frame with `phase` set to a readable label.

### C — Tool inventory with source file references

| Tool | Defined in | Agent |
|---|---|---|
| `build_and_validate` | `lib/ai/tools/generate-flow-create-streaming.ts` | Create |
| `list_approved_templates` | `lib/ai/tools/list-approved-templates.ts` | Both |
| `get_node_details` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `get_node_connections` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `apply_edit` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `validate_result` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `list_variables` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `save_as_template` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `undo_last` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `publish_flow` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `trigger_flow` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `list_flows` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `list_accounts` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `get_flow_variables` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `preview_audience` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `create_campaign` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `start_campaign` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `pause_campaign` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `cancel_campaign` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `list_campaigns` | `lib/ai/tools/generate-flow-edit.ts` | Edit |
| `get_campaign_status` | `lib/ai/tools/generate-flow-edit.ts` | Edit |

### D — Zod schemas (source of truth for OpenAPI spec)

From `lib/agent-api/schemas.ts`:

```typescript
export const findFlowQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(FIND_FLOW_MAX_LIMIT).default(FIND_FLOW_DEFAULT_LIMIT),
})

export const createFlowBodySchema = z.object({
  name: z.string().min(1).max(100),
  instruction: z.string().min(1).max(4000),
  channel: z.enum(["whatsapp", "instagram", "web"]),
  trigger_keyword: z.string().min(1).max(50),
})

export const editFlowBodySchema = z.object({
  instruction: z.string().min(1).max(4000),
})

export const publishFlowBodySchema = z.object({}).strip()
```

These feed `zod-to-json-schema` in D1.

---

## Test plan

Run these before opening the PR:

```bash
# TypeScript
npx tsc --noEmit

# Unit tests
npx vitest run

# Lint
npx eslint . --max-warnings 0

# OpenAPI validator (manual, one-time)
curl http://localhost:3002/api/v1/agent/openapi.json | \
  npx @redocly/cli@latest lint -

# TS client generation (manual, one-time)
curl http://localhost:3002/api/v1/agent/openapi.json -o /tmp/freestand-openapi.json
npx openapi-typescript /tmp/freestand-openapi.json -o /tmp/freestand-client.ts
# ^ should succeed and produce a file with no TS errors
```

Manual read-through:
- [ ] Open `docs/agent-api/integration.md` in a renderer (GitHub preview or similar). Navigate via the TOC. Every link resolves.
- [ ] Open `docs/agent-api/tools.md`. Every tool has all three fields (when / effect / SSE event). Cross-links to integration.md work.
- [ ] `docs/agent-api/README.md` lists all five markdown files.

---

## Commit strategy

Single PR. Three commits (can be squashed on merge):

1. `feat(agent-api): add OpenAPI 3.1 spec endpoint at /api/v1/agent/openapi.json`
2. `docs(agent-api): promote integration guide + add AI-capabilities section`
3. `docs(agent-api): add tool reference at tools.md`

PR title: `feat(agent-api): Phase 4 — OpenAPI spec + docs polish`

PR body: paste the TL;DR from the top of this doc.

---

## Risk

Very low. No runtime behaviour changes. Spec endpoint is pure computation on static schemas. Docs are prose.

Two minor risks to mention in PR:

- **Spec lint strictness**: some OpenAPI linters are stricter than others. `@redocly/cli lint` may surface warnings that we choose to suppress (e.g., missing `operationId`, missing per-response examples). Either add `operationId` to each path or document the suppressions in the PR description.
- **zod-to-json-schema version drift**: if its output format changes in a future major version, the generated schemas might shift. Pin to a minor range (`^3.24.0`).

---

## Post-merge follow-ups (not for this PR)

- Publish the docs to a hosted site (Mintlify, Docusaurus, or similar). Currently they live in the repo at the URLs cited in integration.md. Hosting is its own deployment concern.
- Add an MCP server that wraps the Agent API + AI tools for Claude Desktop / Cursor / etc. Planned as the next Freestand-wide initiative.
- Update the `/api/v1/agent/openapi.json` cache-busting strategy if the spec starts changing more than once per deploy.

---

**End of handoff doc.** Questions → ping whoever hands this to you.
