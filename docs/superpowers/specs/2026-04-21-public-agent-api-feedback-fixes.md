# Public Agent API — v1 feedback fixes

**Context**: the Freestand data platform (sampling-central) consumed the public Agent API surface (magic-flow `/v1/*`) and surfaced structural gaps during a live Pedigree broadcast flow. This spec tracks the fixes as 5 PRs in shipping order.

**Ground rules**:
- Each PR updates `magic-flow/docs/agent-api/integration-rest.md` in the same PR (per the "update integration docs" rule).
- No sampling-central code changes. Integrators adjust from the doc.
- Each PR is independent — no blocking dependencies.

## Priority queue

| Order | PR | Size | Status |
|---|---|---|---|
| 1 | [PR-1] Audience fields + preview echo | <1 day | ready |
| 2 | [PR-2] Server-side flow search | 1–2 days | ready |
| 3 | [PR-4] Flow variable buckets | 2–3 days | ready |
| 4 | [PR-3] `description` end-to-end | 2–3 days | ready |
| 5 | [PR-5] `PublicCampaign` normalizer | 3–5 days | **deferred — discuss after PR-3** |
| 6 | Follow-ups: error envelope, semantic search | — | **deferred** |

## Progress

Update this table as PRs open / merge. "fs-whatsapp" and "magic-flow" columns hold the PR number (or `—` when the repo isn't touched).

| PR | fs-whatsapp | magic-flow | Doc (`integration-rest.md`) | Status |
|---|---|---|---|---|
| PR-1 Audience fields + preview echo | [fs-chat#48](https://github.com/freestandtech/fs-chat/pull/48) merged | [magic-flow#100](https://github.com/freestandtech/magic-flow/pull/100) merged | covered in #100 | ✅ shipped |
| PR-4 Flow variable buckets | branch `agent-api/flow-variable-buckets` | branch `agent-api/flow-variable-buckets-docs` | bundled in magic-flow branch | in progress |
| PR-2 Server-side flow search | — | — | — | queued |
| PR-3 `description` end-to-end | — | — | — | queued |
| PR-5 `PublicCampaign` normalizer | — | — | — | deferred |
| Follow-ups | — | — | — | deferred |

---

## PR-1 — Audience fields + preview echo

### Problem
Campaign responses hide `audience_id` inside the `audience_config` JSONB blob and don't surface `audience_name` at all. `preview_audience` returns `audience_name` but doesn't echo back the `audience_id` the caller passed in. Downstream integrators can't render "to *All Dog Parents*" with a deep link or trace a broadcast back to its source audience without a separate lookup.

### Files

**fs-whatsapp**
- `internal/handlers/campaigns.go:1856-1895` (`toCampaignResponse`) — add top-level `AudienceID` + `AudienceName`. For `freestand-claimant`, `audience_id` comes from `SourceExternalID` (already populated at line 337). `audience_name` resolves via go-backend. For `contacts` / `csv`, leave both nil.
- `internal/handlers/campaigns.go:137-218` (`ListCampaigns`) — batch-resolve audience names in one go-backend call to avoid N+1 per list page.
- `internal/handlers/campaigns.go:1758-1852` (`PreviewAudience`) — echo `audience_id` in the freestand-claimant response (line 1838-1847). Already have it as `req.AudienceID`.
- `internal/handlers/campaigns.go:50-95` (`CampaignResponse` struct) — add `AudienceID *uuid.UUID` and `AudienceName string` fields.

**magic-flow**
- No code changes (pass-through via `proxyToFsWhatsApp`).

### Shape change
Campaign list/detail item gains:
```json
{
  "audience_id": "033ba267-cd95-4046-bbd4-93c7c962634a",
  "audience_name": "All Dog Parents",
  "audience_source": "freestand-claimant"
}
```
Preview-audience gains:
```json
{
  "audience_id": "033ba267-cd95-4046-bbd4-93c7c962634a"
}
```

### Doc update
`integration-rest.md`: update campaign list/detail and preview-audience response sections.

---

## PR-2 — Server-side flow search

### Problem
`GET /v1/flows?query=...` accepts `query` but drops it server-side (see comment at `magic-flow/app/api/v1/agent/flows/route.ts:33-34` — "parent LLM does the fuzzy matching"). Forces callers to fetch up to the 50-flow cap and filter locally; breaks above that, can't do semantic matches.

### Files

**fs-whatsapp**
- `internal/handlers/magic_flow.go:171-205` (`ListMagicFlowProjects`) — accept `query` param. Apply `WHERE (name ILIKE '%query%' OR trigger_keywords::text ILIKE '%query%')` when set. (Use GIN index on trigger_keywords if available.)
- Add unit test: query matches name substring; query matches a keyword in the array; empty query behaves as before.

**magic-flow**
- `lib/agent-api/publisher.ts:50-102` (`listFlows`) — accept `query` param, forward as URL query.
- `app/api/v1/agent/flows/route.ts:40-56` — pass `parsed.data.query` to `listFlows(ctx, limit, query)`.
- Delete the "not used server-side in v1" comment at `route.ts:33-34`.

### Doc update
`integration-rest.md`: `query` is now server-side ILIKE over name + trigger_keywords; integrators can drop local fuzzy workarounds. Mention semantic upgrade is on the roadmap.

---

## PR-4 — Flow variable buckets

### Problem
`GET /v1/flows/{id}/variables` returns a flat `string[]`. Caller can't distinguish variables set *inside the flow* (like `platform_choice` from a button step — written by the flow at runtime, so mapping from audience data is a no-op) from variables *referenced but never produced* (which must come from audience column mapping). Chat evidence: agent proposed `platform_choice → skus` as a `column_mapping`, validation passed, user caught it manually.

### Files

**fs-whatsapp**
- `internal/handlers/flow_variables.go:26-61` (`ExtractFlowVariableNames`) — change return to two slices:
  ```go
  type FlowVariables struct {
      UserProvided []string `json:"user_provided"`
      FlowInternal []string `json:"flow_internal"`
  }
  ```
  Algorithm: walk steps once; collect `step.StoreAs` (+ `_title` for `FlowStepTypeButtons`) into `internal` set; for each `{{name}}` reference, if NOT in `internal` → `user_provided`. Sort both alphabetically.
- `internal/handlers/flow_variables.go:141-167` (`GetFlowVariables`) — return new envelope shape.
- `internal/handlers/flow_variables_test.go` — update expectations. Add fixture where a step's `store_as` value is also referenced by a later step's message (should land in `flow_internal`, not `user_provided`).

**magic-flow**
- `app/api/v1/flows/[flow_id]/variables/route.ts` — already pass-through, no change.

### Shape change
Before:
```json
{ "variables": ["platform_choice", "platform_choice_title"] }
```
After:
```json
{
  "user_provided": [],
  "flow_internal": ["platform_choice", "platform_choice_title"]
}
```

### Doc update
`integration-rest.md`: update variables section. Strong guidance — "when building `column_mapping` for `POST /v1/campaigns`, keys MUST come from `user_provided` only. Keys in `flow_internal` are set at runtime and overwritten; mapping them is silently ignored." Example: the Pedigree Shop & Save flow has `user_provided: []` because all its variables are button-produced — no column mapping is needed to broadcast it.

### Migration note
This is a breaking change for any caller reading `variables` as a flat array (sampling-central's `list_flows.ts:84` reads it this way). Flag prominently in the PR description so integrators update first.

---

## PR-3 — `description` end-to-end

### Problem
Flows have a `description` column on `magic_flow_projects` that round-trips via PATCH (`patchFlowBodySchema:145` supports it) but is silently dropped at create time and never returned on list/detail responses. Integrators who want a subtitle under a flow name have nothing to display.

### Files

**fs-whatsapp**
- Verify `models.MagicFlowProject.Description` column exists (PATCH works → probably does). If missing, add migration.
- `MagicFlowProjectResponse` struct — include `Description`.
- `CreateMagicFlowProject` handler — accept `description` in request body, persist on create.

**magic-flow**
- `lib/agent-api/schemas.ts:19-24` (`createFlowBodySchema`) — add `description: z.string().max(1000).optional()`.
- `lib/agent-api/publisher.ts:9-19` (`PublicFlow`) — add `description: string | null`.
- `lib/agent-api/publisher.ts:50-102` (`listFlows`) — map `description` from fs-whatsapp response.
- `lib/agent-api/publisher.ts:117-165` (`createProject`) — accept `description` in opts, forward in POST body.
- `app/api/v1/agent/flows/route.ts:88-122` — extract `description` from `parsed.data`, pass to `createProject(...)`. Include in `writer.result(...)` at line 316-326.

### Shape change
Create request gains optional field:
```json
{
  "name": "...",
  "description": "Shop-and-save announcement flow for Pedigree claimants",
  "instruction": "...",
  "channel": "whatsapp",
  "trigger_keyword": "pedigree"
}
```
List/detail/create responses gain top-level `description` (nullable).

### Doc update
`integration-rest.md`: document `description` as optional on create, returned on list/detail (nullable).

---

## PR-5 — `PublicCampaign` normalizer (DEFERRED)

Mirror `PublicFlow` shape for campaigns — grouped sub-objects (`flow`, `audience`, `schedule`, `progress`, `stats`) instead of 25 flat fields. Before/after sketch already drafted in conversation. Discuss scope after PR-3 merges; decide whether to keep fs-whatsapp's raw shape as internal and only normalize at magic-flow's public surface.

## Follow-ups (DEFERRED)

- **Error envelope consistency**: every magic-flow error → `{code, message, details?}`. Fixes the opaque `"magic-flow: ["` message seen in the chat (caller's SDK falls back to `body.raw` when `message` is absent).
- **Semantic flow search**: upgrade PR-2's ILIKE to pgvector. Embed `(name, trigger_keywords)` on project save; cosine-distance ORDER BY. Enables "flows about pet food" style matches.
