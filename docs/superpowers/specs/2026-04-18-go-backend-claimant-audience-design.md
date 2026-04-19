# Go-Backend Claimant Audience Source for Broadcasts

**Status:** Design
**Date:** 2026-04-18
**Owner:** Pratik
**Roadmap item:** Phase 4.2.1 — Broadcasting v2 follow-up #2 ("Go-backend claimant audience source")

---

## 1. Goal

Replace the Sampling Central HTTP client in fs-whatsapp with a client that talks to the Freestand go-backend's `POST /api/v1/claimant/get` endpoint. Broadcast campaigns can target any go-backend `ClaimantAudience` (static or dynamic) by pasting its UUID. Materialization is asynchronous with live progress via the existing WebSocket infrastructure. The Sampling Central client and `"sampling-central"` audience source are deleted in the same PR.

**This spec covers changes in two repos:** a small go-backend change to add `audience_id` semantics to `/claimant/get`, and the fs-whatsapp + magic-flow changes that consume it.

## 2. Non-goals

- Campaign scheduling — tracked in [`2026-04-16-campaign-scheduling-design.md`](./2026-04-16-campaign-scheduling-design.md); `scheduled_at` passes through unchanged.
- Inline filter builder in fs-whatsapp — users paste an `audience_id` UUID created in go-backend's UI. A builder UI in MagicFlow is a follow-up.
- A MagicFlow tool or dropdown that lists go-backend audiences — user supplies the UUID.
- Per-org Sampling Central credentials — obsolete, deleted with the SC client.
- Durable queue-based materialization — tracked as Approach B follow-up; goroutine + janitor is v1.
- **Proper service-to-service auth on go-backend** — `client_id` stays caller-attested for this release. The security debt is explicitly documented in §5.5 and tracked as a must-do follow-up before any external callers land on these routes.

## 2.5 Dependencies

This spec requires a go-backend PR to land first (or co-land):

- **go-backend PR** — adds `audience_id` branch on `POST /claimant/get`. Detailed in §3.0 below. ~30 lines of handler change + tests. No new routes, no middleware changes.

The fs-whatsapp PR cannot ship until the go-backend change is live on the target environment, because today's `/claimant/get` ignores `audience_id` entirely (verified at `go-backend/src/api/handlers/claimant.go:8561`: *"We don't route through ResolveTargetingFilter here: no audience_id semantics."*).

## 3.0 Go-backend changes required

### 3.0.1 `audience_id` branch on `POST /claimant/get`

Mirror the pattern already used by `POST /claimant/export` (which calls `ResolveTargetingFilter`):

1. In `GetClaimants` handler (`go-backend/src/api/handlers/claimant.go:8566`), add a new branch that fires when `request.AudienceID != ""` and `request.Filter == nil`:

   ```go
   var snapshotCap *time.Time
   if request.AudienceID != "" {
       if request.Filter != nil {
           return c.JSON(400, NewErrorResponse("Provide either filter or audience_id, not both."))
       }
       resolved, cap, err := ResolveTargetingFilter(ctx, cl.db.SamplingCentralQueries(), nil, request.AudienceID, request.ClientID)
       if err != nil {
           var apiErr *validators.APIError
           if errors.As(err, &apiErr) {
               return c.JSON(apiErr.Status, NewErrorResponse(apiErr.Message))
           }
           return c.JSON(500, NewErrorResponse(err.Error()))
       }
       filter = resolved
       snapshotCap = cap
   }
   // ... existing filter-or-client_id path continues for audience_id == ""
   ```

2. Thread `snapshotCap` into `GetClaimantsParams.SnapshotCap` in the `params` struct (already accepts `*time.Time`).

3. Extend `appliedFilters` in the response to echo audience metadata **when `audience_id` was used**:

   ```go
   if request.AudienceID != "" {
       audienceRow, _ := cl.db.SamplingCentralQueries().GetClaimantAudienceByID(ctx, request.AudienceID)
       appliedFilters["audience"] = map[string]any{
           "id":            audienceRow.Id,
           "name":          audienceRow.Name,
           "type":          audienceRow.Type,              // "static" | "dynamic"
           "snapshot_date": audienceRow.SnapshotDate,      // nullable
       }
   }
   ```

   This lets fs-whatsapp's preview call surface the audience name/type to users without a separate metadata round-trip.

4. Tests: happy path with audience_id, 404 on unknown audience, 403 on `client_id` mismatch, 400 on both audience_id + filter, static-audience snapshot_cap applied.

### 3.0.2 Security note

Ownership enforcement comes from `ResolveTargetingFilter` comparing the **body-provided** `client_id` against the audience row's stored `client_id`. This is caller-attested and does not prevent a malicious or misconfigured fs-whatsapp org admin from pointing at another tenant's audience (see §5.5). That threat is accepted for this release.

## 3. Contract with go-backend

### 3.1 Endpoint

`POST {FREESTAND_BACKEND_BASE_URL}/api/v1/claimant/get`

No auth middleware on the route (verified at `go-backend/src/api/routes/routes.go:166`). After §3.0's change, ownership is enforced by `ResolveTargetingFilter` (function at `go-backend/src/api/handlers/targeting_filter.go:47`, 403 branch at line 92) — the handler loads the audience row, compares its stored `client_id` against the body-provided `client_id`, returns 403 on mismatch. Since `client_id` is still caller-attested, this is defense against *misconfiguration* more than a hard security boundary (see §5.5).

### 3.2 Request

```json
{
  "audience_id": "<uuid from ClaimantAudience>",
  "client_id":   "<org's freestand_client_id>",
  "columns":     ["phone", "name", ...mapped columns],
  "page_size":   100,
  "cursor":      null | "<RFC3339 timestamp from previous page's nextCursor>"
}
```

- `columns` is always prefixed with `"phone"` (the send identifier). The rest are the distinct values of `column_mapping` from the campaign's `audience_config`, deduplicated.
- `page_size` is a fixed constant (100 — the go-backend cap).
- `cursor` is nil on the first call; on subsequent calls we pass the previous page's `pagination.nextCursor`.

### 3.3 Response

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "phone":            "<whatever go-backend stores>",
        "name":             "Alice",
        "city":             "Mumbai",
        "...":              "other requested columns",
        "claimant_id":      "auto-appended by go-backend",
        "signup_datetime":  "auto-appended by go-backend"
      }
    ],
    "uniqueUsers": 3100,
    "pagination": {
      "type":          "cursor",
      "pageSize":      100,
      "totalItems":    3247,
      "hasNextPage":   true,
      "nextCursor":    "2026-02-01T09:12:45Z",
      "currentCursor": "2026-03-15T12:34:56Z"
    },
    "appliedFilters": {
      "filter":   { "...": "echo of the resolved TargetingFilterDefinition" },
      "audience": {
        "id":            "abc-123",
        "name":          "North India VIPs",
        "type":          "dynamic",
        "snapshot_date": null
      }
    }
  }
}
```

Fields we read:
- `data.data[]` — one map per claimant. Includes every requested column plus **two auto-appended fields** (`claimant_id`, `signup_datetime`) added unconditionally by go-backend's dynamic query builder — harmless extras, treated as unused keys.
- `data.pagination.totalItems` — progress-bar denominator. Read **only on the first page** and cached client-side. Server recomputes it on every page (full COUNT(*) query), which is expensive — don't trust later values and don't rely on it for termination. Acknowledged performance cost: go-backend follow-up could add `include_total=false` to skip the COUNT on non-first pages.
- `data.pagination.hasNextPage` — loop termination.
- `data.pagination.nextCursor` — cursor for the next iteration. **Error case:** if `hasNextPage=true` but `nextCursor` is null/empty, treat as server error, fail the campaign with `failure_reason="pagination cursor missing"` to avoid an infinite loop with `cursor=null`.
- `data.appliedFilters.audience` — present only when the request used `audience_id`. Source of the preview UX's `audience_name` and `audience_type` (added by the go-backend change in §3.0).

### 3.4 Pagination strategy

Cursor-based, not offset. Reasoning:

- The endpoint supports both; cursor is chosen by passing a non-empty `cursor` field.
- For a `dynamic` audience, new signups between pages can shift offset-mode pagination (duplicate or skip rows). Cursor pins the position to a specific `signup_datetime` and is immune.
- For a `static` audience the `snapshot_date` clamp excludes new signups server-side, so offset would also be safe — but we want a single code path for both types.
- `totalItems` is returned in both modes (go-backend's `claimant.go:8689`), so we don't lose the progress-bar denominator.

**Known edge case:** cursor value is the `signup_datetime` of the last row. If two claimants share the exact same timestamp, one could be skipped at a page boundary. Sub-second signup collisions are vanishingly rare in practice; not mitigated in v1, documented here for future readers.

### 3.5 Retries and errors

- 4xx (including 403 and 404) — not retried; surfaced as `failure_reason` on the campaign and reported to the user.
- 5xx and network errors — retried up to 2 times with exponential backoff (250ms, 750ms). If still failing, campaign flipped to `failed`.
- Error envelope parsing: go-backend wraps errors as `{success: false, message: "..."}`. We parse the message and carry it into `failure_reason`.

### 3.6 Per-call timeout

Each HTTP call gets a 30s timeout (matches the existing SC client and gives headroom for dynamic queries with heavy LATERAL joins — feedback/order/delivery aggregations can take tens of seconds on cold cache for big clients). Total materialization time is bounded by the number of pages × per-call latency; no aggregate timeout on the goroutine itself, but the startup janitor (§7.3) sweeps anything older than 10 minutes.

## 4. New fs-whatsapp client package

### 4.1 Layout

`internal/clients/gobackend/`
- `client.go` — `Client`, `NewClient`, `GetClaimants`
- `types.go` — request/response Go structs, typed `APIError`
- `client_test.go` — httptest-driven unit tests

### 4.2 Surface

```go
type Client struct { ... }

func NewClient(baseURL string, timeout time.Duration, log logf.Logger) *Client

type GetClaimantsRequest struct {
    AudienceID string   `json:"audience_id,omitempty"` // XOR with Filter; §3.0 required
    ClientID   string   `json:"client_id"`
    Columns    []string `json:"columns"`
    PageSize   int      `json:"page_size"`
    Page       int      `json:"page,omitempty"`        // unused by us (cursor mode); present for completeness
    Cursor     *string  `json:"cursor,omitempty"`
}

type GetClaimantsResponse struct {
    Data           []Claimant                `json:"data"`
    Pagination     PaginationInfo            `json:"pagination"`
    AppliedFilters map[string]any            `json:"appliedFilters"` // carries audience metadata per §3.3
}

type Claimant map[string]any  // keys include requested columns plus auto-appended claimant_id + signup_datetime

type PaginationInfo struct {
    Type          string  `json:"type"`
    PageSize      int     `json:"pageSize"`
    TotalItems    int     `json:"totalItems"`
    HasNextPage   bool    `json:"hasNextPage"`
    NextCursor    *string `json:"nextCursor,omitempty"`
    CurrentCursor *string `json:"currentCursor,omitempty"`
}

type AudienceMeta struct {
    ID           string  `json:"id"`
    Name         string  `json:"name"`
    Type         string  `json:"type"`           // "static" | "dynamic"
    SnapshotDate *string `json:"snapshot_date"`  // RFC3339 or nil
}

// Parses AppliedFilters["audience"] into AudienceMeta; nil if absent.
func (r *GetClaimantsResponse) Audience() *AudienceMeta

func (c *Client) GetClaimants(ctx context.Context, req GetClaimantsRequest) (*GetClaimantsResponse, error)
```

**Envelope handling.** The wire response is `{success, message, data: {data, pagination, appliedFilters, ...}}` (go-backend's `NewSuccessResponse` wrapper). The client unwraps internally — decoding first into a `standardResponse[map[string]json.RawMessage]` shape, then deserializing `data.data`, `data.pagination`, `data.appliedFilters` into the typed struct above. `GetClaimantsResponse` represents the inner payload. Callers never see `success` / `message`.

**Observability.** Client emits structured logs on every call:
- `gobackend_claimant_get_started` — audience_id, page count estimate, cursor state
- `gobackend_claimant_get_page_done` — page rows, duration, cumulative rows
- `gobackend_claimant_get_retry` — attempt number, backoff interval, http status
- `gobackend_claimant_get_failed` — http status, error message

Metrics/counters are deferred to the broader observability initiative (see §13).

### 4.3 Tests

- `TestGetClaimants_SuccessSinglePage` — single page, `hasNextPage=false`.
- `TestGetClaimants_SuccessMultiPage` — loop with cursor, verify each request body's cursor matches the previous response's nextCursor.
- `TestGetClaimants_AudienceNotFound` — 404, parses error message.
- `TestGetClaimants_ClientMismatch` — 403, parses error message.
- `TestGetClaimants_NetworkError` — httptest server closes early, error propagated.
- `TestGetClaimants_ServerError5xxRetry` — flaky 500 on first call, success on retry.
- `TestGetClaimants_AuthHeaderAbsent` — sanity check: no `Authorization` header on the wire.

## 5. Per-org credential model

### 5.1 Schema change

New column on `organizations`:

```sql
ALTER TABLE organizations
    ADD COLUMN freestand_client_id uuid NULL;
```

Nullable — orgs that don't use the claimant source don't need it set. Attempting to create a `freestand-claimant` campaign on an org with a null `freestand_client_id` returns a 400 with a clear message.

### 5.2 Loader helper

```go
// internal/clients/gobackend/config.go
func getFreestandClientID(org *models.Organization) (string, error) {
    if org.FreestandClientID != nil && *org.FreestandClientID != "" {
        return org.FreestandClientID.String(), nil
    }
    if def := os.Getenv("FREESTAND_DEFAULT_CLIENT_ID"); def != "" {
        return def, nil
    }
    return "", errors.New("this organization has no freestand_client_id configured; set it in Account settings")
}
```

### 5.3 Base URL

`FREESTAND_BACKEND_BASE_URL` env var. No per-org override — this is infrastructure config, not tenancy data.

### 5.4 Admin UI

One new input on the existing Accounts/Org settings page in magic-flow:
- Label: "Freestand Client ID"
- Helper text: "UUID for your tenant in the Freestand data platform. Required to broadcast to claimant audiences."
- Validation: RFC-4122 UUID format
- Endpoint: extend the existing org-update mutation (verify the exact path during implementation — likely `PUT /api/organizations/self` or an equivalent) to accept `freestand_client_id`. One-field addition, no new route.

No separate "Integrations" section in v1. That section ships when we have a second external backend to configure.

### 5.5 Accepted security debt

`client_id` is caller-attested today — both in fs-whatsapp (admin types it into the settings form) and in go-backend (body param, no server-side binding to a verified caller identity). This means:

- An fs-whatsapp org admin who knows another tenant's `client_id` in go-backend can paste it into their org's settings and then create broadcasts that read that tenant's claimant audiences.
- `client_id` UUIDs are not secrets (admins see their own in dashboards), so this is a real gap, not a theoretical one.

**This is accepted for this release.** The risk is bounded by:
- fs-whatsapp admin role already controls a lot inside the org; adding this one cross-tenant vector is relatively small incremental blast radius.
- The Freestand team controls who gets an fs-whatsapp admin account today.

**Must-do follow-up before any external caller lands on `/claimant/get`:** proper service-to-service auth. Options: (a) `X-Freestand-Service-Key` header + `service_api_keys` table with key→client_id binding, middleware injecting `client_id` into echo.Context; (b) mTLS between fs-whatsapp and go-backend with cert-based client_id attestation. (a) is simpler. Tracked as a ROADMAP follow-up in §13.

Frontend must **not** present the "Freestand Client ID" field to non-admin users, and the update endpoint must require admin RBAC.

## 6. Campaign model changes

### 6.1 New status

Add to `internal/models/constants.go:140-150`:

```go
CampaignStatusMaterializing CampaignStatus = "materializing"
```

Transient state — set when `CreateCampaign` inserts the row, flips to `draft` on success or `failed` on error.

### 6.2 New columns

```sql
ALTER TABLE bulk_message_campaigns
    ADD COLUMN materialized_count int NULL,
    ADD COLUMN audience_total     int NULL,
    ADD COLUMN failure_reason     text NULL;
```

- `materialized_count` — incremented during materialization (set via `UPDATE ... SET materialized_count = <accumulator>` after each page; not `materialized_count = materialized_count + N` because the goroutine is the sole writer). Progress numerator during `status=materializing`.
- `audience_total` — set once after the first page response from go-backend. Progress denominator during `status=materializing`. Not updated after (subsequent pages' totalItems would drift for dynamic audiences; see M2 in the review for the perf consideration).
- `failure_reason` — populated on transition to `failed`, surfaced in the UI and to the AI tool.

All nullable — legacy campaigns and other audience sources leave them null.

**Semantic: `audience_total` vs the existing `total_recipients` column:**
- `audience_total` = what go-backend said the audience *should* contain (denominator during the paginated fetch).
- `total_recipients` (existing column, already written by `campaigns.go` for other sources) = the actual number of recipient rows we created after deduping + phone-normalization failures.

They're different: `audience_total` can exceed `total_recipients` when some rows fail phone validation or already exist as contacts with a prior opt-out. Keep both. `total_recipients` is what the UI shows post-materialize ("Sending to N recipients"); `audience_total` is only used during the materialization progress bar.

### 6.3 Audience source value

- Add `"freestand-claimant"` to the validator allowlist in `campaigns.go`'s request parser.
- Remove `"sampling-central"` from the allowlist.
- `source_system="freestand-claimant"`, `source_external_id=audience_id`.
- `audience_config` JSONB shape for this source:

```json
{
  "audience_id":     "<uuid>",
  "column_mapping": {
    "customer_name": "name",
    "city":          "city",
    "product":       "skus"
  }
}
```

- `column_mapping` keys are user-chosen flow/template variable names (no `{{}}`).
- `column_mapping` values are column names from the allowlist (§8).

## 7. Materialization goroutine

### 7.1 Handler change

`CreateCampaign` no longer calls materialization inline. Instead:

1. Validate the request, including `audience_source`, `audience_config`, and template-param coverage (see §7.2 bullet 2).
2. Insert the campaign row inside a transaction with `status=materializing`, `audience_total=NULL`, `materialized_count=0`.
3. Commit. Return 201 with the campaign ID.
4. After the response is sent, spawn the background materialization:

   ```go
   a.wg.Add(1)
   go func() {
       defer a.wg.Done()
       defer func() {
           if rec := recover(); rec != nil {
               a.Log.Error("materialization panic",
                   "campaign_id", campaignID.String(),
                   "panic", rec,
                   "stack", string(debug.Stack()))
               // Best-effort flip to failed so the UI doesn't spin forever.
               _ = a.DB.Model(&models.BulkMessageCampaign{}).
                   Where("id = ?", campaignID).
                   Updates(map[string]any{
                       "status":         models.CampaignStatusFailed,
                       "failure_reason": "internal error during materialization",
                   }).Error
           }
       }()
       bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
       defer cancel()
       a.materializeAudienceFromGoBackend(bgCtx, orgID, channel, cfg, campaignID)
   }()
   ```

   Key details:
   - **Fresh context** (`context.Background()`, not `r.RequestCtx`) — fasthttp cancels the request context once the 201 response is sent; using it would cancel every DB/HTTP call inside the goroutine.
   - **10-minute aggregate timeout** — matches the startup janitor's sweep window (§7.3) and bounds the largest sane audience (100k claimants × 200ms/page ≈ 3.3 minutes).
   - **Explicit recover with logging** — fs-whatsapp's existing `a.wg.Add(1)` call sites (`chatbot.go:1691`, `webhook_dispatch.go:67`, `messages.go:263`) do NOT currently use `defer recover()` despite CLAUDE.md mentioning it. We add it here because a panic in this goroutine would otherwise leave the campaign stuck in `materializing` until the 10-minute janitor, and the panic would crash the whole server. Introducing the pattern here is deliberate; an audit of other goroutines is out of scope.

### 7.2 Goroutine flow

`materializeAudienceFromGoBackend(ctx, orgID, channel, cfg, campaignID)`:

1. Load org's `freestand_client_id` (fallback to env default). On missing both: flip to failed, publish failure event, return.
2. **Validate column_mapping against the template's required placeholders** (if this is a template campaign — flow campaigns skip this check). Parse the template body with the existing `extractParameterNames` helper (used by `worker.go:102-132`); if any placeholder isn't present in `column_mapping` keys, fail the create request at the HTTP handler (step §7.1 bullet 1), not inside the goroutine. This prevents the "campaign created, materializes fine, every send fails" class of bug. Also fail if `column_mapping` has unknown column values (not in the §8 allowlist).
3. Build `columns := ["phone"] ∪ unique(column_mapping values)`.
4. Create `gobackend.NewClient(baseURL, 30*time.Second)`.
5. `cursor := nil; processed := 0; total := 0`
6. Loop:
    - Call `GetClaimants({audienceID, clientID, columns, pageSize: 100, cursor})`.
    - On first iteration:
        - Set `total = resp.Pagination.TotalItems`, update `audience_total` on the campaign row.
        - **Zero-claimant check:** if `total == 0`, flip to `failed` with `failure_reason="audience has zero claimants"` and return (matches the existing SC behavior at `campaigns.go:246-248`).
        - Publish initial WS progress event.
    - **Cursor-missing sanity check:** if `resp.Pagination.HasNextPage == true` and `resp.Pagination.NextCursor == nil`, flip to failed with `failure_reason="pagination cursor missing"`, return.
    - For each claimant in the page:
        - Extract phone from `claimant["phone"]` (type-asserted to string; skip-and-count if missing or not a string).
        - Normalize phone via `normalizeFreestandClaimantPhone` (renamed from `normalizeSamplingCentralPhone` at `internal/handlers/sampling_central_phone.go:24`; format-agnostic — accepts raw `9876543210`, `+91-9876543210`, `+919876543210`, strips formatting, validates length, returns digits-only form).
        - Skip-and-count invalid phones; don't fail the whole campaign on bad rows.
        - Build `ImportRow{PhoneNumber: digits, Name: getString(claimant, "name")}`.
    - Call `FindOrCreateContactsByPhone(orgID, channel, rows, sourceTag="source:freestand-claimant:<audienceID>")`.
    - Build `BulkMessageRecipient` rows:
        - `TemplateParams` JSONB = `{flowVar: formatValue(claimant[columnName])}` for each entry in `column_mapping` — see §8 for `formatValue` handling of arrays, nil, and type variations.
        - `PhoneNumber` = normalized digits; `RecipientName` = name; `Status` = Pending.
    - `CreateInBatches(500)` recipients.
    - `processed += len(page)`; `UPDATE bulk_message_campaigns SET materialized_count = ? WHERE id = ?` (accumulator-based, not incremental).
    - Publish `campaign_materializing_progress` event via Redis pub/sub (see §7.5) with `{campaign_id, materialized_count: processed, audience_total: total, phase: "fetching"}`.
    - If `!resp.Pagination.HasNextPage` break; else `cursor = resp.Pagination.NextCursor`.
7. On success: `UPDATE campaigns SET status='draft', total_recipients=<actual count> WHERE id = campaignID`; publish progress event with `phase="done"`; also publish `campaign_stats_update` via Redis so the detail page's stats panel refreshes.
8. On error: `UPDATE campaigns SET status='failed', failure_reason=<message>`; publish progress event with `phase="failed", error=<message>`.

### 7.3 Startup janitor

Add a new helper method on `handlers.App` and call it from `cmd/fs-chat/main.go` after `AutoMigrate` succeeds and before `g.Listen()` — co-located with the existing `StartCampaignStatsSubscriber()` boot call at `main.go:211` to keep boot-time setup in one place:

```go
// handlers.App method
func (a *App) ReapMaterializingCampaigns() error {
    return a.DB.Model(&models.BulkMessageCampaign{}).
        Where("status = ? AND created_at < ?",
              models.CampaignStatusMaterializing,
              time.Now().Add(-10*time.Minute)).
        Updates(map[string]any{
            "status":         models.CampaignStatusFailed,
            "failure_reason": "materialization interrupted by server restart — please retry",
        }).Error
}
```

Called as: `if err := app.ReapMaterializingCampaigns(); err != nil { log.Printf(...) }` — log-and-continue on error; the janitor is best-effort, not critical-path.

Ten-minute grace window lets in-progress goroutines from the just-started process finish without being stomped (10 minutes matches the goroutine's `context.WithTimeout` cap in §7.1, so nothing should ever exceed it under normal conditions).

### 7.4 Preventing Start on a materializing campaign

The existing send path doesn't filter by `campaign.status`; the worker consumes whatever is enqueued by `EnqueueRecipients` at `campaigns.go:736` (called from the Start endpoint). So the guard lives at the Start endpoint, not in the worker:

- In the handler for `POST /api/campaigns/:id/start` (or equivalent), reject with 409 Conflict if `campaign.status == 'materializing'`, error message `"campaign is still materializing recipients, try again in a moment."`
- Add to any AI tool path that invokes Start (see §9) — same check, same error surfaced to the AI for graceful retry.

This is the only code path that can turn materializing rows into send work. Adding one guard covers all callers.

### 7.5 WebSocket event via Redis pub/sub

The existing worker uses Redis pub/sub to deliver campaign progress events to the WS hub:
`worker → Publisher.PublishCampaignStats (queue/pubsub.go:44) → Redis → StartCampaignStatsSubscriber (app.go:94) → WSHub.BroadcastToOrg`.

Handler-side campaign events (`messages.go:559,636`, `campaigns.go:1362`) currently call `BroadcastToOrg` directly because they're in the same process. Our materialization goroutine will also run in the server process for v1 — direct broadcast *would* work — but we route through Redis anyway because:

1. **Approach B migration is zero-cost.** When we move materialization to a standalone worker (ROADMAP follow-up), no client code changes; the publisher path already works from there.
2. **Horizontal scaling.** Direct broadcast only reaches WS clients connected to the emitting fs-whatsapp replica. Redis fan-out reaches all replicas. fs-whatsapp may not run multi-replica today, but the lift to do so increases if we invent direct-broadcast code paths now.
3. **Consistency.** Worker uses Redis; handler call sites use direct broadcast. Picking a lane for this new path avoids a third convention.

Implementation: add a new method on `queue.Publisher` (`internal/queue/pubsub.go`):

```go
func (p *Publisher) PublishCampaignMaterializing(ctx context.Context, update *CampaignMaterializingUpdate) error { ... }
```

…and a matching subscriber in `StartCampaignStatsSubscriber` (or a sibling `StartCampaignMaterializingSubscriber`) that re-emits as `WSMessage{Type: "campaign_materializing_progress", Payload: ...}`.

Event payload:

```json
{
  "campaign_id":        "uuid",
  "organization_id":    "uuid",
  "materialized_count": 1200,
  "audience_total":     3247,
  "phase":              "fetching" | "done" | "failed",
  "error":              "optional message when phase=failed"
}
```

### 7.6 Campaign status state machine

Legal transitions for campaigns using the new source:

```
(new)  → materializing
materializing → draft       (goroutine success)
materializing → failed      (goroutine error, zero claimants, cursor missing, panic)
draft         → scheduled | processing | cancelled   (existing transitions, unchanged)
```

**Not permitted:**
- `materializing → cancelled` (user clicks cancel mid-materialize). For v1, the UI's Cancel button is disabled during `materializing`. The goroutine has no way to listen for cancellation; adding one is a follow-up (pass a cancel channel through the context and have the Cancel endpoint signal it). Simpler alternative: user waits for materializing to complete, then cancels.
- `materializing → draft → materializing` (re-running). Retry is tracked as a follow-up; in v1, a failed materialization means the user creates a fresh campaign.

## 8. Column mapping allowlist

Claimant columns exposed to users in the column-mapping dropdown:

| Column | Go-backend field | Wire type | Notes |
|--------|------------------|-----------|-------|
| `name` | user.name | string | |
| `city` | address.city | string | |
| `state` | address.state | string | |
| `pincode` | address.pincode | string | |
| `country` | address.country | string | |
| `address` | address.address | string | Full street-address line |
| `status` | claimant.status | string | `pending` \| `approved` \| `rejected` \| `in_review` \| `delivered` |
| `claim_date` | claimant.updated_at | RFC3339 string | |
| `campaign_name` | campaign_data.campaign_name | string | |
| `skus` | sku_names_agg.sku_names | `[]string` (JSON array) | See `formatValue` handling below |
| `utm_source` | claimant.utm_source | string | |
| `order_status` | order_agg.status | string | |
| `delivery_status` | delivery_agg.delivery_status | string | |
| `waybill_number` | delivery_agg.waybill_number | string | |

**`phone`** is always requested as the first column and used as the send identifier. Not mappable.

**Deferred columns** (not exposed in v1): feedback, purchase_intent, user_id, claimant_id, question responses (`q:<id>`), order/delivery timestamps. Users who need them can open a follow-up.

### 8.1 `formatValue` — JSONB coercion

The go-backend response arrives as JSON (decoded into `map[string]any`), so typed fields need careful handling:

```go
// formatValue coerces a go-backend-returned column value into the string form
// that ends up in BulkMessageRecipient.TemplateParams. This is the single
// source of truth for how "arrays of skus" and "null fields" render in flow
// variables and template params.
func formatValue(v any) string {
    if v == nil {
        return ""
    }
    switch val := v.(type) {
    case string:
        return val
    case []any:            // JSON arrays decode to []any, not []string
        parts := make([]string, 0, len(val))
        for _, item := range val {
            if s, ok := item.(string); ok && s != "" {
                parts = append(parts, s)
            }
        }
        return strings.Join(parts, ",")
    case bool:
        if val { return "true" }
        return "false"
    case float64:          // JSON numbers decode to float64
        return strconv.FormatFloat(val, 'f', -1, 64)
    default:
        return fmt.Sprintf("%v", val)
    }
}
```

Test cases (add to the goroutine's test suite):
- Missing key (column not in response) → `""` (empty string in TemplateParams).
- `null` value for an optional column → `""`.
- `skus: []` (empty array) → `""`.
- `skus: ["A", "B"]` → `"A,B"`.
- `skus: ["A", null, "B"]` → `"A,B"` (nil elements dropped).

### 8.2 Allowlist enforcement

Happens twice:

- **Create-request validator** (primary UX guard): rejects with 400 at the HTTP handler if any `column_mapping` value isn't in the allowlist above. User sees the error inline in the create form before any async work starts.
- **Goroutine safety net**: re-checks as a sanity barrier; on violation flips `status=failed` with message. Should never fire in practice.

## 9. AI tool changes

All three changes land in `magic-flow/lib/ai/tools/` and mirror the same changes on the external agent API handlers.

### 9.1 `preview_audience`

Today takes `filter`, `search`, `channel` for the `contacts` source. Extend to accept a `source` discriminator:

```typescript
type PreviewAudienceInput =
  | { source: "contacts"; filter?: object; search?: string; channel?: string }
  | { source: "freestand-claimant"; audience_id: string }
```

For the claimant source, internally call `POST /api/v1/claimant/get` with `audience_id, client_id, columns: ["phone"], page_size: 1`. Read `total_count` from `pagination.totalItems` and audience metadata from `appliedFilters.audience` (added by the go-backend change in §3.0). Return:

```json
{
  "total_count":    3247,
  "audience_name":  "North India VIPs",
  "audience_type":  "dynamic",
  "snapshot_date":  null
}
```

This preserves the SC preview's UX of confirming "did I paste the right audience?" by showing the human-readable name and type before the user commits to creating the broadcast.

### 9.2 `create_campaign`

Extend the `audience_source` enum with `"freestand-claimant"`. Add schema for its `audience_config`:

```typescript
type AudienceConfigFreestandClaimant = {
  audience_id: string   // UUID
  column_mapping: Record<string, string>  // flowVar -> claimant column (from §8 allowlist)
}
```

Response is extended with the new transient state:

```json
{
  "success": true,
  "campaign_id": "uuid",
  "name": "...",
  "status": "materializing",     // instead of "draft" for this source
  "audience_total": 3247         // null if not yet known
}
```

### 9.3 `get_campaign_status`

Add `"materializing"` to the documented status enum. Include progress fields when applicable:

```json
{
  "status": "materializing",
  "materialized_count": 1200,
  "audience_total": 3247,
  "failure_reason": null
}
```

The agent polls this every 2s (same pattern as `processing → completed`) until `status !== "materializing"`.

### 9.4 Tool docs

Update `magic-flow/docs/flow-assistant-tools.md` with the new source, new status, and progress fields. Include a worked example for the claimant source end-to-end (preview → create → poll → start).

### 9.5 Tool definition locations (verify at implementation time)

Spec claims the tool definitions live under `magic-flow/lib/ai/tools/`, but a grep there shows only flow-generation tools (`generate-flow.ts`, `generate-flow-edit.ts`, `suggest-nodes.ts`, etc.) — no campaign tools. The campaign tool definitions (`preview_audience`, `create_campaign`, `get_campaign_status`) are likely in:
- `magic-flow/app/api/ai/chat/route.ts` (internal chat)
- `magic-flow/app/api/v1/agent/...` (external agent API — Phase 4 surface)

Locate exact paths during implementation by grepping for the Zod tool names (e.g. `preview_audience`) and update accordingly. The external agent API may not currently expose campaign tools at all (per the memory, the external surface shipped with flow tools, not campaign tools). If that's the case, extending external agent API is out of scope for this PR and tracked as a separate follow-up.

## 10. Frontend (magic-flow)

### 10.1 Create form

Broadcast create form gets a new radio / segmented-control option for `audience_source`:

- **Contacts** (existing, default)
- **CSV** (existing)
- **Freestand Claimant Audience** (new)

When `freestand-claimant` is selected:
- Single text input for `audience_id` (UUID-validated on blur)
- Column-mapping table: rows of `{flow variable name, dropdown of allowlist columns}`. Pre-populated with the flow's required variables (from `get_flow_variables`) where possible.
- Auto-preview debounced 500ms: calls `preview_audience` on valid UUID, shows `"3,247 claimants"` under the input.
- Preview failure (404, 403, 5xx, network) surfaces a warning message inline but does **not** block submit — users can proceed and get the structured error via `failure_reason` if the materialization itself fails. This avoids locking users out when go-backend is briefly unreachable.

### 10.2 New hook

`hooks/use-campaign-materialization-subscription.ts` — copy of `use-campaign-stats-subscription.ts`, subscribes to `campaign_materializing_progress` events:

```typescript
export function useCampaignMaterializationSubscription(campaignId: string) {
  const { subscribe } = useWebSocket()
  const qc = useQueryClient()
  useEffect(() => {
    return subscribe("campaign_materializing_progress", (payload) => {
      if (payload?.campaign_id !== campaignId) return
      qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) })
    })
  }, [campaignId, subscribe, qc])
}
```

Invoked by the campaign detail page.

### 10.3 Campaign detail page

- When `campaign.status === "materializing"`:
  - Render a progress bar (shadcn `Progress`) with value `Math.min(100, (materialized_count ?? 0) / Math.max(audience_total ?? 1, 1) * 100)`. Cap at 100% in case of dynamic-audience drift where the goroutine processes more rows than the first page's `totalItems` reported.
  - Label: `"Materializing recipients — {materialized_count} of {audience_total}"` or `"Materializing — counting recipients..."` if `audience_total` is still null.
  - `Start campaign` button: disabled with tooltip `"Waiting for recipients to materialize"`.
  - `Cancel campaign` button: also disabled with tooltip `"Cannot cancel during materialization — please wait for it to complete"` (see §7.6 state machine).
- When `campaign.status === "draft"` (post-materialize): normal detail view; bar is gone; Start button active.
- When `campaign.status === "failed"` due to materialization: render `failure_reason` in a destructive alert. v1 does not offer in-place Retry — user creates a fresh campaign (Retry tracked as a follow-up in §13).

### 10.4 Org settings page

Add one field on the existing Accounts/Org settings form:
- Label: "Freestand Client ID"
- Input: text, UUID validation, placeholder `"00000000-0000-0000-0000-000000000000"`
- Help text: "UUID from your Freestand backend. Required to broadcast to claimant audiences."
- Wire to the existing org-settings mutation.

### 10.5 TypeScript types

- `types/campaigns.ts`: `AudienceSource = "contacts" | "csv" | "freestand-claimant"` (`"sampling-central"` removed).
- `CampaignStatus` union: add `"materializing"`.
- Campaign type: optional `materialized_count?: number`, `audience_total?: number`, `failure_reason?: string`.

## 11. Sampling Central removal (same PR)

Deletions in this PR:

- `fs-whatsapp/internal/clients/samplingcentral/` — whole directory.
- `fs-whatsapp/internal/handlers/campaigns.go`:
  - `samplingCentralCredentialsFromEnv()`
  - `materializeAudienceFromSamplingCentral()`
  - `samplingCentralAllowedColumns()`
  - `"sampling-central"` branch in the audience materialization dispatch.
  - `"sampling-central"` from the `audience_source` validator allowlist.
- `fs-whatsapp/internal/handlers/sampling_central_phone.go`:
  - Renamed to `freestand_claimant_phone.go` (or merged into a general `phone_normalization.go`).
  - Function `normalizeSamplingCentralPhone` → `normalizeFreestandClaimantPhone`. Logic is unchanged — the function is format-agnostic: it accepts `9876543210`, `+919876543210`, `+91-9876543210`, `91 9876543210`, strips whitespace/dashes/parens, validates length, returns the digits-only form used elsewhere. The original docstring claim about "10-digit unformatted Indian numbers" applied to how SC's data was actually structured, not to the function's input assumptions — the rename's accuracy is about provenance only.
- `fs-whatsapp/config.example.toml` — `SAMPLING_CENTRAL_*` env references.
- `fs-whatsapp/docker-compose*` — SC env entries if present.
- `fs-whatsapp/docs/` — any mentions of the Sampling Central integration.
- `magic-flow/types/campaigns.ts` — `"sampling-central"` from `AudienceSource`.
- `magic-flow/lib/ai/tools/` — `"sampling-central"` references in `create_campaign` / `preview_audience`.

No data migration needed — we are pre-production, no live campaigns depend on the SC source. If any test or seed fixtures reference it, update them.

**Pre-merge check (CI gate or manual):**

```sql
SELECT count(*) FROM bulk_message_campaigns WHERE audience_source = 'sampling-central';
```

Must return 0 in every target environment before the PR merges. If non-zero: either delete the stale rows (dev env), or abort the PR until someone decides how to migrate them.

## 12. Rollout & Testing

### 12.1 Manual test matrix

1. **Happy path — small audience (static, 10 claimants)**
   - Create audience in go-backend UI with 10 claimants.
   - Set org's `freestand_client_id`.
   - Create broadcast via MagicFlow create form. Verify:
     - Response is 201 immediately with `status=materializing, audience_total=null`.
     - Progress bar shows up.
     - Bar fills; status flips to `draft` within a few seconds.
     - Recipients table shows 10 rows with correct phones + template params.
2. **Happy path — medium audience (dynamic, 1000 claimants)** — verify cursor loop works across ~10 pages.
3. **Error — wrong client_id** — set org's `freestand_client_id` to a bogus UUID pointing at a different client's audience, create campaign, verify `status=failed` with `failure_reason` mentioning 403 / ownership.
4. **Error — missing client_id** — null `freestand_client_id`, create campaign. Expect 400 at request time (no async work).
5. **Error — audience not found** — valid client_id but bogus audience_id, create campaign. Expect `status=failed` with 404 message.
6. **Error — zero-claimant audience** — create empty audience in go-backend, broadcast to it. Expect `status=failed`, `failure_reason="audience has zero claimants"`.
7. **Error — mid-materialize go-backend 500** — stub go-backend to return 500 on page 3. Verify retry (two attempts), then campaign → failed with error; recipients from pages 1-2 stay in DB (no rollback — acceptable for v1; documented in §13).
8. **Error — pagination cursor missing** — stub go-backend to return `hasNextPage=true, nextCursor=null`. Verify campaign → failed with `failure_reason="pagination cursor missing"` (not an infinite loop).
9. **Error — invalid column mapping** — submit `column_mapping={"foo": "not_in_allowlist"}`. Expect 400 at create time from the request validator.
10. **Error — template vars unmapped** — template has `{{customer_name}}` placeholder; create with `column_mapping={}`. Expect 400 with a clear message listing the missing placeholder(s).
11. **Error — phone normalization failure** — seed a claimant with an 8-digit phone in go-backend. Verify that claimant is skipped (not failing the campaign) and counted in some `invalid_rows` metric or log.
12. **Concurrency — Start during materializing** — create campaign (still materializing), immediately call Start endpoint. Expect 409 Conflict with "still materializing" message. Same via AI path.
13. **Janitor recovery** — kill fs-whatsapp mid-materialize, wait 10m, restart. Verify the campaign is flipped to `failed`.
14. **Goroutine panic** — inject a panic (e.g. stub a nil pointer deref inside materialize). Verify: panic is recovered, campaign flipped to `failed`, server process survives, next request succeeds.
15. **WS event smoke** — open WS client, verify `campaign_materializing_progress` events arrive during materialization via Redis pub/sub path; verify UI progress bar updates live.
16. **AI agent** — via flow assistant chat: "schedule broadcast using <flow> to audience <uuid>, map customer_name to name." Verify preview → create → poll (sees `materializing`) → start sequence works. Verify AI handles the 409 gracefully if user says "start now" before materialize completes.
17. **Column mapping** — exercise each column in the §8 allowlist at least once. Verify `skus` comes through as comma-joined string. Verify null `city` on a row renders as empty string, not the string `"null"`.
18. **Auto-appended fields** — verify that `claimant_id` and `signup_datetime` in the response (auto-appended by go-backend) don't interfere — mapping explicitly excludes them and they end up unused in TemplateParams.
19. **Progress bar overflow** — for a dynamic audience where new signups occur during materialization, verify the progress bar caps at 100% (§10.3 Math.min clamp).
20. **SC removal** — verify no `sampling-central` references remain in `grep -r` across both repos (source, tests, docs, docker-compose, env samples). Verify pre-merge SQL check from §11 returns 0.

### 12.2 Automated tests

- `internal/clients/gobackend/client_test.go` — full table-driven test (§4.3).
- `internal/handlers/campaigns_test.go` — add tests for:
  - `CreateCampaign` with `audience_source="freestand-claimant"` returns 201 with `status=materializing`.
  - Goroutine flips status to `draft` on success (use `a.wg.Wait()` in the test after a stubbed go-backend).
  - Invalid column mapping fails the request at validate time.
  - Invalid `freestand_client_id` returns 400.
- Frontend: no new unit tests planned; existing Vitest suite for the create form adds a case for the new source.

### 12.3 Rollout

- **Two sequential PRs** per the project's "runtime first" rule in `/CLAUDE.md`: fs-whatsapp first (client package, schema, goroutine, SC deletion), then magic-flow (UI, new source option, types, tool schemas, SC reference cleanup). The magic-flow PR must pin to a fs-whatsapp commit that has the new endpoints live.
- No feature flag — this is a destructive replacement (SC is gone after merge). If we need to revert, `git revert` the magic-flow PR first, then the fs-whatsapp PR.
- Pre-merge: lint + test + type-check on both repos as per CLAUDE.md.

## 13. Follow-ups

To be appended to `magic-flow/ROADMAP.md` under Phase 4.2.1 when this ships:

- **Service-to-service auth on go-backend** (must-do before external callers) — replace caller-attested `client_id` with an API-key-derived identity. See §5.5. Candidate: `X-Freestand-Service-Key` + `service_api_keys` table + middleware injecting `client_id` into echo.Context. fs-whatsapp stores the key per-org (encrypted) instead of the raw `freestand_client_id`. Apply to `/claimant/get`, `/claimant/export`, and `/claimantAudiences/*` in the same PR.
- **Materialization via Redis queue (Approach B)** — move the goroutine into the existing Redis worker queue for restart resilience. Blocked on fixing the broadcasting-v1 standalone-worker constraint (the worker needs the `FlowTrigger` callback). Today's janitor + Redis pub/sub path (§7.5) is designed to make this migration near-zero-cost on the fs-whatsapp side — just move the goroutine's body to a job handler.
- **Partial-page rollback on mid-materialize failure** — today a failure on page 3 leaves pages 1–2 recipients in the DB, campaign status=failed. Consider wrapping per-page inserts in a single tx committed at the end, or a post-failure cleanup sweep.
- **Retry a failed materialization** — one-click "Retry" on a failed campaign that re-runs the goroutine without making the user re-fill the form. Also closes the `materializing → draft → materializing` state-machine gap from §7.6.
- **Cancel during materialization** — pass a cancel channel through the goroutine's context so the Cancel endpoint can interrupt a long-running fetch. Flips `materializing → cancelled` cleanly. Enables the Cancel button in §10.3.
- **Audience browser in MagicFlow** — replace the paste-UUID input with a dropdown/search. Requires a go-backend `GET /api/v1/claimantAudiences` list endpoint.
- **Inline filter builder** — let the user compose a `TargetingFilterDefinition` in MagicFlow instead of pointing at a saved audience. Effectively rebuilds go-backend's audience builder; big UI scope.
- **Expand column allowlist** — add `feedback`, `purchase_intent`, `q:<id>` (question responses) once a user asks. The goroutine and validator can accept new values with a one-line change.
- **External agent API campaign tools** — expose `preview_audience`, `create_campaign`, `start_campaign`, `get_campaign_status` on the external agent API (today only internal chat has them). Would also require updating the Phase 4 OpenAPI handoff doc.
- **`totalItems` pagination perf** — ask go-backend to skip the full COUNT when caller supplies a cursor or an `include_total=false` hint. Today's behavior triggers a COUNT(*) on every page, which is expensive for 100k+ audiences.
- **Restore deferred action-only flow completion** (unchanged from broadcasting-v1 deferred list) — `reconcileCampaignRecipientAfterFlow` hook.
- **Rate-limit outgoing calls to go-backend** — if many orgs materialize simultaneously, fs-whatsapp could saturate go-backend's claimant DB. Add a per-host semaphore or token-bucket if we see this pattern in prod.
- **Observability metrics** — add Prometheus counters/histograms for materialization duration, per-page latency, error rate, panic count. Currently only logs; metrics stack lands with a separate initiative.

---

**Cross-references:**

- fs-whatsapp broadcasting backend reference: `docs/superpowers/plans/2026-04-15-broadcasting-backend.md` (frozen at v1)
- magic-flow broadcasting frontend reference: `docs/superpowers/plans/2026-04-15-broadcasting-frontend.md` (frozen at v1)
- Campaign scheduling (parallel brainstorm): `docs/superpowers/specs/2026-04-16-campaign-scheduling-design.md`
- go-backend endpoint handler: `src/api/handlers/claimant.go:8566` (`GetClaimants`) — **today does not honor `audience_id`; §3.0 adds the branch**
- go-backend route registration: `src/api/routes/routes.go:166`
- go-backend audience resolver: `src/api/handlers/targeting_filter.go:47` (`ResolveTargetingFilter`), 403 branch at line 92
- go-backend column map: `db/service/claimant/dynamic/claimant.go:113`
- go-backend validator: `src/api/validators/schemas.go:1278` (`GetClaimantsRequest`)
- fs-whatsapp existing phone normalizer: `internal/handlers/sampling_central_phone.go:24` (`normalizeSamplingCentralPhone`)
- fs-whatsapp existing WS campaign events: `internal/handlers/campaigns.go:1362`, `internal/handlers/messages.go:559,636`
- fs-whatsapp Redis pub/sub publisher: `internal/queue/pubsub.go:44` (`PublishCampaignStats`)
- fs-whatsapp Redis pub/sub subscriber: `internal/handlers/app.go:94` (`StartCampaignStatsSubscriber`)
- fs-whatsapp boot wiring: `cmd/fs-chat/main.go:211` (where `ReapMaterializingCampaigns` plugs in)
- fs-whatsapp worker pattern (for Approach B future migration): `internal/worker/worker.go:374,415` (`PublishCampaignStats` call sites)
