# Agent API Decoupling — REST for Templates & Broadcasts

**For:** the engineer(s) implementing the Agent API decoupling work.
**Status:** design spec. Each phase below should get its own task-by-task implementation plan under `docs/superpowers/plans/` before execution.
**Prerequisite:** Phase 1-3 of the original Agent API merged (magic-flow #78, fs-chat #34). Branch `main`.
**Repos touched:** `magic-flow` (Next.js builder) and `fs-whatsapp` (Go runtime).

---

## TL;DR

Today's public Agent API has 4 endpoints, all flow-centric. Templates and broadcasts are only reachable by pushing the external caller through `/v1/agent/flows/{id}/edit` and hoping the LLM picks the right tool. This spec:

1. **Fixes an overly strict prompt rule** that rejects valid `apiFetch → template` flows. (Phase 0)
2. **Adds deterministic REST CRUD** for flows / templates / campaigns so external callers don't need an LLM for structured operations. (Phase 2)
3. **Trims the external agent's tool set** without regressing the internal AI chat. (Phase 3)
4. **Moves a few guardrails from prompt-land to server-land** so they apply to every caller uniformly. (Phase 1)
5. **Renames `magic_flow_url` → `platform_url`** and adds `platform_url` to every template and campaign response so external UIs can deep-link to the Freestand app. (Phase 2)

Estimated effort: ~2 engineer-weeks total across all phases.

---

## Why this exists

Three problems with the current surface:

1. **Flow-scoped entry point.** Every agent call requires a `flow_id` and runs the flow-editor mode. An external party wanting to "create a broadcast" must POST to a flow edit endpoint with a `flow_id` they don't care about.
2. **Monolithic 21-tool edit bundle.** Flow manipulation, publishing, broadcasts, templates, and campaigns all live in one registration block in `lib/ai/tools/generate-flow-edit.ts:472-1526`. External callers get tools they don't need; internal callers need them all.
3. **Prompt-only guardrails.** Rules like "preview audience before creating a campaign" and "check template status" only exist in `lib/ai/tools/flow-prompts.ts`. They apply to the LLM but not to direct REST callers. Once we expose REST endpoints, these need to be enforced server-side.

Net effect today: an external party integrating with Freestand has to either accept the LLM-only NL interface (slow, expensive, nondeterministic) or build around us. This spec gives them deterministic REST for structured operations while preserving the NL agent where it genuinely helps.

---

## Current state (baseline)

### Public endpoints today (all under `/api/v1/agent/`)

| Method | Path | Auth | Rate limit | Returns |
|---|---|---|---|---|
| GET | `/api/v1/agent/flows` | X-API-Key | cheap (120/min) | JSON — paged list |
| POST | `/api/v1/agent/flows` | X-API-Key | expensive (10/min) | SSE — create + auto-publish |
| POST | `/api/v1/agent/flows/{id}/edit` | X-API-Key | expensive (10/min) | SSE — edit, optional publish via tool |
| POST | `/api/v1/agent/flows/{id}/publish` | X-API-Key | publish (30/min) | JSON — publish or already_published |

Source: `magic-flow/app/api/v1/agent/flows/*`. Auth: `lib/agent-api/auth.ts:21-58`.

### Two agents, shared core

Both the internal chat (`/api/ai/flow-assistant`) and the public API call `generateFlowStreaming()` in `lib/ai/tools/generate-flow.ts:320-348`. Mode switch:

- **CREATE mode** — 2 tools (`list_templates`, `build_and_validate`). Used when canvas is empty and prompt doesn't mention broadcast.
- **EDIT mode** — 21 tools. Used for existing flows or broadcast prompts.

### The 21 EDIT-mode tools by category (today)

| Category | Count | Tools |
|---|---|---|
| Flow introspection | 3 | `get_node_details`, `get_node_connections`, `list_variables` |
| Flow mutation | 3 | `apply_edit`, `validate_result`, `undo_last` |
| Flow lifecycle | 3 | `publish_flow`, `save_as_template`, `trigger_flow` |
| Lookups | 3 | `list_flows`, `list_accounts`, `list_templates` |
| Broadcast/Campaign CRUD | 7 | `create_campaign`, `start_campaign`, `pause_campaign`, `cancel_campaign`, `reschedule_campaign`, `list_campaigns`, `get_campaign_status` |
| Broadcast helpers | 2 | `preview_audience`, `get_flow_variables` |

Defined at `magic-flow/lib/ai/tools/generate-flow-edit.ts:472-1526`.

### Backend template-status check (already correct)

`fs-whatsapp/internal/handlers/campaigns.go:521-591` — `checkBroadcastTemplateStatus`:

- Walks flow's `chatbot_flow_steps WHERE message_type = 'template'`.
- For each templateMessage node, checks template is APPROVED in the local catalog.
- **Does NOT check position** — apiFetch → template is fine.
- **Does NOT check existence** — action-only flows are fine.
- Immediate send + non-APPROVED template → 409 hard error.
- Scheduled send + non-APPROVED template → warning in `warnings[]`, campaign still created.

This is the correct shape. The prompt is stricter than the backend, which is the bug Phase 0 fixes.

---

## Scope

### In scope

1. **Phase 0** — Prompt fix: relax the "template-first" rule to walk past server-side nodes.
2. **Phase 1** — Server-side guardrails in fs-whatsapp: `materializing → start` gate, `first_message_not_template` advisory warning.
3. **Phase 2** — New REST endpoints for flows/templates/campaigns/accounts in magic-flow, proxying to fs-whatsapp. Standardize on `platform_url` (rename `magic_flow_url`).
4. **Phase 3** — Split EDIT-mode tool availability by caller source (`internal` vs `external_api`). Gate the 11 broadcast/lookup tools on `internal` only.
5. **Phase 4** — UI updates: surface new warnings and error codes in the campaign creation flow.
6. **Phase 5** — Docs: REST reference, warnings, error codes, `platform_url` convention.

### Out of scope

- MCP server wrapping the new REST endpoints. Separate project.
- SDK (TypeScript / Python / Go clients). Callers generate from OpenAPI spec (already shipped in Phase 4 of original Agent API).
- Per-resource agent endpoints (`/v1/agent/broadcasts`, `/v1/agent/templates`). REST is enough for structured CRUD; don't add LLM endpoints until we see a concrete NL use case.
- Removing existing `/v1/agent/*` endpoints. They provide real NL value and stay.
- `audience_preview_token` signed-blob gating. Overkill for v1.
- Duplicate-campaign 409 check. An org may legitimately broadcast the same flow to different audiences.
- `expected_recipient_count` sanity check on `start_campaign`. Adds friction without blocking real footguns.
- `retry_after_seconds` hint on `campaign_materializing` 409. Arbitrary; caller polls at own cadence.
- Exposing flow graph-diff tools (`apply_edit` etc.) as REST. Terrible API shape for external callers.

---

## Conventions (apply to every phase)

### `platform_url` on every resource response

Every response body for a flow, template, or campaign — create, get, list item, update, action — includes a `platform_url` field pointing at the Freestand UI for that resource.

```json
{ "platform_url": "https://app.freestand.xyz/flows/f_01H..." }
{ "platform_url": "https://app.freestand.xyz/templates/tpl_01H..." }
{ "platform_url": "https://app.freestand.xyz/broadcasts/cmp_01H..." }
```

- **Rename:** the existing `magic_flow_url` field on flow responses becomes `platform_url`. During one release, emit **both** fields so existing callers don't break; then drop `magic_flow_url` in the next release. Track the removal with a TODO in the code.
- **Source:** derive from a new `PLATFORM_BASE_URL` config value in fs-whatsapp (e.g., `https://app.freestand.xyz`). magic-flow reads it via its existing fs-whatsapp proxy.

### Error message style

User-facing `message` fields describe **state and cause**, not implementation detail.

- ❌ `"Poll GET /v1/campaigns/{id} until status leaves materializing"`
- ✅ `"Campaign recipients are still being fetched. Wait until the campaign leaves the materializing status before starting it."`
- ❌ `"Meta rejects every send for non-APPROVED templates (error 132001)"`
- ✅ `"Non-approved templates cannot be sent to cold recipients; the send will fail."`

Applies to: error envelopes, SSE error events, `warnings[]` strings. Internal logs can still reference URLs and vendor codes for debugging.

### Rate-limit buckets

All new endpoints share the existing auth wrapper (`lib/agent-api/auth.ts:21-58`). Buckets:

| Bucket | Limit | Used by |
|---|---|---|
| `cheap` | 120/min | All GETs on new REST endpoints |
| `write` | 60/min | POST/PUT/DELETE on templates and campaigns (new) |
| `publish` | 30/min | Flow publish, campaign start/pause/cancel, template submit |
| `expensive` | 10/min | Existing `/v1/agent/*` SSE endpoints — unchanged |

Add the `write` bucket to `magic-flow/lib/agent-api/constants.ts` rate-limit config.

---

## Phase 0 — Prompt fix: walk past action nodes

**Goal:** Stop the AI from rejecting valid flows where the first node is `apiFetch`, `action`, or another server-side type, and the template comes after.

### Current rule (the bug)

`magic-flow/lib/ai/tools/flow-prompts.ts:61-66`:

> any flow intended for broadcast MUST start (the node immediately after Start) with a `templateMessage` node ... Do NOT create a campaign for a flow that starts with a plain `whatsappMessage` node.

This rejects `start → apiFetch → templateMessage` (valid: apiFetch runs server-side, template is the first *user-facing* message) and action-only flows.

### New rule

Replace lines 61-66 with the walk-based rule. Full replacement text:

```markdown
**Template-first rule for broadcasts.** WhatsApp only permits initiating messages outside the 24-hour session window via approved templates. Walk the flow from Start and find the first **user-facing message node** — skip these server-side types: `apiFetch`, `action`, `transfer`, `condition`, `flowComplete`, `shopify`, `stripe`, `zapier`, `google`, `salesforce`, `mailchimp`, `twilio`, `slack`, `airtable`, `metaAudience`.

User-facing node types are: `templateMessage`, `whatsappMessage`, `instagramDM`, `instagramStory`, `question`, `quickReply`, `interactiveList`, `whatsappFlow`, `name`, `email`, `dob`, `address`, `homeDelivery`, `trackingNotification`, `event`, `retailStore`.

- **First user-facing = `templateMessage`** → proceed normally.
- **First user-facing = any other type** → warn the user: "The first user-facing message in this flow isn't a template. Meta rejects non-template first messages to cold recipients, so this broadcast will only work for warm 24-hour-window recipients. Add a templateMessage at the top or confirm you want to proceed."
- **No user-facing messages at all** (pure action/integration flow) → proceed. It's a data-pipeline broadcast.

The backend enforces only template-APPROVED-status on existing `templateMessage` nodes. It does NOT check position or existence, so don't refuse campaigns it would accept.
```

### Files

- Modify: `magic-flow/lib/ai/tools/flow-prompts.ts:61-66`

### Acceptance criteria

- [ ] Prompt no longer says "node immediately after Start".
- [ ] Skip list matches the 15 server-side types above exactly.
- [ ] Manual test: create a flow `start → apiFetch → templateMessage` and ask AI to broadcast it. AI proceeds without nagging about node position.
- [ ] Manual test: create a flow `start → apiFetch → action` (no messages). AI proceeds without error.
- [ ] Manual test: create a flow `start → whatsappMessage`. AI warns but allows proceed on explicit user confirmation.
- [ ] `magic-flow/lib/ai/tools/__tests__/generate-flow.test.ts` covers each of the three cases above.

### Risk

Very low. Prompt-only change. Reversible. No dependency on Phase 1+.

---

## Phase 1 — Server-side guardrails (fs-whatsapp)

**Goal:** Move guardrails that today live only in the LLM prompt into the Go backend, so they apply uniformly whether the caller is the external API, the internal chat agent, or the Freestand UI.

### 1.1 `materializing → start` gate

**File:** `fs-whatsapp/internal/handlers/campaigns.go` — `StartCampaign` handler.

**Behavior:**

- Fetch the campaign. If `status == "materializing"` → return 409 with:

```json
{
  "code": "campaign_materializing",
  "message": "Campaign recipients are still being fetched. Wait until the campaign leaves the materializing status before starting it."
}
```

- No `retry_after_seconds` field.
- Existing valid starting states (`draft`, `scheduled`) continue to work.

**Test file:** `fs-whatsapp/internal/handlers/campaigns_start_test.go` (new if missing, add to existing if present).

**Test cases:**

- Starting a `materializing` campaign → 409 `campaign_materializing`.
- Starting a `draft` campaign → 200.
- Starting a `scheduled` campaign where `scheduled_at` is now → 200.

### 1.2 `first_message_not_template` advisory warning

**File:** `fs-whatsapp/internal/handlers/campaigns.go` — `CreateCampaign` handler (and whichever function assembles the response).

**Behavior:**

1. After the existing `checkBroadcastTemplateStatus` call (line 521-591) passes or returns a warning, run a new helper `checkFirstUserFacingMessageIsTemplate(flowID)`.
2. The helper:
   - Loads all `chatbot_flow_steps` for the flow ordered by `step_order` ascending.
   - Skips step types in the server-side list: `api_fetch`, `action`, `transfer`, `condition`, `flow_complete`, and all integration step types (`shopify`, `stripe`, etc. — map the step-type constants in `internal/models/constants.go`).
   - Returns the first step whose type is NOT in the skip list (or `nil` if none).
3. If the first user-facing step's `message_type` ≠ `template` → append to response `warnings[]`:

```json
{
  "warnings": [
    {
      "code": "first_message_not_template",
      "message": "The first user-facing message in this flow isn't a template. Meta rejects non-template first messages to cold recipients. This broadcast will only work for warm 24-hour-window recipients."
    }
  ]
}
```

4. If no user-facing steps at all → do NOT emit the warning. Pure action flows are fine.
5. **Non-blocking.** Don't return an error. Caller may proceed.

**Changes to response shape:**

Response from `CreateCampaign` gains `warnings: []{code, message}` (array, may be empty). If the existing template-status warning (campaigns.go:587) is already a plain string, promote it to this structured shape too for consistency:

```json
{
  "warnings": [
    {
      "code": "template_pending_approval",
      "message": "...",
      "template_name": "order_confirm"
    },
    {
      "code": "first_message_not_template",
      "message": "..."
    }
  ]
}
```

If that's a breaking change for the existing internal UI, emit both the old scalar `warning` field AND the new `warnings[]` array for one release; then drop `warning`. Follow the same double-emit pattern as `magic_flow_url` → `platform_url`.

**Test file:** `fs-whatsapp/internal/handlers/campaigns_first_message_test.go` (new).

**Test cases:**

- `start → templateMessage(approved)` → no warning.
- `start → apiFetch → templateMessage(approved)` → no warning (apiFetch skipped).
- `start → whatsappMessage` → `first_message_not_template` warning.
- `start → apiFetch → whatsappMessage` → `first_message_not_template` warning.
- `start → apiFetch → action → transfer` (no user-facing messages) → no warning.
- `start → condition → templateMessage(pending)` + scheduled for 2 days out → two warnings: `first_message_not_template` and `template_pending_approval`.

### 1.3 Drop ideas we decided against

These were considered and rejected. Listed here so the engineer doesn't re-propose them:

- ❌ **Duplicate-campaign 409.** An org may legitimately broadcast the same flow to different audiences.
- ❌ **`expected_recipient_count` sanity check on `StartCampaign`.** Adds friction; caller can pre-check with `GetCampaign` if they care.
- ❌ **`retry_after_seconds` in `campaign_materializing` error.** Arbitrary number; caller polls at own cadence.
- ❌ **Hard-fail `broadcast_requires_template`.** Breaks action-only flows and `apiFetch → template`. Warning is the right signal.

### Files

- Modify: `fs-whatsapp/internal/handlers/campaigns.go` (new handler logic + helper)
- Create: `fs-whatsapp/internal/handlers/campaigns_start_test.go`
- Create: `fs-whatsapp/internal/handlers/campaigns_first_message_test.go`
- Maybe modify: `fs-whatsapp/internal/models/constants.go` (if new step-type constants are needed for the skip list; usually not)

### Acceptance criteria

- [ ] `POST /api/campaigns/{id}/start` with `status == materializing` returns 409 `campaign_materializing` with the prescribed message.
- [ ] `POST /api/campaigns` returns `warnings[]` array in response body. Includes `first_message_not_template` when applicable.
- [ ] `warnings[]` entries are structured `{code, message, ...extras}`, not bare strings.
- [ ] Action-only flows (no user-facing message nodes) do NOT emit `first_message_not_template`.
- [ ] `make lint && make test` pass.
- [ ] New test file runs green.

### Risk

Low. Non-blocking warning + gate on an already-transient state. No changes to existing 200/409 paths except adding fields.

---

## Phase 2 — New REST endpoints in magic-flow

**Goal:** Add deterministic REST CRUD for flows / templates / campaigns / accounts. Proxy to fs-whatsapp. Same auth and rate-limit machinery as existing `/v1/agent/*`.

### Endpoint inventory

All under `/api/v1/*`, `X-API-Key: whm_*` auth via `withAgentAuth` wrapper.

#### Flows

| Method | Path | Bucket | Notes |
|---|---|---|---|
| GET | `/api/v1/flows` | cheap | Alias of existing `/api/v1/agent/flows` list |
| GET | `/api/v1/flows/{id}` | cheap | New |
| DELETE | `/api/v1/flows/{id}` | write | New |
| POST | `/api/v1/flows/{id}/publish` | publish | Alias of existing `/api/v1/agent/flows/{id}/publish` |
| POST | `/api/v1/flows/{id}/trigger` | write | New — body `{"phone": "+15551234567"}` |
| GET | `/api/v1/flows/{id}/variables` | cheap | New |

#### Templates

| Method | Path | Bucket | Notes |
|---|---|---|---|
| GET | `/api/v1/templates` | cheap | Query `?status=APPROVED\|PENDING\|DRAFT\|REJECTED` |
| POST | `/api/v1/templates` | write | |
| GET | `/api/v1/templates/{id}` | cheap | |
| PUT | `/api/v1/templates/{id}` | write | |
| DELETE | `/api/v1/templates/{id}` | write | |
| POST | `/api/v1/templates/{id}/submit` | publish | Submit to Meta for approval |
| POST | `/api/v1/templates/sync` | write | Force re-fetch from Meta |

#### Campaigns

| Method | Path | Bucket | Notes |
|---|---|---|---|
| GET | `/api/v1/campaigns` | cheap | Query `?status=...` |
| POST | `/api/v1/campaigns` | write | Returns `warnings[]` (Phase 1.2) |
| GET | `/api/v1/campaigns/{id}` | cheap | |
| PUT | `/api/v1/campaigns/{id}` | write | Reschedule |
| DELETE | `/api/v1/campaigns/{id}` | write | Cancel |
| POST | `/api/v1/campaigns/{id}/start` | publish | 409 if materializing (Phase 1.1) |
| POST | `/api/v1/campaigns/{id}/pause` | publish | |
| POST | `/api/v1/campaigns/{id}/cancel` | publish | |
| POST | `/api/v1/campaigns/preview-audience` | write | |

#### Accounts

| Method | Path | Bucket | Notes |
|---|---|---|---|
| GET | `/api/v1/accounts` | cheap | Lists connected WhatsApp accounts |

#### Unchanged (existing NL agent)

```
POST /api/v1/agent/flows              # NL create, streamed
POST /api/v1/agent/flows/{id}/edit    # NL edit, streamed
```

### Implementation approach

Each new REST endpoint is a Next.js route under `magic-flow/app/api/v1/` that:

1. Wraps handler in `withAgentAuth`.
2. Validates request body/query with a Zod schema in `magic-flow/lib/agent-api/schemas.ts`.
3. Calls fs-whatsapp via the existing `apiClient` pattern, forwarding the caller's `whm_*` key.
4. Transforms the fs-whatsapp response into the public REST shape (add `platform_url`, normalize field names).
5. Returns JSON.

No new business logic lives in magic-flow. It's a thin typed proxy.

### `platform_url` implementation

- **fs-whatsapp side:** add a new config field `PlatformBaseURL` in `internal/config/`. Every handler that returns a flow, template, or campaign resource populates `platform_url` from `PlatformBaseURL + "/flows/" + id` (and respective paths for templates/campaigns).
- **magic-flow side:** existing flow endpoints currently return `magic_flow_url`. In the response transformer, emit BOTH `magic_flow_url` AND `platform_url` (same value) for one release. Document the deprecation in `docs/agent-api/changelog.md`. Next release drops `magic_flow_url`.

### Files

**magic-flow** — new routes:
- `app/api/v1/flows/route.ts` (GET list — alias / redirect to existing)
- `app/api/v1/flows/[flow_id]/route.ts` (GET single, DELETE)
- `app/api/v1/flows/[flow_id]/publish/route.ts` (alias — redirect or duplicate thin wrapper)
- `app/api/v1/flows/[flow_id]/trigger/route.ts`
- `app/api/v1/flows/[flow_id]/variables/route.ts`
- `app/api/v1/templates/route.ts` (GET list, POST create)
- `app/api/v1/templates/[template_id]/route.ts` (GET, PUT, DELETE)
- `app/api/v1/templates/[template_id]/submit/route.ts`
- `app/api/v1/templates/sync/route.ts`
- `app/api/v1/campaigns/route.ts` (GET list, POST create)
- `app/api/v1/campaigns/[campaign_id]/route.ts` (GET, PUT, DELETE)
- `app/api/v1/campaigns/[campaign_id]/start/route.ts`
- `app/api/v1/campaigns/[campaign_id]/pause/route.ts`
- `app/api/v1/campaigns/[campaign_id]/cancel/route.ts`
- `app/api/v1/campaigns/preview-audience/route.ts`
- `app/api/v1/accounts/route.ts`

**magic-flow** — modify:
- `lib/agent-api/schemas.ts` — add Zod schemas for all new request bodies and query params.
- `lib/agent-api/constants.ts` — add `write` rate-limit bucket.
- `lib/agent-api/auth.ts` — wire `write` bucket into `withAgentAuth` selector.
- `lib/agent-api/publisher.ts` — rename `magic_flow_url` emitter to emit both fields.
- `lib/agent-api/errors.ts` — add `campaign_materializing` error code to the union.

**fs-whatsapp** — modify:
- `internal/config/` — add `PlatformBaseURL` config field.
- Campaign, template, flow handlers — populate `platform_url` on all responses.

**Tests**:
- `magic-flow/app/api/v1/templates/__tests__/*.test.ts` — at least one happy-path + one auth-fail test per endpoint group.
- `magic-flow/app/api/v1/campaigns/__tests__/*.test.ts` — covers `warnings[]` surfacing from fs-whatsapp.
- `magic-flow/app/api/v1/campaigns/[campaign_id]/start/__tests__/route.test.ts` — covers `campaign_materializing` 409 passthrough.

### Acceptance criteria

- [ ] All 21 new endpoints return 401 without `X-API-Key`.
- [ ] All list endpoints respect rate limits (GET on cheap, write-ish on write).
- [ ] Every response for flows, templates, campaigns contains `platform_url`.
- [ ] Flow responses ALSO contain deprecated `magic_flow_url` (same value) for one release.
- [ ] `POST /api/v1/campaigns` response has `warnings[]` array when applicable.
- [ ] `POST /api/v1/campaigns/{id}/start` returns 409 `campaign_materializing` with state-based message.
- [ ] `npx tsc --noEmit && npx vitest run` pass.
- [ ] fs-whatsapp `make lint && make test` pass.

### Risk

Medium. Twenty-one new route handlers is a lot of surface. Mitigation:

- All handlers are thin proxies — no new business logic. Bugs are mostly about request/response shape.
- Rely heavily on the existing `withAgentAuth` / rate-limit machinery; don't reinvent.
- Write one endpoint end-to-end first (suggest: `GET /v1/accounts` since it's simplest), get the pattern reviewed, then fan out.

### 2.a — External integration one-pager (ships in same PR as Phase 2)

**Goal:** the external party can integrate from a single short doc without waiting for Phase 5's full docs pass.

**Deliverable:** a single Markdown file at `magic-flow/docs/agent-api/integration-rest.md` covering:

1. **Auth** — `X-API-Key: whm_*` header; how to obtain a key.
2. **Endpoint table** — all 21 new endpoints with method, path, one-line purpose, rate-limit bucket.
3. **Happy-path curl walkthrough** — `GET /v1/accounts` → `GET /v1/templates?status=APPROVED` → `POST /v1/campaigns/preview-audience` → `POST /v1/campaigns` → `POST /v1/campaigns/{id}/start`. Every request shown with sample response body.
4. **`warnings[]` reference** — the 2 codes external callers will see (`first_message_not_template`, `template_pending_approval`), what they mean, what to do.
5. **Error codes** — the 4 they'll hit often (`unauthorized`, `rate_limited`, `campaign_materializing`, `template_not_approved_for_immediate_send`). Full `campaign_materializing` polling pattern with curl example.
6. **`platform_url` note** — every response includes it; use it to deep-link users to the Freestand app when your UI can't show everything (live campaign progress, Meta approval status, rejection reasons).
7. **Status lifecycle diagrams** — template (`DRAFT → PENDING → APPROVED|REJECTED`) and campaign (`draft → materializing → scheduled|queued → processing → completed`). ASCII diagrams are fine.

**Length target:** 400-700 lines. One page in a browser tab, scroll-readable.

**Update:** `magic-flow/docs/agent-api/README.md` table of contents adds a "REST integration (external parties)" row linking to it. Phase 5's larger docs pass supersedes this file later — this is the tide-over so the external party isn't blocked on Phase 5.

**Files:**
- Create: `magic-flow/docs/agent-api/integration-rest.md`
- Modify: `magic-flow/docs/agent-api/README.md`

**Acceptance criteria:**
- [ ] External party can authenticate, preview an audience, create a campaign, and start it using only `integration-rest.md` as reference.
- [ ] Every curl example in the doc has been run against a real staging instance and the responses pasted verbatim.
- [ ] All warning and error codes documented match what Phase 1 actually emits.

---

## Phase 3 — Tool split by caller source

**Goal:** External API's EDIT mode drops the 11 broadcast/lookup tools (those are now REST). Internal chat keeps all 21.

### Change

Add `source` to `ToolContext`:

```ts
interface ToolContext {
  // existing fields
  source: "internal" | "external_api"
}
```

Set at entry points:

- `magic-flow/app/api/ai/flow-assistant/route.ts:74-89` — add `source: "internal"` to the `toolContext` object.
- `magic-flow/app/api/v1/agent/flows/route.ts` (create) — add `source: "external_api"` to the toolContext built before calling `generateFlowStreaming`.
- `magic-flow/app/api/v1/agent/flows/[flow_id]/edit/route.ts` — same, `source: "external_api"`.

In `magic-flow/lib/ai/tools/generate-flow-edit.ts` — the tool registration block (lines 472-1526) wraps each of the following 11 tool definitions in `if (ctx.source === "internal")` guards:

`list_flows`, `list_accounts`, `get_flow_variables`, `preview_audience`, `create_campaign`, `start_campaign`, `get_campaign_status`, `list_campaigns`, `pause_campaign`, `cancel_campaign`, `reschedule_campaign`

Tools always registered (10, for both callers):

`get_node_details`, `get_node_connections`, `apply_edit`, `validate_result`, `save_as_template`, `undo_last`, `list_variables`, `publish_flow`, `trigger_flow`, `list_templates`

### Prompt split

In `magic-flow/lib/ai/tools/flow-prompts.ts:42-85`, wrap the entire `Broadcasting:` section and the `Broadcast + template-status check` section in `source === "internal"` conditional rendering. For external callers, the system prompt becomes flow-editing-only — shorter, faster, cheaper.

Keep the `Template-first rule for broadcasts` (Phase 0 updated version) OUT of the external agent prompt too, because external callers can't create campaigns through the agent anyway.

### Files

- Modify: `magic-flow/lib/ai/tools/generate-flow-edit.ts:472-1526` (gate 11 tools)
- Modify: `magic-flow/lib/ai/tools/flow-prompts.ts:42-85` (gate broadcast sections)
- Modify: `magic-flow/app/api/ai/flow-assistant/route.ts:74-89` (set source)
- Modify: `magic-flow/app/api/v1/agent/flows/route.ts` (set source)
- Modify: `magic-flow/app/api/v1/agent/flows/[flow_id]/edit/route.ts` (set source)
- Modify: `magic-flow/lib/ai/core/ai-context.ts` or equivalent — add `source` to the `ToolContext` type definition.

### Tests

- `magic-flow/lib/ai/tools/__tests__/generate-flow.test.ts` — add two tests:
  - With `source: "external_api"`, the tool set does not include any of the 11 gated names.
  - With `source: "internal"`, the tool set includes all 21.
- `magic-flow/app/api/v1/agent/flows/[flow_id]/__tests__/edit-publish.test.ts` — assert response doesn't surface any broadcast tool calls.

### Acceptance criteria

- [ ] External API EDIT calls can no longer invoke broadcast/campaign tools. AI responses confirm no `create_campaign` / etc. appear in SSE stream.
- [ ] Internal AI chat retains all 21 tools and full broadcasting prompt.
- [ ] Prompt token count for external EDIT calls visibly smaller (observable via log of prompt size).
- [ ] Tests pass.

### Risk

Low. Strictly additive `source` flag + conditional tool registration. No existing behavior changes for internal callers.

---

## Phase 4 — UI updates

**Goal:** Handle new warning and error shapes from fs-whatsapp in the Freestand UI campaign flow.

### What UI changes

Once Phase 1 ships, the UI (which hits fs-whatsapp directly, not through the magic-flow REST proxy) will start receiving:

1. `POST /api/campaigns` response with `warnings[]` array (Phase 1.2).
2. `POST /api/campaigns/{id}/start` returning 409 `campaign_materializing` (Phase 1.1).
3. Existing 409 `template_not_approved_for_immediate_send` — already handled; verify copy matches the Phase 1 structured shape.

### Changes

**Campaign creation modal:**

- Read `warnings[]` from the create response.
- Render each warning as a yellow banner above the "confirm campaign" summary.
  - `first_message_not_template` — show the message, include a "Continue anyway" button.
  - `template_pending_approval` — show the message, include a "View template" link pointing at the template's `platform_url`.
- Warnings are informational; create still succeeds.

**Campaign start button:**

- If `POST /api/campaigns/{id}/start` returns 409 `campaign_materializing`:
  - Show a loading state with message "Audience still being fetched…"
  - Poll `GET /api/campaigns/{id}` every 3s; re-enable start button when status leaves `materializing`.

**Files to audit:**

- `magic-flow/components/broadcast/new-broadcast-modal.tsx` (or wherever campaign creation modal lives — verify path)
- `magic-flow/hooks/queries/` — find `useCreateCampaign` and `useStartCampaign` mutations; wire new error handling.
- Same changes apply in `fs-whatsapp/frontend/src/views/campaigns/` (Vue.js UI) — mirror the error handling there.

### Internal AI chat

No changes needed. The internal agent's prompt (Phase 3) still tells it about broadcast rules, and the runtime errors flow back as tool results. AI self-corrects.

### Acceptance criteria

- [ ] Campaign creation UI renders `warnings[]` above confirm step.
- [ ] `first_message_not_template` shows with a "Continue anyway" button.
- [ ] `template_pending_approval` shows with a link to the template's `platform_url`.
- [ ] Start button on a materializing campaign shows loading state and polls until ready.
- [ ] Manual QA: create broadcast with no template in flow → see warning, proceed, campaign created as draft.
- [ ] Manual QA: materialize a freestand-claimant campaign, hit start immediately → loading state, eventually unblocks.

### Risk

Low. UI-only changes on top of new backend behavior. Reversible.

---

## Phase 5 — Docs

**Goal:** External parties can integrate the REST surface from docs alone.

### Structure

`magic-flow/docs/agent-api/`:

- **README.md** — update endpoint table; link new pages.
- **reference.md** — add REST endpoint reference for flows, templates, campaigns, accounts. Note that `/v1/agent/flows` list/publish are aliases of `/v1/flows` list/publish.
- **quickstart.md** — common external flow: `GET /v1/flows` → `POST /v1/campaigns/preview-audience` → `POST /v1/campaigns` → `POST /v1/campaigns/{id}/start`. curl examples with sample responses.
- **templates.md** (new) — template CRUD + Meta approval lifecycle + status semantics.
- **campaigns.md** (new) — campaign CRUD, audience sources (`contacts` vs `freestand-claimant`), status lifecycle (`draft → materializing → scheduled|queued → processing → completed`), `warnings[]` conventions.
- **warnings.md** (new) — list all advisory warnings (`first_message_not_template`, `template_pending_approval`, etc.) vs hard errors. Include what UI callers should do in each case.
- **errors.md** (may exist) — add `campaign_materializing`.
- **system-prompt.md** — trim to reflect external agent's reduced tool set (no broadcast tools).
- **changelog.md** (new if missing) — note `magic_flow_url` → `platform_url` rename with deprecation timeline.

### OpenAPI spec

Existing `/api/v1/agent/openapi.json` endpoint (shipped in Phase 4 of original Agent API) needs updating to include the new endpoints.

- Modify `magic-flow/app/api/v1/agent/openapi.json/route.ts`:
  - Add new Zod schemas from Phase 2 to the `components.schemas` block.
  - Add path entries for every new endpoint.
  - Update `servers:` URL if needed.
- Existing tests in `__tests__/route.test.ts` — update assertion of endpoint count and schema list.

### Acceptance criteria

- [ ] `docs/agent-api/README.md` links all new pages.
- [ ] `docs/agent-api/templates.md` and `campaigns.md` exist with curl examples + response samples.
- [ ] `docs/agent-api/warnings.md` enumerates every warning code + recommended UI action.
- [ ] OpenAPI spec response includes new endpoints; `npx openapi-typescript ...` generates a compiling client.
- [ ] `docs/agent-api/changelog.md` documents `magic_flow_url` deprecation with removal version.

### Risk

Very low. Docs-only, no runtime change.

---

## Shipping order

| # | Description | Repo | Depends on | Estimated |
|---|---|---|---|---|
| 1 | Phase 0 — prompt fix | magic-flow | — | 0.5 day |
| 2 | Phase 1 — backend guardrails | fs-whatsapp | — | 2 days |
| 3 | Phase 2 — REST endpoints (+ 2.a external one-pager) | magic-flow | #2 | 4.5 days |
| 4 | Phase 3 — tool split | magic-flow | — | 1 day |
| 5 | Phase 4 — UI updates | magic-flow + fs-whatsapp | #2 | 1 day |
| 6 | Phase 5 — docs + OpenAPI | magic-flow | #3 | 1 day |

Each PR is independently reversible. Ship Phase 0 on its own today — it fixes a legitimate bug and has no dependency.

Phases 1 and 3 can go in parallel. Phase 2 needs Phase 1 to validate the new error codes and warning shapes end-to-end. Phase 4 depends on Phase 1. Phase 5 docs the shipped reality so comes last.

---

## Commit strategy

Each phase is one PR. Inside the PR, small commits grouped by deliverable:

**Phase 0:** Single commit. `feat(prompt): relax template-first rule to walk past server-side nodes`

**Phase 1:** Two commits.
1. `feat(campaigns): 409 on start of materializing campaign`
2. `feat(campaigns): structured warnings[] + first_message_not_template advisory`

**Phase 2:** Several commits, one per resource group:
1. `feat(api): add PlatformBaseURL config + platform_url on flow/template/campaign responses (fs-whatsapp)`
2. `feat(api): flow REST endpoints /v1/flows/* + deprecate magic_flow_url`
3. `feat(api): template REST endpoints /v1/templates/*`
4. `feat(api): campaign REST endpoints /v1/campaigns/*`
5. `feat(api): /v1/accounts GET`

**Phase 3:** Single commit. `feat(agent): split EDIT-mode tool set by caller source`

**Phase 4:** One commit per UI repo.
1. `feat(ui): handle warnings[] and campaign_materializing in campaign flow (magic-flow)`
2. `feat(ui): handle warnings[] and campaign_materializing in campaign flow (fs-whatsapp frontend)`

**Phase 5:** Single commit. `docs(agent-api): REST reference + warnings + openapi update`

PR titles mirror the most prominent commit. PR body paste the relevant TL;DR section from this spec.

---

## Reference appendix

### A — Node-type skip list (for Phase 0 and Phase 1.2)

Server-side types to skip when walking for "first user-facing message":

```
apiFetch, action, transfer, condition, flowComplete,
shopify, stripe, zapier, google, salesforce,
mailchimp, twilio, slack, airtable, metaAudience
```

Source: `magic-flow/constants/node-categories.ts:331-799` — types with `category: "action"`, `category: "logic"`, or `category: "integration"`. Use explicit type name list, not category-based filter, because `templateMessage` is ALSO in `category: "action"` (line 432).

### B — User-facing node types

```
templateMessage, whatsappMessage, instagramDM, instagramStory,
question, quickReply, interactiveList, whatsappFlow,
name, email, dob, address, homeDelivery, trackingNotification, event, retailStore
```

The flowTemplate chains (`name`, `email`, etc.) expand to internal `question` sequences at runtime — user-facing.

Source: `magic-flow/constants/node-categories.ts:175-706`.

### C — Error codes

New code added in this spec:

- `campaign_materializing` (409) — `StartCampaign` on a campaign whose status is `materializing`.

Existing codes (unchanged) referenced by this spec:

- `template_not_approved_for_immediate_send` / `template_status` (409) — immediate send + non-APPROVED template. Source: `fs-whatsapp/internal/handlers/campaigns.go:580-585`.
- `keyword_conflict` (409) — trigger keyword collision on flow create.
- `flow_not_found` (404), `unauthorized` (401), `rate_limited` (429), etc. — existing Agent API codes in `magic-flow/lib/agent-api/errors.ts`.

### D — Warning codes

New structured `warnings[]` items introduced by this spec:

| Code | Context | Extras |
|---|---|---|
| `first_message_not_template` | Create campaign, flow's first user-facing message isn't a template | — |
| `template_pending_approval` | Create campaign, scheduled send, template not APPROVED | `template_name` |

Both are informational. Caller may ignore, display, or proceed.

### E — Files to touch (inventory)

**magic-flow** (Phase 0, 2, 3, 5):
- `lib/ai/tools/flow-prompts.ts` (Phase 0, 3)
- `lib/ai/tools/generate-flow-edit.ts` (Phase 3)
- `lib/ai/core/ai-context.ts` or type-def equivalent (Phase 3)
- `lib/agent-api/schemas.ts` (Phase 2)
- `lib/agent-api/constants.ts` (Phase 2)
- `lib/agent-api/auth.ts` (Phase 2)
- `lib/agent-api/publisher.ts` (Phase 2)
- `lib/agent-api/errors.ts` (Phase 1-2 integration)
- `app/api/ai/flow-assistant/route.ts` (Phase 3)
- `app/api/v1/agent/flows/route.ts` (Phase 3)
- `app/api/v1/agent/flows/[flow_id]/edit/route.ts` (Phase 3)
- `app/api/v1/agent/openapi.json/route.ts` (Phase 5)
- `app/api/v1/flows/**` (Phase 2)
- `app/api/v1/templates/**` (Phase 2)
- `app/api/v1/campaigns/**` (Phase 2)
- `app/api/v1/accounts/**` (Phase 2)
- `components/broadcast/**` (Phase 4)
- `hooks/queries/**` (Phase 4)
- `docs/agent-api/**` (Phase 5)

**fs-whatsapp** (Phase 1, 2, 4):
- `internal/handlers/campaigns.go` (Phase 1)
- `internal/handlers/campaigns_start_test.go` — new (Phase 1)
- `internal/handlers/campaigns_first_message_test.go` — new (Phase 1)
- `internal/config/` (Phase 2 — PlatformBaseURL)
- Handlers that return flow/template/campaign resources (Phase 2 — populate `platform_url`)
- `frontend/src/views/campaigns/` (Phase 4)

---

## Test plan

Per-phase tests listed in each phase's "Acceptance criteria". Before any PR:

**magic-flow:**
```bash
cd magic-flow
npx tsc --noEmit
npx vitest run
npx eslint . --max-warnings 0
```

**fs-whatsapp:**
```bash
cd fs-whatsapp
make lint
make test
```

**End-to-end manual QA (after Phase 4):**

1. External API with `whm_*` key:
   - `curl GET /v1/flows` — list flows, response has `platform_url` per item.
   - `curl POST /v1/templates` — create a template, response includes `platform_url`.
   - `curl POST /v1/campaigns/preview-audience` — preview an audience.
   - `curl POST /v1/campaigns` — create campaign, response includes `warnings[]` and `platform_url`.
   - `curl POST /v1/campaigns/{id}/start` — start immediately, observe either 200 or 409 `campaign_materializing`.

2. Internal Freestand UI:
   - Open campaign creation modal, pick a flow with `start → whatsappMessage` → see `first_message_not_template` banner, proceed.
   - Pick a flow with PENDING template, schedule for tomorrow 9pm → see `template_pending_approval` banner with link, proceed.
   - Start a freestand-claimant campaign immediately → see loading state, eventually unblocks.

3. Internal AI chat:
   - Ask "broadcast this flow" on a flow starting with `apiFetch → templateMessage(approved)` → AI proceeds without nagging about position.
   - Ask the same on an action-only flow → AI proceeds.

---

## Post-merge follow-ups (not for this spec)

- Kill deprecated `magic_flow_url` field after one release window (mark in `docs/agent-api/changelog.md`).
- Consider per-resource NL agent endpoints (`/v1/agent/broadcasts`, `/v1/agent/templates`) if external parties ask for NL over those domains. Today REST is enough.
- Consider MCP server wrapping the full REST + NL surface for Claude Desktop / Cursor integration.
- Monitor external caller behavior. If many skip `preview-audience` and burn audiences, revisit the `audience_preview_token` gate idea.

---

**End of spec.** Engineer picking up any phase: write a per-phase task-by-task plan under `docs/superpowers/plans/YYYY-MM-DD-agent-api-decoupling-phase-N.md` before execution.
