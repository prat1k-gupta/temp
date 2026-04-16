# Flow Assistant Agent API — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan granularity note:** Task-level plan with files, acceptance criteria, and test requirements. Expand to step-level TDD form with `superpowers:writing-plans` before starting this phase.

**Goal:** Ship the edit and publish endpoints. `POST /v1/agent/flows/{flow_id}/edit` takes an edit instruction, loads the current flow state, runs the edit tool-use loop via `generateFlowStreaming` with a filtered tool set, creates a NEW unpublished version, and returns the changes as a draft (no publish). `POST /v1/agent/flows/{flow_id}/publish` is the separate step that promotes the latest version to live and deploys to the runtime, returning the `test_url`.

**Architecture:** Two new route files: `app/api/v1/agent/flows/[flow_id]/edit/route.ts` (SSE, wrapped in `withAgentAuth` on the `expensive` bucket) and `app/api/v1/agent/flows/[flow_id]/publish/route.ts` (JSON, on the `publish` bucket). Edit reuses the Phase 2 event-translator and most of the publisher helpers. Publish is a new simpler pipeline: read latest version → publish to magic-flow → publishRuntimeFlow → return test_url. Publish is idempotent: if the latest version is already live, return `already_published: true`.

**Tech Stack:** Same as Phase 1/2. New additions: `lib/agent-api/flow-loader.ts` (fetch project + latest published version), `lib/agent-api/diff.ts` (build the `changes` array for edit responses), a `toolFilter` option added to `generate-flow-edit.ts`.

**Reference spec:** `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-design.md` (especially the edit/publish endpoint sections, the "File inventory" under Internal implementation, and decision #10 for edit-is-two-step).

**Pre-reading for the implementer:**
- `magic-flow/lib/ai/tools/generate-flow-edit.ts` — the 8 internal tools (`get_node_details`, `get_node_connections`, `apply_edit`, `validate_result`, `save_as_template`, `undo_last`, `list_variables`, `trigger_flow`). Phase 3 whitelists the first 4 and excludes the other 4 for the agent path.
- `magic-flow/types/flow-plan.ts` — the `NodeUpdate`, `NodeStep`, `AddEdgeStep`, `EditFlowPlan` shapes that `apply_edit` produces. The `diff.ts` helper in this phase transforms these into our public `changes` array.
- `magic-flow/lib/ai/tools/generate-flow.ts` — the edit-mode entry (distinguishes by `existingFlow.nodes` having non-start nodes)
- `fs-whatsapp/internal/handlers/magic_flow.go:598` and `:667` — version create and publish (used via the Phase 2 publisher helpers, same functions)
- Phase 2 files to understand what already exists: `lib/agent-api/publisher.ts`, `lib/agent-api/event-translator.ts`, `app/api/v1/agent/flows/route.ts`

---

## File Structure

### New files

```
magic-flow/
├── lib/agent-api/
│   ├── flow-loader.ts                # loadFlowForEdit — fetch project + latest published version
│   ├── diff.ts                       # buildChangesArray — compact public diff from EditFlowPlan
│   └── __tests__/
│       ├── flow-loader.test.ts
│       └── diff.test.ts
├── app/api/v1/agent/flows/[flow_id]/
│   ├── edit/
│   │   ├── route.ts                  # POST (edit with SSE)
│   │   └── __tests__/
│   │       └── route.test.ts
│   └── publish/
│       ├── route.ts                  # POST (publish, JSON)
│       └── __tests__/
│           └── route.test.ts
```

### Modified files

```
magic-flow/
├── lib/ai/tools/generate-flow-edit.ts   # Add toolFilter option
```

### File responsibilities

**`flow-loader.ts`**: single export `loadFlowForEdit(ctx, flowId)` → `Promise<{project, nodes, edges, runtimeFlowId?}>`. Fetches `GET /api/magic-flow/projects/{flowId}` from fs-whatsapp (returns project + latest_version per `magic_flow.go:371`). Returns normalized shape. Throws `flow_not_found` on 404 (or when returned project belongs to a different org — which fs-whatsapp should already handle via org scoping on the key).

**`diff.ts`**: single export `buildChangesArray(editResult)` → `Array<Change>` where `Change` is a discriminated union:
- `{type: "add_node", node_id, node_type, label?}`
- `{type: "remove_node", node_id, label?}`
- `{type: "update_node", node_id, field, before, after}` — one per changed field, so updating a node's question AND its variable name yields two entries
- `{type: "add_edge", source, target}`
- `{type: "remove_edge", source, target}`

The input shape is whatever `apply_edit`'s return value looks like. Read `generate-flow-edit.ts` and `types/flow-plan.ts` to find the exact structure.

**`generate-flow-edit.ts` modification**: add an optional `toolFilter?: string[]` parameter to wherever the tool array is built (likely `setupEditTools` or similar). When provided, the returned tool array is filtered to only include tools with names in the whitelist. When omitted, all tools are returned (existing behavior). Zero impact on the internal UI path.

**Edit route handler**: `POST /v1/agent/flows/[flow_id]/edit`. Wrapped with `withAgentAuth(..., "expensive")`. Pipeline:
1. Parse body with `editFlowBodySchema`
2. `loadFlowForEdit(ctx, flow_id)` → get `{project, nodes, edges}`
3. Start SSE stream
4. Emit `progress("loading", "Loading flow '${project.name}'")`
5. `generateFlowStreaming({prompt, existingFlow: {nodes, edges}, context: {source: "agent_api"}, toolFilter: EDIT_TOOL_WHITELIST})` with translated events
6. After generation: emit `progress("validating", ...)` before calling `createVersion`
7. `createVersion` with the edited nodes/edges + `changes.source = "agent_api"`, `changes.instruction = body.instruction`
8. **Do NOT call publishVersion or publishRuntimeFlow.** This is the critical difference from create.
9. Emit terminal `result` event with shape:
   ```
   {
     flow_id, version, published: false, name, summary, changes: [...],
     node_count, magic_flow_url, next_action: "Call POST .../publish to make this version live",
     updated_at
   }
   ```
10. Close stream
11. On any error after loadFlowForEdit: emit `error`, close. No orphan cleanup needed for edit — we don't create a project, we just create a version row that's harmless if left unpublished.

**Publish route handler**: `POST /v1/agent/flows/[flow_id]/publish`. Wrapped with `withAgentAuth(..., "publish")`. JSON response (not SSE). Pipeline:
1. Parse body with `publishFlowBodySchema` (empty in v1)
2. Fetch the flow's version history: `GET /api/magic-flow/projects/{flowId}/versions` (needs a new publisher helper `listVersions`)
3. Find the highest `version_number`
4. If that version is already `is_published: true` → return `{already_published: true, ...}` with status 200
5. Otherwise: `publishVersion(ctx, flowId, versionId)` + `publishRuntimeFlow(ctx, ...)` (with `trigger_keywords` derived from the project's stored trigger)
6. Construct `test_url` from `ctx.account.phone_number` + trigger keyword
7. Return `{flow_id, version, published: true, already_published: false, published_at, test_url, trigger_keyword, magic_flow_url}`

**Publisher additions for Phase 3**:
- `listVersions(ctx, projectId)` → returns version history (array of `{id, version_number, is_published, published_at}`)
- `getProjectWithTrigger(ctx, projectId)` → returns project metadata including the stored trigger_keywords (needed for publish to reconstruct the trigger when it writes to the runtime flow)

Alternatively, if the trigger is already stored on the `MagicFlowProject` model (it should be — it's how the UI's PublishModal works today), we can fetch it as part of `loadFlowForEdit` or as its own helper.

---

## Task 1: Build `flow-loader.ts`

**Files:**
- Create: `magic-flow/lib/agent-api/flow-loader.ts`
- Create: `magic-flow/lib/agent-api/__tests__/flow-loader.test.ts`

**Acceptance criteria:**
- `loadFlowForEdit(ctx, flowId)` fetches `GET /api/magic-flow/projects/{flowId}` with forwarded `X-API-Key`
- Returns `{project: {id, name, platform, trigger_keywords}, nodes, edges, runtimeFlowId?: string}` where `nodes` and `edges` come from the project's `latest_version` field (the currently-published version)
- Throws `AgentError("flow_not_found", ...)` on 404 or when the response has no published version
- Throws `AgentError("internal_error", ...)` on other non-2xx
- Tests: happy path, 404 → flow_not_found, 500 → internal_error, empty version history → flow_not_found (or a more specific error — decide during implementation based on what fs-whatsapp returns)

**Pre-reading:**
- `fs-whatsapp/internal/handlers/magic_flow.go:371-411` — `GetMagicFlowProject` response shape, especially the `latest_version` field
- Check whether `MagicFlowProject` stores `trigger_keywords` directly or via the runtime `ChatbotFlow`. If via runtime, we may need a second fetch to get the trigger. If directly, one fetch is enough.

---

## Task 2: Build `diff.ts`

**Files:**
- Create: `magic-flow/lib/agent-api/diff.ts`
- Create: `magic-flow/lib/agent-api/__tests__/diff.test.ts`

**Acceptance criteria:**
- `buildChangesArray(editResult)` transforms the internal `EditFlowPlan` (or whatever `apply_edit` returns) into a public `Change[]` array
- Each entry is one of: `add_node`, `remove_node`, `update_node`, `add_edge`, `remove_edge`
- For `update_node`, one entry per changed field (not one entry per node), with `before` and `after` values captured
- For `add_node`, `label` is optional and populated if the node has one
- For `remove_node`, same
- Empty plan → empty array (not null/undefined)
- Tests: cover each change type in isolation, plus a compound case with multiple change types in one plan
- No dependencies on network or SSE — pure function, pure unit tests

**Pre-reading:**
- `magic-flow/types/flow-plan.ts` — the full `EditFlowPlan`, `NodeUpdate`, `NodeStep`, `AddEdgeStep`, etc. shape
- `magic-flow/lib/ai/tools/generate-flow-edit.ts` — find where `apply_edit` builds its output. The exact return shape is what we transform.

---

## Task 3: Add `toolFilter` option to `generate-flow-edit.ts`

**Files:**
- Modify: `magic-flow/lib/ai/tools/generate-flow-edit.ts`
- Modify: existing test file(s) for `generate-flow-edit` (check `magic-flow/lib/ai/tools/__tests__/` for existing tests to extend or add alongside)

**Acceptance criteria:**
- The tool-array builder function (find it by searching for where the 8 tools are instantiated — likely `setupEditTools` or inline in `executeEditModeStreaming`) accepts an optional `toolFilter: string[]`
- When `toolFilter` is provided: the returned tool list only contains tools whose name is in the array
- When `toolFilter` is omitted or `undefined`: behavior is identical to today (all 8 tools)
- Unit tests: filter with `["apply_edit", "validate_result"]` → only those 2 tools returned; no filter → all 8; empty array `[]` → no tools (edge case, should probably throw or the tool-use loop will be uninteresting)

**Risk mitigation:**
- Do not refactor the tool builder function further. Add one parameter, one conditional. The internal UI path still calls without the parameter and gets identical behavior.
- Run the existing internal flow-assistant manually after this change — the UI edit mode must still work with all 8 tools.

---

## Task 4: Extend `publisher.ts` with listVersions + getProjectWithTrigger

**Files:**
- Modify: `magic-flow/lib/agent-api/publisher.ts`
- Modify: `magic-flow/lib/agent-api/__tests__/publisher.test.ts`

**Acceptance criteria:**
- `listVersions(ctx, projectId)` → `Promise<Array<{id, version_number, is_published, published_at, nodes, edges}>>`. Calls `GET /api/magic-flow/projects/{projectId}/versions`.
- `getProjectWithTrigger(ctx, projectId)` → returns `{id, name, platform, trigger_keywords, runtime_flow_id?}`. This may end up being the same fetch as `loadFlowForEdit` — if so, merge the two and have `loadFlowForEdit` call it internally.
- Tests: happy path returns version list; 404 → flow_not_found; empty version list → returns empty array (not error)

**Pre-reading:**
- `fs-whatsapp/internal/handlers/magic_flow.go:559-595` — `ListMagicFlowVersions`

---

## Task 5: Build the edit route handler

**Files:**
- Create: `magic-flow/app/api/v1/agent/flows/[flow_id]/edit/route.ts`
- Create: `magic-flow/app/api/v1/agent/flows/[flow_id]/edit/__tests__/route.test.ts`

**Acceptance criteria:**
- `POST` handler wrapped in `withAgentAuth(..., "expensive")`
- Extracts `flow_id` from the dynamic route segment via the second argument to the handler `(req, { params })`
- Parses body with `editFlowBodySchema`, throws `invalid_instruction` on failure
- Calls `loadFlowForEdit(ctx, flow_id)` — throws `flow_not_found` if the project doesn't exist
- Opens SSE stream
- Emits `progress("loading", "Loading flow '${project.name}'")`
- Calls `generateFlowStreaming` with `existingFlow: {nodes, edges}`, `context: {source: "agent_api"}`, and a new `toolFilter: EDIT_TOOL_WHITELIST` field that we'll add to `GenerateFlowRequest` in this task
- `EDIT_TOOL_WHITELIST = ["get_node_details", "get_node_connections", "apply_edit", "validate_result"]` (constant defined in `constants.ts` or this route file)
- Pipes events through `event-translator.ts`
- After generation: `createVersion(ctx, flow_id, editedNodes, editedEdges, {source: "agent_api", instruction})`
- Does NOT call `publishVersion` or `publishRuntimeFlow`
- Emits terminal `result` event with `published: false`, `changes: [...]` from `diff.ts`, `next_action` hint string
- On error after SSE stream opens: emit `error` event, close stream. No project cleanup — the unpublished version row is harmless.

**Test requirements:**
- Happy path: full SSE stream with progress events and terminal `result` with `published: false`
- `flow_not_found` before stream opens (HTTP 404, not SSE)
- `invalid_instruction` on bad body (HTTP 400, not SSE)
- Validation failure from AI → SSE error event
- `changes` array correctly populated in the result
- No `publishVersion` or `publishRuntimeFlow` calls (assert via mock call counts = 0)

---

## Task 6: Build the publish route handler

**Files:**
- Create: `magic-flow/app/api/v1/agent/flows/[flow_id]/publish/route.ts`
- Create: `magic-flow/app/api/v1/agent/flows/[flow_id]/publish/__tests__/route.test.ts`

**Acceptance criteria:**
- `POST` handler wrapped in `withAgentAuth(..., "publish")`
- Body is empty `{}` in v1 (schema: `publishFlowBodySchema`)
- Calls `listVersions(ctx, flow_id)` to find the highest `version_number`
- If that version is already published (`is_published: true`) → return 200 with `{already_published: true, ...}` and the currently-live metadata
- Otherwise: call `publishVersion(ctx, flowId, latestVersionId)` → then `publishRuntimeFlow` with the version's nodes/edges + the project's trigger keywords
- Return 200 JSON with `{flow_id, version, published: true, already_published: false, published_at, test_url, trigger_keyword, magic_flow_url}`
- `test_url` built from `ctx.account.phone_number` + the trigger keyword. Omitted when phone number is empty.
- On any error during publish → `publish_failed` or `internal_error` as appropriate

**Test requirements:**
- Happy path: latest version is unpublished, publish succeeds, response has `published: true`
- Idempotent path: latest version is already live, response has `already_published: true`, no publishVersion or publishRuntimeFlow calls made
- `flow_not_found` when the flowId doesn't exist (listVersions returns 404)
- `publish_failed` when `publishRuntimeFlow` throws
- Retry safety: two back-to-back calls on the same already-live flow both return `already_published: true` with no side effects

---

## Task 7: Idempotency + retry test

**Files:**
- Modify: `magic-flow/app/api/v1/agent/flows/[flow_id]/publish/__tests__/route.test.ts`

**Acceptance criteria:**
- A dedicated test that simulates the retry scenario: first call succeeds and publishes v5; second call finds v5 already live and returns `already_published: true` without calling any downstream mutations.
- Another test: first call fails at `publishRuntimeFlow` (simulated network error); the magic-flow version_number is already promoted (from `publishVersion`), so on retry we should detect the state mismatch and just re-run `publishRuntimeFlow` from scratch — assert the second call succeeds.

**Note for implementation:** The state detection here is subtle. If `publishVersion` succeeded but `publishRuntimeFlow` failed, the latest version in magic-flow IS published (from fs-whatsapp's perspective) but the runtime ChatbotFlow has stale content. On retry, our publish endpoint sees "latest version is is_published=true" and returns `already_published: true` without re-pushing the runtime. This is a real bug — we need to also check that the runtime ChatbotFlow's `updated_at` is newer than the version's `published_at`, OR we compare the runtime flow's nodes against the version's nodes, OR we add a separate "runtime dirty" flag somewhere.

For v1 the simplest fix: on publish, ALWAYS call `publishRuntimeFlow` even if `already_published: true`. This makes the endpoint idempotent at the runtime layer — two back-to-back publishes both end up with identical runtime state, at the cost of one redundant fs-whatsapp PUT per retry. Update the "idempotent path" test to reflect this choice.

---

## Task 8: Manual verification

**Prerequisites:** Phases 1 and 2 already verified and working. Test org with a WhatsApp account and at least one flow already created via Phase 2's create endpoint.

**Acceptance criteria:**
- Edit a flow: curl the edit endpoint with a small change ("make the welcome message friendlier"). Observe SSE stream, terminal `result` has `published: false` and a `changes` array with at least one entry. Navigate to `magic_flow_url` — see the draft version in version history, BUT the currently-live version is still the old one.
- Publish the edit: curl the publish endpoint. Observe 200 JSON with `published: true`, `test_url`. Navigate to `magic_flow_url` — the new version is now the published one. Send the trigger keyword to the test account via WhatsApp — verify the updated flow fires.
- Retry publish on the same flow without edits → observe `already_published: true`.
- Edit a non-existent flow → observe 404 `flow_not_found`.
- Edit with an invalid instruction → observe 400 `invalid_instruction`.
- Trigger a rate limit: 11 edits in a minute → observe 429 on the 11th.

**Test commands:**

```bash
# Edit
curl -N -X POST http://localhost:3002/api/v1/agent/flows/mf_REAL_ID/edit \
  -H "X-API-Key: $FREESTAND_TEST_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"instruction": "make the welcome message friendlier"}'

# Publish
curl -X POST http://localhost:3002/api/v1/agent/flows/mf_REAL_ID/publish \
  -H "X-API-Key: $FREESTAND_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Retry (expect already_published: true)
curl -X POST http://localhost:3002/api/v1/agent/flows/mf_REAL_ID/publish \
  -H "X-API-Key: $FREESTAND_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Task 9: Phase 3 wrap-up

**Acceptance criteria:**
- All unit tests pass: `npm run test`
- Full type check: `npx tsc --noEmit`
- No regressions on Phase 1 (`GET /v1/agent/flows`) or Phase 2 (`POST /v1/agent/flows`)
- No regressions on internal `/api/ai/flow-assistant` UI path
- Manual E2E: edit → publish → live changes verified
- Branch: `feat/flow-assistant-agent-api-phase-3`
- PR created, not merged

---

## Phase 3 Definition of Done

- [ ] `lib/agent-api/flow-loader.ts` exists and tested
- [ ] `lib/agent-api/diff.ts` exists and tested
- [ ] `lib/agent-api/publisher.ts` has new functions: `listVersions`, `getProjectWithTrigger`
- [ ] `lib/ai/tools/generate-flow-edit.ts` has `toolFilter` option; internal path unchanged
- [ ] `app/api/v1/agent/flows/[flow_id]/edit/route.ts` exists with SSE streaming
- [ ] `app/api/v1/agent/flows/[flow_id]/publish/route.ts` exists with JSON response
- [ ] All unit tests + integration tests pass
- [ ] Manual E2E: edit creates a draft, publish promotes it, retry returns already_published
- [ ] No regressions anywhere
- [ ] PR on `feat/flow-assistant-agent-api-phase-3`, not merged

## What Phase 3 deliberately does NOT do

- No customer-facing docs (Phase 4)
- No OpenAPI spec (Phase 4)
- No rollback feature (publish always goes forward, never backward)
- No draft mode preview endpoint (you can read the draft via the UI at `magic_flow_url`)
- No handling for the "human edits in UI while agent edits via API" race — accepted in v1 per spec edge case #1
- No runtime-dirty detection — we always re-push runtime on publish for idempotency
