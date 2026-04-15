# Flow Assistant Agent API — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan granularity note:** This plan is at the task level with exact files, acceptance criteria, test requirements, and the specific code concerns each task needs to address. Full bite-sized TDD step decomposition is deliberately deferred until Phase 1 has shipped — the inner details of each task may shift based on what we learn from Phase 1 (e.g., actual vitest setup quirks, real event shapes from `generateFlowStreaming`, what it takes to mock fs-whatsapp effectively). Before starting Phase 2, re-run `superpowers:writing-plans` on this file to expand each task into step-level TDD form.

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

```
magic-flow/
├── lib/agent-api/
│   ├── event-translator.ts           # StreamEvent → SSE progress/result/error translation
│   └── __tests__/
│       └── event-translator.test.ts
```

### Modified files

```
magic-flow/
├── lib/agent-api/
│   ├── publisher.ts                  # Add createProject, createVersion, publishVersion,
│   │                                 # publishRuntimeFlow, deleteProject, checkKeywordConflict
│   └── __tests__/
│       └── publisher.test.ts         # Extended test coverage for new helpers
├── lib/ai/tools/generate-flow.ts     # Add `context?: { source: "agent_api" }` param
├── app/api/v1/agent/flows/
│   ├── route.ts                      # Add POST handler
│   └── __tests__/
│       └── route.test.ts             # Extend with POST create tests
```

### File responsibilities

**`event-translator.ts`**: single module exporting `translateStreamEvent(internal: StreamEvent, writer: SSEWriter): boolean`. Takes one internal event from `generateFlowStreaming`, emits the corresponding public SSE event(s), returns `true` if the event was terminal (result or error) or `false` otherwise. The caller uses the return value to stop reading the stream. Translation rules exactly as documented in the spec's "Event translation" subsection.

**`publisher.ts` additions**: five new exported async functions. All take `ctx: AgentContext` as first arg and forward `X-API-Key` to fs-whatsapp.

- `createProject(ctx, { name, platform })` → `Promise<{id: string}>` — POSTs to `/api/magic-flow/projects`, returns the new project ID
- `createVersion(ctx, projectId, nodes, edges, changes)` → `Promise<{id: string, version_number: number}>`
- `publishVersion(ctx, projectId, versionId)` → `Promise<void>`
- `publishRuntimeFlow(ctx, { flowData, triggerKeywords, triggerMatchType }, existingRuntimeFlowId?)` → `Promise<{runtimeFlowId: string}>` — POST or PUT to `/api/chatbot/flows`
- `deleteProject(ctx, projectId)` → `Promise<void>` — DELETE for orphan cleanup
- `checkKeywordConflict(ctx, normalizedKeyword)` → `Promise<ExistingFlowInfo | null>` — uses the Phase 1 `listFlows` helper internally, scans all flows' `trigger_keywords`, returns matching flow info if found

**`generate-flow.ts` changes**: add an optional `context?: { source: "agent_api" | "ui" }` field to `GenerateFlowRequest`. When `context?.source === "agent_api"`, skip UI-specific logic. Non-breaking default: if omitted, behavior is identical to today. Keeps the UI path completely unchanged.

**`route.ts` POST handler**: wrapped by `withAgentAuth(..., "expensive")`. Pipeline:
1. Parse and validate request body with `createFlowBodySchema`
2. Normalize `trigger_keyword` to lowercase (schema already enforces lowercase but be defensive)
3. Verify `channel` is in `ctx.account.connected_channels` (throw `channel_not_connected`)
4. Call `checkKeywordConflict(ctx, normalizedKeyword)`, throw `keyword_conflict` if found
5. Start SSE stream via `SSEWriter.create()`
6. Inside the stream's async block:
   - Emit `progress` for "understanding"
   - `createProject` with a derived name
   - Emit `progress` for "planning"
   - `generateFlowStreaming` with the translated-event callback that forwards to `writer` via `event-translator.ts`; the AbortSignal is `req.signal`
   - Emit `progress` for "validating"
   - `createVersion` with the generated nodes/edges
   - `publishVersion` to promote v2 live in magic-flow
   - Emit `progress` for "publishing"
   - `publishRuntimeFlow` with `trigger_keywords` in the payload
   - Emit `result` with the final payload (flow_id, version, magic_flow_url, test_url, trigger_keyword, summary, node_count, created_at)
   - `writer.close()`
7. On any error after step 6.2 (createProject): catch, emit `error` event, call `deleteProject` for orphan cleanup, `writer.close()`
8. Return `new Response(readable, { headers: sseHeaders })`

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

## Task 5: Add the `context` parameter to `generateFlowStreaming`

**Files:**
- Modify: `magic-flow/lib/ai/tools/generate-flow.ts`
- Create: `magic-flow/lib/ai/tools/__tests__/generate-flow.context.test.ts` (new dedicated test for the new param)

**Acceptance criteria:**
- `GenerateFlowRequest` gains an optional `context?: { source: "agent_api" | "ui" }` field
- When `context?.source === "agent_api"`: skip UI-specific setup (selectedNode, userTemplates, userTemplateData, publishedFlowId in toolContext should all be undefined regardless of what the caller passed)
- When `context` is omitted or `context.source === "ui"`: behavior identical to today (backwards-compatible)
- Internal UI path still works unchanged — existing `lib/__tests__/` tests still pass

**Test requirements:**
- Calling with `{source: "agent_api"}` and also passing `selectedNode: {...}` → selectedNode is ignored in the downstream logic (test by checking the system prompt does NOT contain selectedNode-specific content, or by mocking the downstream AI client and asserting the request passed to it)
- Calling without `context` → all existing behavior is preserved
- Both UI and agent_api modes emit the same `StreamEvent` types (the difference is inputs, not outputs)

**Risk mitigation:**
- This is the highest-risk change in Phase 2 because `generate-flow.ts` is shared with the internal UI. Use a conservative approach: add the parameter, add a single conditional at the top of the function, do not refactor anything else. Run the existing flow-assistant route in the UI manually and confirm it still works before committing.

**Pre-reading for this task:**
- Re-read `lib/ai/tools/generate-flow.ts` in full, especially lines 1-100 for the request types and lines 355+ for `generateFlowStreaming`
- Look at how `selectedNode`, `userTemplates`, `toolContext` are consumed downstream — find every reference and confirm they'll be undefined in the agent path without breaking anything

---

## Task 6: Build `event-translator.ts`

**Files:**
- Create: `magic-flow/lib/agent-api/event-translator.ts`
- Create: `magic-flow/lib/agent-api/__tests__/event-translator.test.ts`

**Acceptance criteria:**
- Exports `translateStreamEvent(internal: StreamEvent, writer: SSEWriter): { terminal: boolean }`
- Translation rules:
  - `tool_step` with `details.kind === "edit"` → `writer.progress("editing", buildEditMessage(details))` where the message summarizes counts (e.g., "Applied 3 updates, 1 addition")
  - `tool_step` with `details.kind === "validate"` and `details.valid === true` → `writer.progress("validating", `Validated ${nodeCount} nodes`)`
  - `tool_step` with `details.kind === "validate"` and `details.valid === false` → `writer.error(new AgentError("validation_failed", "AI produced an invalid flow", { errors: details.issues }))`, returns `terminal: true`
  - `text_delta` → silently dropped, returns `terminal: false`
  - `flow_ready` → `writer.progress("ready", "Flow plan ready")`
  - `result` → NOT handled here; the route handler constructs the final result payload with extra fields (flow_id, magic_flow_url, etc.) that the internal event doesn't carry. The translator emits nothing for this case and returns `terminal: true` so the route handler knows generation is done.
  - `error` → `writer.error(AgentError.fromUnknown(new Error(internal.message)))`, returns `terminal: true`

**Test requirements:**
- Each of the 5 internal event types has at least one test case
- Terminal vs non-terminal return values are asserted
- The SSEWriter passed in is spied on to verify the right method was called with the right args
- Edge case: validation failure with no `issues` array — falls back to `errors: []`

**Pre-reading for this task:**
- `lib/ai/tools/generate-flow.ts` lines 88-106 for the exact `StreamEvent` discriminated union
- `lib/ai/tools/generate-flow.ts` for the `ToolStepDetails` shape (the `edit` and `validate` variants)

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
- Plumb `req.signal` into `generateFlowStreaming`'s abortSignal parameter

**Test requirements:**
- Happy path: mock all fs-whatsapp calls, assert SSE stream contains expected progress events in order, assert final `result` event has the right fields
- Missing field → 400 with correct error code
- Channel not connected → 400 with `connected_channels` in response
- Keyword conflict → 409 with `existing_flow` in response
- Validation failure from AI → `error` event in stream + `deleteProject` called
- Post-validation failure (e.g., publishRuntimeFlow fails) → `error` event + orphan cleanup
- Client abort mid-stream: simulate by triggering `req.signal` abort, assert orphan cleanup still runs and no unhandled promise rejection

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
- Do not mock our own code (publisher.ts, event-translator.ts). Only mock `fetch` and `generateFlowStreaming`.

---

## Task 9: Error path tests — orphan cleanup + mid-stream failures

**Files:**
- Modify: `magic-flow/app/api/v1/agent/flows/__tests__/route.test.ts`

**Acceptance criteria:**
- Test 1: AI generation returns a validation_failed event → SSE stream emits `error` event, deleteProject is called with the project ID, the HTTP response still succeeds (200 status, error comes through the stream not HTTP)
- Test 2: publishRuntimeFlow throws → SSE stream emits `error` event with code `publish_failed`, deleteProject is called, stream closes cleanly
- Test 3: deleteProject itself fails during cleanup → the primary error event is still emitted, cleanup failure is logged but swallowed, stream closes
- Test 4: Client aborts the request mid-generation (simulate by triggering `req.signal` abort) → `generateFlowStreaming` sees the abort signal, no uncaught errors, orphan cleanup still runs

**Test requirements:**
- Explicit assertion on `deleteProject` call count — should be exactly 1 per failure test
- No uncaught promise rejections — wrap the test bodies in `await` properly so vitest catches any floating rejections

---

## Task 10: Manual verification against a running stack

**Prerequisites:** Docker running, fs-whatsapp up on `:8080`, magic-flow up on `:3002`, test org with a seeded `WhatsAppAccount`, ANTHROPIC_API_KEY set in magic-flow's env, a `whm_*` key for the test org.

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

**Test commands (example shapes):**

```bash
# Happy path
curl -N -X POST http://localhost:3002/api/v1/agent/flows \
  -H "X-API-Key: $FREESTAND_TEST_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "instruction": "build a simple lead capture flow that asks for name and phone",
    "channel": "whatsapp",
    "trigger_keyword": "testphase2"
  }'

# Keyword conflict (run twice)
# Second call should return 409

# Channel not connected
curl -X POST http://localhost:3002/api/v1/agent/flows \
  -H "X-API-Key: $FREESTAND_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instruction":"x","channel":"instagram","trigger_keyword":"foo"}'
```

---

## Task 11: Phase 2 wrap-up

**Acceptance criteria:**
- All unit tests pass: `npm run test`
- Full type check passes: `npx tsc --noEmit`
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
