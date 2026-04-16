# Flow Assistant Agent API — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan granularity note:** This plan is at the task level with exact files, acceptance criteria, test requirements, and the specific code concerns each task needs to address. Step-level TDD decomposition is produced by the controller at dispatch time per-task (same pattern Phase 1 execution used).

## Lessons from Phase 1 (baked into this plan)

Phase 1 execution surfaced three real bugs that the unit tests never caught because they only hit mocked `global.fetch` with the wrong shapes. Phase 2 inherits the fixes and the conventions — do not re-introduce these.

### 1. fs-whatsapp wraps every response in `{status, data: {...}}`

**Verified in code** — `fs-whatsapp/internal/handlers/accounts.go:70` and every handler that uses `r.SendEnvelope(...)`. The actual response shape is:

```json
{
  "status": "success",
  "data": { "projects": [...], "total": 1 }
}
```

**Implication for Phase 2 publisher helpers**: every single one of `createProject`, `createVersion`, `publishVersion`, `publishRuntimeFlow`, `deleteProject`, `checkKeywordConflict` must read `body.data?.*` — NOT `body.*`. Test mocks must wrap response payloads in `{status: "success", data: {...}}` from the start. See the corrected Phase 1 helpers in `lib/agent-api/account-resolver.ts` and `lib/agent-api/publisher.ts` for the pattern. Phase 1 commit `7baa9205` has the full fix diff.

### 2. Server-side code uses `FS_WHATSAPP_API_URL`, not `NEXT_PUBLIC_FS_WHATSAPP_URL`

`lib/agent-api/constants.ts` was already corrected in Phase 1 (commit `c28050f1`). It reads `FS_WHATSAPP_API_URL` first (which docker compose sets to `http://host.docker.internal:8080`), falls back to `NEXT_PUBLIC_FS_WHATSAPP_URL`, then localhost. **Phase 2 inherits this** by importing `FS_WHATSAPP_URL` from `./constants` in every helper. Do not re-read env vars at call sites — always import the resolved constant.

### 3. Next.js `middleware.ts` has `/api/v1/agent` in `PUBLIC_ROUTES`

Already patched in Phase 1. Phase 2's `POST /v1/agent/flows` does not need any middleware changes — the wildcard match covers it.

### 4. Subagent dispatch pattern

Phase 1 used `superpowers:subagent-driven-development` with fresh general-purpose subagents per task (model: sonnet) and the docker compose run invocation pattern for tests:

```bash
docker compose run --rm --no-deps app npx vitest run <path>
docker compose run --rm --no-deps app npx tsc --noEmit
```

The worktree at `.worktrees/agent-api-phase-1` was used — Phase 2 should use a NEW worktree `.worktrees/agent-api-phase-2` branched from `feat/flow-assistant-agent-api-phase-1` (NOT from main) so the Phase 1 glue layer is present.

### 5. `vi.fn` type casts need `as unknown as [...]` for multi-arg tuples

Phase 1's `auth.test.ts` Task 7 needed this workaround when casting `handler.mock.calls[0]` to a `[AgentContext, Request]` tuple. The `vi.fn` inference produces a single-arg tuple because the test's arrow `(ctx: AgentContext) => ...` infers a one-arg signature. Workaround: `mock.calls[0] as unknown as [AgentContext, Request]`. Bake this into Phase 2 route tests from the start.

### 6. `.env.local` and the worktree

Phase 1 needed `.env.local` copied from the main magic-flow checkout into the worktree for docker compose to start. Phase 2's new worktree will need the same copy. Not checked into git.

## Verified from code — actual `generateFlowStreaming` shape

**Important corrections from what the earlier spec assumed:**

**Signature** (`lib/ai/tools/generate-flow.ts:355`):

```typescript
export async function generateFlowStreaming(
  request: GenerateFlowRequest,
  emit: (event: StreamEvent) => void,
): Promise<void>
```

There is **NO `abortSignal` parameter**. My earlier plan claimed we'd plumb `req.signal` into `generateFlowStreaming` — we can't, because the parameter doesn't exist. For v1, Phase 2 accepts that client disconnects leave the AI call running in the background (wasted tokens until the streamText call completes naturally). Document this as a known gap; don't try to fix it by modifying `generateFlowStreaming`'s signature (that would break the internal UI path).

**StreamEvent union** (`lib/ai/tools/generate-flow.ts:88-106`):

```typescript
export type StreamEvent =
  | { type: 'tool_step'; tool: string; status: 'running' | 'done'; summary?: string; details?: ToolStepDetails }
  | { type: 'text_delta'; delta: string }
  | { type: 'flow_ready'; flowData?: GenerateFlowResponse['flowData']; updates?: GenerateFlowResponse['updates']; action: 'create' | 'edit'; warnings?: string[]; debugData?: Record<string, unknown> }
  | { type: 'result'; data: GenerateFlowResponse }
  | { type: 'error'; message: string }
```

Note: `tool_step` has `tool: string` (the tool name) and `status: 'running' | 'done'` — the earlier plan said the translator should switch on `details.kind`, which is only a hint and not always present. Don't switch on `details.kind` — switch on `tool` name and `status`, and use `summary` for the human-readable text.

**Create path** (`lib/ai/tools/generate-flow-create-streaming.ts`):
- Uses `streamText()` from Vercel AI SDK with ONE tool named `build_and_validate` (NOT the 8-tool edit set)
- `stopWhen: stepCountIs(8)` — max 8 tool iterations
- Events fire from `streamText` callbacks:
  - `experimental_onToolCallStart` → `tool_step (running)`
  - `experimental_onToolCallFinish` → `tool_step (done, summary, details)`
  - `onChunk` for text chunks → `text_delta`
- `flow_ready` fires **inside** the `build_and_validate` tool's `execute` function when validation passes (line 58-64) — this is the "flow is validated and ready" signal
- Final `result` event emitted after `await result.text` (line 161-181) — carries `GenerateFlowResponse.flowData`

**Implication for event translator**: the route handler must **capture** the final `result.data.flowData` via a closure variable in the emit callback, not forward it to SSE. The SSE `result` event is emitted by the route handler AFTER `generateFlowStreaming` returns, with the PUBLIC payload shape (flow_id, magic_flow_url, test_url, etc.), NOT the internal `GenerateFlowResponse`.

Simplified translator logic (replaces the rules from the earlier plan):

```typescript
// In the route handler, inside the SSE async block:
let capturedFlowData: GenerateFlowResponse['flowData'] | null = null
let capturedMessage = ''
let capturedError: string | null = null

await generateFlowStreaming(request, (event) => {
  switch (event.type) {
    case 'text_delta':
      // drop — noise for the agent API
      break
    case 'tool_step':
      if (event.status === 'done' && event.summary) {
        writer.progress('generating', event.summary)
      }
      break
    case 'flow_ready':
      writer.progress('validating', 'Flow plan validated, preparing to publish')
      break
    case 'result':
      capturedFlowData = event.data.flowData ?? null
      capturedMessage = event.data.message
      break
    case 'error':
      capturedError = event.message
      break
  }
})

if (capturedError) throw new AgentError('validation_failed', capturedError)
if (!capturedFlowData) throw new AgentError('invalid_instruction', capturedMessage || 'AI did not produce a flow')

// Proceed with publishing using capturedFlowData
```

This is simpler than a separate `event-translator.ts` module. For Phase 2, inline this in the route handler. If we need to reuse it for Phase 3's edit endpoint, extract it then.

**Consequence**: `lib/agent-api/event-translator.ts` is **no longer a deliverable** in Phase 2 — the translation is ~20 lines of route-handler-local code. Remove it from the file inventory below.

---

**Goal:** Ship the one-shot create endpoint. `POST /v1/agent/flows` that takes a natural-language instruction + trigger keyword, runs AI generation via `generateFlowStreaming`, creates a `MagicFlowProject`, writes a new version, and deploys to fs-whatsapp's `ChatbotFlow` runtime with the trigger keyword baked into the publish payload. Returns SSE stream with progress events and a final `result` event containing `test_url` and `magic_flow_url`.

**Architecture:** `POST` handler added to the existing `app/api/v1/agent/flows/route.ts` (which has `GET` from Phase 1). Wrapped with `withAgentAuth` on the `expensive` rate limit bucket. The pipeline: validate → pre-check keyword conflict → start SSE stream → `createProject` → `generateFlowStreaming` (with translated events) → `createVersion` → `publishVersion` → `publishRuntimeFlow` (with `trigger_keywords` in the payload) → emit terminal `result` event. Orphan project cleanup on any failure after `createProject`.

**Tech Stack:** Same as Phase 1 — Next.js, Vitest, Zod. New dependency: plumbing the existing `generateFlowStreaming` callback events into our `SSEWriter` via a new `event-translator.ts` module.

**Reference spec:** `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-design.md` (especially the create endpoint section, the "Event translation" subsection, and edge case #4 for orphan cleanup).

**Pre-reading for the implementer:**
- `magic-flow/lib/ai/tools/generate-flow.ts` — read `generateFlowStreaming` at line 355 and the `StreamEvent` union at line 88. Understand what events are emitted when and what data they carry.
- `magic-flow/lib/ai/tools/generate-flow-edit.ts` — skim to understand how edit-mode tool calls produce `tool_step` events with `ToolStepDetails`.
- `magic-flow/app/api/ai/flow-assistant/route.ts` — the existing NDJSON streaming route. Phase 2 mirrors this structure but with SSE and our translation layer.
- `fs-whatsapp/internal/handlers/chatbot.go:762` — `CreateChatbotFlow`. Confirms `trigger_keywords` in the request body.
- `fs-whatsapp/internal/handlers/magic_flow.go:273` — `CreateMagicFlowProject`. Auto-creates v1 stub.
- `fs-whatsapp/internal/handlers/magic_flow.go:598` — `CreateMagicFlowVersion`. Auto-increments version_number.
- `fs-whatsapp/internal/handlers/magic_flow.go:667` — `PublishMagicFlowVersion`. Transaction-based publish.
- `magic-flow/utils/whatsapp-converter.ts` — `convertToFsWhatsApp` (or equivalent — look up actual export name) that converts ReactFlow nodes/edges into fs-whatsapp's flat step list.
- Phase 1 files, especially `lib/agent-api/auth.ts` and `lib/agent-api/publisher.ts`, to extend them consistently.

---

## File Structure

### New files

None. Phase 2 adds no new files in `lib/agent-api/*` — everything new lives as additions to the existing Phase 1 files. Event translation is inline in the route handler (~20 LOC), not its own module.

### Modified files

```
magic-flow/
├── lib/agent-api/
│   ├── publisher.ts                  # Add createProject, createVersion, publishVersion,
│   │                                 # publishRuntimeFlow, deleteProject, checkKeywordConflict
│   │                                 # All unwrap {status, data: ...} envelope
│   └── __tests__/
│       └── publisher.test.ts         # Extended with new helper tests
├── lib/ai/tools/generate-flow.ts     # Add `context?: { source: "agent_api" | "ui" }` to
│                                     # GenerateFlowRequest — optional, default behavior unchanged
├── app/api/v1/agent/flows/
│   ├── route.ts                      # Add POST handler (~200 LOC — biggest single file in Phase 2)
│   └── __tests__/
│       └── route.test.ts             # Extend with POST create tests, including:
│                                     #   happy path, missing fields, keyword conflict,
│                                     #   validation failure + orphan cleanup, publish failure
```

### File responsibilities

**`publisher.ts` additions**: six new exported async functions. All take `ctx: AgentContext` as first arg, forward `X-API-Key` to fs-whatsapp, and unwrap `body.data?.*` from the response envelope. Follow the exact pattern of Phase 1's `listFlows`.

- `createProject(ctx, { name, platform })` → `Promise<{id: string}>` — POST to `/api/magic-flow/projects`. Returns the new project ID extracted from `body.data.id`.
- `createVersion(ctx, projectId, nodes, edges, changes)` → `Promise<{id: string, version_number: number}>` — POST to `/api/magic-flow/projects/{projectId}/versions`. Returns `body.data.id` and `body.data.version_number`.
- `publishVersion(ctx, projectId, versionId)` → `Promise<void>` — POST to `/api/magic-flow/projects/{projectId}/versions/{versionId}/publish`. Throws on non-2xx.
- `publishRuntimeFlow(ctx, { flowData, triggerKeywords, triggerMatchType }, existingRuntimeFlowId?)` → `Promise<{runtimeFlowId: string}>` — POST to `/api/chatbot/flows` (create) or PUT to `/api/chatbot/flows/{id}` (update). `trigger_keywords` and `trigger_match_type` are included in the request body, not a separate call.
- `deleteProject(ctx, projectId)` → `Promise<void>` — DELETE `/api/magic-flow/projects/{id}` for orphan cleanup. Throws on non-2xx BUT callers should wrap in try/catch since cleanup failures must not mask the original error.
- `checkKeywordConflict(ctx, normalizedKeyword)` → `Promise<{id, name, magic_flow_url} | null>` — reuses Phase 1's `listFlows(ctx, 50)`, scans all returned `trigger_keyword` fields, returns matching flow info if found (case-insensitive match on the normalized keyword). Returns null if no conflict.

**`generate-flow.ts` changes**: add an optional `context?: { source: "agent_api" | "ui" }` field to `GenerateFlowRequest`. For Phase 2's create path, the main effect is that when `source === "agent_api"`, downstream code should not expect `selectedNode`, `userTemplates`, or `toolContext.publishedFlowId` — these are UI-only. In practice the create path (`executeCreateModeStreaming`) doesn't use these fields, so the context param is more of a forward-declaration for Phase 3's edit path than a behavior change for Phase 2. Non-breaking default: if omitted, behavior is identical to today.

**`route.ts` POST handler**: wrapped by `withAgentAuth(..., "expensive")`. Pipeline:

1. **Pre-stream validation** (HTTP errors, not SSE):
   - Parse body with `createFlowBodySchema.safeParse`; on failure throw `AgentError("invalid_instruction", ...)` with zod issues in details
   - `normalizedKeyword = body.trigger_keyword.toLowerCase()` (schema already lowercases but be defensive)
   - If `body.channel` not in `ctx.account.connected_channels` → throw `AgentError("channel_not_connected", ..., { connected_channels })`
   - `checkKeywordConflict(ctx, normalizedKeyword)` → if match, throw `AgentError("keyword_conflict", ..., { existing_flow: {...} })`

2. **Open SSE stream** (`const { readable, writer } = SSEWriter.create()`) and return `Response` with SSE headers immediately. All pipeline work happens in an async IIFE that writes to the writer.

3. **Pipeline** (inside the async IIFE, with `let projectId: string | null = null` for cleanup tracking):
   - `writer.progress("understanding", "Analyzing your request")`
   - `createProject(ctx, {name: deriveName(instruction), platform: channel})` → `projectId = project.id`
   - `writer.progress("planning", "Building flow plan")`
   - Call `generateFlowStreaming` with a closure-based emit callback (see "Event handling" below)
   - `writer.progress("creating_version", "Saving flow version")`
   - `createVersion(ctx, projectId, capturedFlowData.nodes, capturedFlowData.edges, {source: "agent_api", instruction})`
   - `publishVersion(ctx, projectId, version.id)`
   - `writer.progress("publishing", "Deploying to runtime")`
   - `convertToFsWhatsApp(capturedFlowData)` to get the flat payload
   - `publishRuntimeFlow(ctx, {flowData, triggerKeywords: [normalizedKeyword], triggerMatchType: "exact"})`
   - `writer.result({flow_id: projectId, version: N, name, summary, node_count, magic_flow_url, test_url, trigger_keyword, created_at})`
   - `writer.close()`

4. **Error handling**:
   - Catch any error from the pipeline
   - `writer.error(AgentError.fromUnknown(err))`
   - If `projectId` is set, call `deleteProject(ctx, projectId).catch(logCleanupError)` — cleanup failures are logged but don't re-throw
   - `writer.close()`

### Event handling — inline, NOT a separate module

The earlier draft of this plan proposed a `lib/agent-api/event-translator.ts` module. We're dropping it — the translation is short enough to inline in the route handler. Pattern:

```typescript
let capturedFlowData: { nodes: any[]; edges: any[]; nodeOrder?: string[] } | null = null
let capturedMessage = ''
let capturedError: string | null = null

await generateFlowStreaming(
  {
    prompt: instruction,
    platform: channel,
    existingFlow: { nodes: [{ id: "start", type: "start", position: {x:0,y:0}, data: {} }], edges: [] },
    context: { source: "agent_api" },
  },
  (event) => {
    switch (event.type) {
      case 'text_delta':
        // drop — AI prose tokens are noise for the agent API
        break
      case 'tool_step':
        if (event.status === 'done' && event.summary) {
          writer.progress('generating', event.summary)
        }
        break
      case 'flow_ready':
        writer.progress('validating', 'Flow plan ready')
        break
      case 'result':
        capturedFlowData = event.data.flowData ?? null
        capturedMessage = event.data.message
        break
      case 'error':
        capturedError = event.message
        break
    }
  }
)

if (capturedError) throw new AgentError('validation_failed', capturedError)
if (!capturedFlowData) throw new AgentError('invalid_instruction', capturedMessage || 'AI did not produce a flow plan')
```

**No abort signal**: `generateFlowStreaming` doesn't accept one. If the client disconnects (`req.signal.aborted`), the async IIFE will try to write to a closed `SSEWriter` — the writer's `enqueue` catch swallows these, so it's safe. The AI call continues in the background until natural completion. Wasted tokens on abort, acceptable v1 tradeoff.

---

## Task 1: Extend `publisher.ts` with createProject + deleteProject

**Files:**
- Modify: `magic-flow/lib/agent-api/publisher.ts`
- Modify: `magic-flow/lib/agent-api/__tests__/publisher.test.ts`

**Acceptance criteria:**
- `createProject(ctx, {name, platform})` POSTs to `/api/magic-flow/projects`, returns `{id: string}`
- `deleteProject(ctx, projectId)` DELETEs `/api/magic-flow/projects/{id}`, returns void
- Both forward `X-API-Key` from context
- Both throw `AgentError("internal_error", ...)` on non-2xx responses
- Unit tests cover: happy path, 401 passthrough, 500 error, network failure, correct request headers/body

**Test requirements:**
- Mock `global.fetch` with `vi.fn()`
- Assert the URL, method, headers, body on the fetch call
- Use a minimal mock `AgentContext`

**Pre-reading for this task:**
- Read `fs-whatsapp/internal/handlers/magic_flow.go:273-368` to understand the `CreateMagicFlowProject` request shape. Find the struct that the handler unmarshals (`CreateMagicFlowProjectRequest` or similar) and use those field names verbatim in the fetch body.
- Read the same file around line 1050-1150 for the DELETE handler's exact path.

---

## Task 2: Extend `publisher.ts` with createVersion + publishVersion

**Files:**
- Modify: `magic-flow/lib/agent-api/publisher.ts`
- Modify: `magic-flow/lib/agent-api/__tests__/publisher.test.ts`

**Acceptance criteria:**
- `createVersion(ctx, projectId, nodes, edges, changes)` POSTs to `/api/magic-flow/projects/{projectId}/versions`
- Returns `{id: string, version_number: number}` extracted from the response
- `publishVersion(ctx, projectId, versionId)` POSTs to `/api/magic-flow/projects/{projectId}/versions/{versionId}/publish`
- Returns void, throws on non-2xx
- Both forward `X-API-Key`
- Both throw `AgentError("internal_error", ...)` on failure

**Test requirements:**
- Happy path creates version → returns the version_number from fs-whatsapp's response
- Publish marks it as published — assert the URL pattern
- Error propagation: 500 on version create → internal_error, 404 on publish → internal_error

**Pre-reading for this task:**
- `fs-whatsapp/internal/handlers/magic_flow.go:598` — `CreateMagicFlowVersion` — the request body and response shape
- `fs-whatsapp/internal/handlers/magic_flow.go:667` — `PublishMagicFlowVersion`

---

## Task 3: Extend `publisher.ts` with publishRuntimeFlow

**Files:**
- Modify: `magic-flow/lib/agent-api/publisher.ts`
- Modify: `magic-flow/lib/agent-api/__tests__/publisher.test.ts`

**Acceptance criteria:**
- `publishRuntimeFlow(ctx, { flowData, triggerKeywords, triggerMatchType }, existingRuntimeFlowId?)` — POST to `/api/chatbot/flows` for create, PUT to `/api/chatbot/flows/{id}` for update
- `trigger_keywords` and `trigger_match_type` are included in the request body (confirmed at `fs-whatsapp/internal/handlers/chatbot.go:771` and `:997`)
- Returns `{runtimeFlowId: string}` for both create and update
- Forwards `X-API-Key`
- Throws `AgentError("publish_failed", ...)` on non-2xx (distinct code from other publisher errors because the spec has a `publish_failed` error type customers can retry)

**Test requirements:**
- Create path: POSTs to `/api/chatbot/flows`, returns the new flow ID
- Update path: PUTs to `/api/chatbot/flows/{id}`, returns the same ID
- Error: 500 from fs-whatsapp → `publish_failed` with upstream error message
- Network error: `internal_error` (retriable differently from publish_failed)

**Pre-reading for this task:**
- `fs-whatsapp/internal/handlers/chatbot.go:761-949` — `CreateChatbotFlow` full handler, especially the request struct at 771 and response shape at 943
- `fs-whatsapp/internal/handlers/chatbot.go:977-1194` — `UpdateChatbotFlow`

---

## Task 4: Extend `publisher.ts` with checkKeywordConflict

**Files:**
- Modify: `magic-flow/lib/agent-api/publisher.ts`
- Modify: `magic-flow/lib/agent-api/__tests__/publisher.test.ts`

**Acceptance criteria:**
- `checkKeywordConflict(ctx, normalizedKeyword)` fetches the flow list (reuses Phase 1 `listFlows` or makes its own call to `/api/magic-flow/projects`) and scans for any flow with `trigger_keywords` containing a case-insensitive match on `normalizedKeyword`
- Returns `{id, name, magic_flow_url}` if a conflict is found, or `null` if not
- Pagination: hit `/api/magic-flow/projects?limit=100` (max allowed by fs-whatsapp). If the org has >100 flows, v1 has a race window — documented as a limitation, not handled
- Forwards `X-API-Key`
- Throws `internal_error` on fs-whatsapp failure

**Test requirements:**
- Returns null on empty flow list
- Returns null when no keyword matches
- Returns the matching flow info when keyword matches exactly
- Returns the matching flow info when keyword matches case-insensitively (e.g., stored "IPhone11" vs query "iphone11")
- Ignores keyword list entries that are empty strings
- Multiple matching flows: returns the first match (deterministic order from fs-whatsapp's `updated_at DESC` sort)

---

## Task 5: Add the `context` parameter to `GenerateFlowRequest`

**Files:**
- Modify: `magic-flow/lib/ai/tools/generate-flow.ts`
- (Optional) Create: `magic-flow/lib/ai/tools/__tests__/generate-flow.context.test.ts`

**Acceptance criteria:**
- `GenerateFlowRequest` interface (starts at line ~13 of `generate-flow.ts`) gains an optional field: `context?: { source: "agent_api" | "ui" }`
- No runtime behavior change: the field is accepted but the create path (`executeCreateModeStreaming`) doesn't consume it in Phase 2. It's declared now so Phase 3's edit path can branch on it without a breaking schema change.
- Internal UI path still works unchanged — existing `lib/__tests__/` tests still pass
- No changes to `executeCreateModeStreaming`, `executeEditModeStreaming`, or `handleFallback` in Phase 2

**Test requirements:**
- Add a single type-level test (or inline comment) verifying the field is optional and doesn't break the existing call sites
- Run the full existing magic-flow test suite: `docker compose run --rm --no-deps app npm run test` → all pass, no regressions
- Manual UI sanity check: start the worktree stack, open a flow in the UI, interact with the AI flow assistant chat → confirm it still responds normally

**Risk mitigation:**
- Phase 2 deliberately makes the smallest possible change to `generate-flow.ts`: add one optional field to an interface. No conditionals, no code-path changes. Phase 3 will add the `context.source === "agent_api"` branch when we need it for edit mode's `toolFilter`.

**Pre-reading for this task:**
- `lib/ai/tools/generate-flow.ts:13-30` — `GenerateFlowRequest` interface

---

## Task 6: ~~Event translator module~~ (dropped)

Inlined into the route handler (~20 LOC). No separate module. No separate test file. The route handler's integration test (Task 8) covers the event-handling logic end-to-end. See "Event handling — inline, NOT a separate module" in the File responsibilities section above for the pattern.

This task is removed from Phase 2. The task numbering below reflects this — the old Task 7 (route handler) is now Task 6, old Task 8 is Task 7, etc.

---

## Task 7: Add the POST handler to `app/api/v1/agent/flows/route.ts`

**Files:**
- Modify: `magic-flow/app/api/v1/agent/flows/route.ts`
- Modify: `magic-flow/app/api/v1/agent/flows/__tests__/route.test.ts`

**Acceptance criteria:**
- `export const POST = withAgentAuth(async (ctx, req) => {...}, "expensive")`
- Parse body with `createFlowBodySchema`; on failure throw `AgentError("invalid_instruction", ...)` with the zod issues included in details
- Normalize `trigger_keyword` to lowercase before all downstream use
- Channel not in `connected_channels` → `AgentError("channel_not_connected", ..., { connected_channels: [...] })`
- `checkKeywordConflict` match → `AgentError("keyword_conflict", ..., { existing_flow: {...} })`
- All the above happen BEFORE the SSE stream opens. They return as normal HTTP error responses via the wrapper's `AgentError → toHttpResponse` pipeline.
- After passing validation: create the SSE stream via `SSEWriter.create()`, return the `Response` with SSE headers, and start the pipeline work in an async IIFE that writes to the writer.
- Pipeline steps: createProject → generateFlowStreaming (piping events through event-translator) → createVersion → publishVersion → publishRuntimeFlow → emit `result` → close
- Each step emits a pre-step `progress` event via `writer.progress(phase, message)` before calling the work
- On any error during the pipeline after `createProject`: emit `error` via writer, call `deleteProject(ctx, projectId)` in a finally block, close the writer. Cleanup failures are caught and logged, not re-thrown.
- SSE response headers exactly: `content-type: text/event-stream`, `cache-control: no-cache`, `connection: keep-alive`, `x-accel-buffering: no`
- **No abort signal plumbing** — `generateFlowStreaming` doesn't accept one. Client disconnect is handled by `SSEWriter.enqueue`'s silent catch-and-drop; the AI call finishes in the background and its output is discarded when the writer is closed. Document as a known gap, don't fix in Phase 2.

**Test requirements:**
- Happy path: mock all fs-whatsapp calls, assert SSE stream contains expected progress events in order, assert final `result` event has the right fields
- Missing field → 400 with correct error code
- Channel not connected → 400 with `connected_channels` in response
- Keyword conflict → 409 with `existing_flow` in response
- Validation failure from AI → `error` event in stream + `deleteProject` called
- Post-validation failure (e.g., publishRuntimeFlow fails) → `error` event + orphan cleanup

**Pre-reading for this task:**
- `magic-flow/app/api/ai/flow-assistant/route.ts` — the existing NDJSON streaming route. Your Phase 2 POST handler follows the same shape but with SSE and the new pipeline.
- The Phase 1 GET handler in the same file — to understand the `withAgentAuth` wrapping pattern

---

## Task 8: Integration test — full create-flow happy path

**Files:**
- Modify: `magic-flow/app/api/v1/agent/flows/__tests__/route.test.ts`

**Acceptance criteria:**
- One end-to-end test that mocks ALL downstream fetches (`/api/accounts`, `/api/magic-flow/projects` list, `/api/magic-flow/projects` create, `/api/magic-flow/projects/{id}/versions` create, `/api/magic-flow/projects/{id}/versions/{v}/publish`, `/api/chatbot/flows` create) and the AI client call
- Mocks `generateFlowStreaming` via module mock (`vi.mock("@/lib/ai/tools/generate-flow", ...)`) to emit a scripted sequence of StreamEvents
- Asserts the SSE response contains: one `progress` event per phase, exactly one terminal `result` event, no terminal `error` event, the final result payload has all required fields
- Asserts all downstream fetches were called in the correct order with the correct bodies
- Asserts no `deleteProject` was called (since happy path succeeds)

**Test requirements:**
- This test is the single most important "does the whole thing work" signal for Phase 2. Spend time making it readable — it's the gold reference for how the create pipeline is supposed to behave.
- Do not mock our own code (publisher.ts helpers). Only mock `fetch` (for the publisher → fs-whatsapp calls) and the `generateFlowStreaming` module import (for the AI call).
- **Mock fs-whatsapp responses in the `{status: "success", data: {...}}` envelope shape** — this is the number one gotcha from Phase 1. See `lib/agent-api/__tests__/publisher.test.ts` for the pattern.

---

## Task 9: Error path tests — orphan cleanup + mid-stream failures

**Files:**
- Modify: `magic-flow/app/api/v1/agent/flows/__tests__/route.test.ts`

**Acceptance criteria:**
- Test 1: AI generation returns a `StreamEvent` of type `error` → SSE stream emits `error` event, `deleteProject` is called with the project ID, the HTTP response is still 200 (the error comes through the stream, not HTTP status)
- Test 2: `publishRuntimeFlow` throws → SSE stream emits `error` event with code `publish_failed`, `deleteProject` is called, stream closes cleanly
- Test 3: `deleteProject` itself fails during cleanup → the primary error event is still emitted, the cleanup failure is logged but swallowed, stream closes
- Test 4 (client abort — informational): simulate by calling `SSEWriter.close()` mid-pipeline. The pipeline continues but further `writer.progress/result/error` calls become no-ops. No uncaught promise rejections. Since `generateFlowStreaming` doesn't accept an AbortSignal, the AI call keeps running — we just stop writing its output. This test is a smoke test that the silent-drop behavior doesn't throw.

**Test requirements:**
- Explicit assertion on `deleteProject` call count — should be exactly 1 per failure test
- No uncaught promise rejections — wrap the test bodies in `await` properly so vitest catches any floating rejections

---

## Task 10: Manual verification against a running stack

**Prerequisites:**
- Phase 1 worktree stack still running on port 3010 OR a fresh Phase 2 worktree stack (create a `docker-compose.override.yml` with port overrides to avoid conflicts with broadcasting-plans stack on port 3002)
- fs-whatsapp running (the `fschat_*` containers from the fs-whatsapp repo's docker compose)
- ANTHROPIC_API_KEY already set in the worktree's `.env.local` (copied from main magic-flow during Phase 1 setup)
- Test org from Phase 1 reused: `phase1-test@agent-api.local` with its seeded WhatsApp account (account ID `4230af1f-b5f6-475c-878a-9979064ff972`). If that test data was cleaned up, recreate via the fs-whatsapp API as documented in Phase 1 Task 10.
- A fresh `whm_*` key (previous one was revoked). Create via `POST /api/auth/login` + `POST /api/api-keys` as Phase 1 did.

**Acceptance criteria:**
- Curl a create request with valid fields, observe SSE stream in real time, see progress events fire
- Final result event contains `flow_id`, `test_url`, `magic_flow_url`, `version: 2`
- Navigate to the `magic_flow_url` — the created flow appears in the UI exactly as if a human had built it
- Open the test_url on a mobile device with WhatsApp — confirm the flow triggers when the keyword is sent
- Curl with a duplicate trigger keyword → observe `keyword_conflict` HTTP response (not SSE)
- Curl with `channel: "instagram"` → observe `channel_not_connected` HTTP response
- Curl then kill the request mid-stream (Ctrl+C after ~3 seconds) — observe that the orphan project gets deleted (check the UI flow list, or query fs-whatsapp directly)
- Run a second create in the same minute that deliberately exceeds the `expensive` rate limit (11 calls) — observe 429 on the 11th
- After successful creation, verify in the MagicFlow UI that the flow shows up in version history with `changes.source = "agent_api"` metadata

**Test commands** (adjust port to match your worktree — Phase 1 used 3010):

```bash
# Happy path — observe SSE stream
curl -N -X POST http://localhost:3010/api/v1/agent/flows \
  -H "X-API-Key: $FREESTAND_TEST_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "instruction": "build a simple lead capture flow that asks for name and phone",
    "channel": "whatsapp",
    "trigger_keyword": "testphase2"
  }'

# Keyword conflict — run the same curl twice. Second call should return HTTP 409 with
# `{"code":"keyword_conflict","existing_flow":{...}}` before any SSE stream opens.

# Channel not connected — Instagram is not seeded on the Phase 1 test org
curl -X POST http://localhost:3010/api/v1/agent/flows \
  -H "X-API-Key: $FREESTAND_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instruction":"x","channel":"instagram","trigger_keyword":"foo"}'
# Expect HTTP 400 with `{"code":"channel_not_connected","connected_channels":["whatsapp"]}`

# Cleanup verification — check the fs-whatsapp DB to confirm the test flow exists
# after a happy path run, and does NOT exist after a validation-failure run.
curl -s http://localhost:3010/api/v1/agent/flows -H "X-API-Key: $FREESTAND_TEST_KEY" | jq .
```

---

## Task 11: Phase 2 wrap-up

**Acceptance criteria:**
- All unit tests pass: `docker compose run --rm --no-deps app npm run test` → all green, no new skips
- Full type check: `docker compose run --rm --no-deps app npx tsc --noEmit` → pass
- The internal `/api/ai/flow-assistant` path still works in the MagicFlow UI with no regressions (spot-check by opening a flow and interacting with the AI assistant)
- The Phase 1 `GET /v1/agent/flows` endpoint still works
- A fresh `whm_*` key can create a flow end-to-end from curl in < 30 seconds wall time
- Branch: `feat/flow-assistant-agent-api-phase-2`
- PR created but NOT merged until user review

---

## Phase 2 Definition of Done

- [ ] `lib/agent-api/publisher.ts` has 6 functions: `listFlows` (from Phase 1), `createProject`, `createVersion`, `publishVersion`, `publishRuntimeFlow`, `deleteProject`, `checkKeywordConflict`
- [ ] `lib/agent-api/event-translator.ts` exists with the full `StreamEvent → SSE` mapping
- [ ] `lib/ai/tools/generate-flow.ts` accepts an optional `context` param; internal UI path unchanged
- [ ] `app/api/v1/agent/flows/route.ts` has both `GET` and `POST` handlers; `POST` streams SSE
- [ ] All new unit tests pass
- [ ] Integration test for create happy path passes
- [ ] Error-path tests (validation failure, publish failure, orphan cleanup, abort) pass
- [ ] Manual E2E: curl create → flow visible in UI → test URL works
- [ ] No regressions on `/api/ai/flow-assistant` (internal UI path)
- [ ] No regressions on `GET /v1/agent/flows` (Phase 1 endpoint)
- [ ] PR on `feat/flow-assistant-agent-api-phase-2`, not merged

## What Phase 2 deliberately does NOT do

- No edit endpoint
- No publish endpoint
- No `flow-loader.ts` (needed for edit)
- No `diff.ts` (needed for edit responses)
- No `toolFilter` modification to `generate-flow-edit.ts` (Phase 3)
- No customer-facing docs (Phase 4)
- No OpenAPI spec (Phase 4)
- No rate limit tuning beyond Phase 1's defaults
