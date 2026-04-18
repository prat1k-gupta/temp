# Campaign Scheduling — Design (Revision 2)

**Status:** Spec ready after review. Pending implementation plan.

**Repos affected:** fs-whatsapp (backend + scheduler + migration), magic-flow (UI + AI tools + typo fix).

## Problem

Broadcasting v1 shipped with a `scheduled_at` column on campaigns but no code reads it — the user can only start campaigns manually. Users need to schedule broadcasts ahead of time ("send this tomorrow at 6 PM") without having to be online when it fires.

The `whatomate` upstream has the same gap: field exists, UI displays it if set, but nothing auto-starts scheduled campaigns.

**Pre-existing bug that this spec fixes:** the magic-flow frontend sends the field as `schedule_at` (missing 'd'), but the backend expects `scheduled_at`. Today no scheduled-at value submitted via the form actually reaches the backend. See `magic-flow/types/campaigns.ts:64` and `magic-flow/components/campaigns/campaign-create-form.tsx:247`. Fixing the typo is in scope so that scheduling works end-to-end in the same PR.

## Goals

- Let users schedule a campaign for a future time when creating it.
- A scheduler goroutine auto-starts ready campaigns within ~30 seconds of the scheduled time.
- If the server is down past the scheduled time + grace window, mark the campaign as `failed` with a clear reason rather than sending at a surprising hour.
- Allow reschedule and cancel before the campaign fires.
- AI flow assistant can create scheduled campaigns and reschedule existing ones.
- Fix the `schedule_at` typo so the frontend actually submits the field.

## Non-goals (v1)

- Per-campaign timezone storage. Store UTC, render in browser-local time (matches the rest of the codebase).
- Recurring/repeat campaigns.
- Editing audience, flow, or name of a scheduled campaign. Only `scheduled_at` is mutable via reschedule — other changes require cancel + recreate. (This is the same restriction the existing `UpdateCampaign` enforces for non-draft campaigns; v1 keeps it.)
- CSV audience scheduling. CSV campaigns require a separate recipient-import step after create, so they can't be materialized in the transactional create path. Blocked at v1; revisit when CSV UI ships.
- Contact filter re-resolution at fire time. We snapshot recipients at create time (current behavior). Users adding/removing tagged contacts between schedule and fire will NOT affect the materialized recipient list. Spelled out in the UI.
- Configurable grace window. Fixed at 15 minutes.
- Multi-instance server deployments. v1 assumes single `server` process. Documented below as an ops constraint.

## How others do it

- **Postgres + ticker poll** is the dominant pattern (pg-boss, Shyp/rickover, countless in-house systems). Crash-safe per-tick, no new infra.
- **Redis ZSET** delayed queues are common in Sidekiq/BullMQ but add a second pattern alongside our existing Postgres-flavored campaign path.
- **pg_cron / external cron** — too coarse and operationally heavier.

We use Postgres + ticker poll running next to `SLAProcessor` and `SessionRecoveryProcessor` in the `server` process.

## Design

### Backend (fs-whatsapp)

#### 1. DB migration

New column on `bulk_message_campaigns`:

```sql
ALTER TABLE bulk_message_campaigns
  ADD COLUMN error_message TEXT NOT NULL DEFAULT '';
```

Used by the scheduler (missed grace window, enqueue errors) and available for future campaign-level failures. Existing `BulkMessageRecipient.ErrorMessage` is per-recipient; this is the campaign-level analog. Model struct gains `ErrorMessage string` via GORM.

Migration file: `internal/database/migrations/YYYYMMDDHHMMSS_add_campaign_error_message.up.sql` (+ `.down.sql` that drops the column). Naming matches existing migration pattern.

#### 2. Campaign status transitions

```
draft         -> scheduled    (via create with scheduled_at, or POST /reschedule)
draft         -> processing   (existing: user clicks "Start now")
scheduled     -> processing   (scheduler picks up, OR user clicks "Start now")
scheduled     -> scheduled    (via POST /reschedule with new time)
scheduled     -> cancelled    (existing: cancel_campaign, now CAS-guarded — see 6)
scheduled     -> failed       (scheduler misses grace window)
processing    -> scheduled    (scheduler's enqueue fails — internal retry)
failed        -> scheduled    (user reschedules a missed campaign)
```

`CampaignStatusScheduled` constant already exists in `internal/models/constants.go:144`. `StartCampaign` already allows `scheduled` as a starting state at `internal/handlers/campaigns.go:692`.

#### 3. Scheduler goroutine

New file: `internal/handlers/campaign_scheduler.go`

**Structural pattern:** mirror `SLAProcessor` exactly — struct with `app *App`, `interval time.Duration`, `stopCh chan struct{}`, `Start(ctx context.Context)`, `Stop()`. NO use of `App.wg.Add/Done` or `defer recover` (those are used for short-lived dispatched work; existing ticker processors don't use them).

```go
type CampaignScheduler struct {
    app      *App
    interval time.Duration
    stopCh   chan struct{}
}

func NewCampaignScheduler(app *App, interval time.Duration) *CampaignScheduler { ... }

func (s *CampaignScheduler) Start(ctx context.Context) {
    ticker := time.NewTicker(s.interval)
    defer ticker.Stop()
    for {
        select {
        case <-ctx.Done():    return
        case <-s.stopCh:      return
        case <-ticker.C:      s.tick(ctx)
        }
    }
}

func (s *CampaignScheduler) Stop() { close(s.stopCh) }
```

Each `tick` opens a short DB transaction and runs two queries with a per-tick limit.

**Query A — pick up ready campaigns (bounded):**

```sql
UPDATE bulk_message_campaigns
SET status = 'processing', started_at = NOW()
WHERE id IN (
  SELECT id FROM bulk_message_campaigns
  WHERE status = 'scheduled'
    AND scheduled_at <= NOW()
    AND scheduled_at >= NOW() - INTERVAL '15 minutes'
  ORDER BY scheduled_at ASC
  LIMIT 100
  FOR UPDATE SKIP LOCKED
)
RETURNING id, organization_id, flow_id, template_id, account_name;
```

Implementation uses `gorm.clause.Returning{}` (new for this codebase — document it). `SKIP LOCKED` is defensive: even though v1 is single-scheduler, it's the correct guard if a future operator starts two `server` processes for redundancy.

For each returned row, the scheduler calls `enqueueRecipientsForCampaign(ctx, campaign)` — a new shared helper extracted from `StartCampaign` (see §4). On enqueue error, the scheduler reverts the specific row with a CAS update:

```sql
UPDATE bulk_message_campaigns
SET status = 'scheduled'
WHERE id = $1 AND status = 'processing';
```

The next tick retries (up to ~30 retries across the 15-min window). The final missed-window query (Query B) then marks it `failed`.

**Query B — mark overdue as failed:**

```sql
UPDATE bulk_message_campaigns
SET status = 'failed',
    error_message = 'Missed scheduled start window: server was offline or unhealthy when scheduled_at passed.',
    completed_at = NOW()
WHERE status = 'scheduled'
  AND scheduled_at < NOW() - INTERVAL '15 minutes';
```

**Backlog logging:** if Query A returns exactly `LIMIT` rows (100), log a warning `"scheduler_backlog limit=100 earliest=<ts>"` so ops can see a campaign pileup before it turns into missed windows.

**Concurrency inside a tick:** recipient enqueue within a tick is serial per-campaign (cheap — just `LPUSH` to Redis). With a hard cap of 100 campaigns per tick and ~1000 recipients each, that's 100k `LPUSH` calls, which should finish well under 30s. If this ever becomes a bottleneck, the spec explicitly allows switching to a bounded worker pool; not built in v1.

**Single-instance lifecycle:**

Ops rule: exactly one `server` process owns the scheduler. Document in README / deploy notes. If your only `server` is down across a scheduled time, scheduled campaigns WILL miss the grace window and go to `failed`. The 15-min grace absorbs rolling-restart deploys but nothing longer.

#### 4. Refactor `StartCampaign`'s recipient enqueue into a helper

Extract lines `internal/handlers/campaigns.go:697-742` (load recipients, build jobs, enqueue, handle failure) into:

```go
// enqueueRecipientsForCampaign loads pending recipients, builds RecipientJobs,
// and enqueues them. Does NOT set or revert campaign.status — the caller
// owns status transitions.
func (a *App) enqueueRecipientsForCampaign(ctx context.Context, campaign *models.BulkMessageCampaign) (int, error) {
    // ... body extracted from StartCampaign lines 697-736 (minus status updates) ...
}
```

Caller responsibilities:
- `StartCampaign` (manual): before calling the helper, it sets `status = processing, started_at = now`. On helper error, it reverts with the existing revert-to-`draft` behavior (current semantic: manual start failure drops back to draft).
- Scheduler: Query A sets `status = processing`. On helper error, CAS-reverts to `scheduled` (different semantic — scheduler wants to retry within grace window).

Returns `(enqueuedCount, error)`. If `enqueuedCount == 0` with no error (i.e. zero pending recipients), the caller decides how to handle (StartCampaign returns 400 today; scheduler treats zero-recipient as a permanent failure — see §5).

#### 5. Create campaign API — scheduled_at handling

`POST /api/campaigns` when `scheduled_at != nil`:

- Reject if `audience_source == "csv"` (v1 non-goal). Return 400 `"CSV audience cannot be scheduled. Start the campaign manually after importing recipients."`
- Validate `scheduled_at > NOW() + 30s`. Return 400 on failure.
- Set `status = scheduled` instead of `draft`.
- Recipient materialization still runs in the same transaction for `contacts` and `sampling-central` audience sources. A scheduled campaign has zero recipients at fire time only if the materialization itself produced zero — in which case create_campaign already returns 400 today (the existing check at `campaigns.go:469-471`). So no new zero-recipient edge case for `scheduled`.

**Snapshot semantics:** the frontend scheduled-create copy explicitly says "Contacts matching the filter at this moment will receive the broadcast." Users understand the schedule is a time-shift on a fixed recipient list, not a deferred query.

#### 6. Reschedule endpoint

New route: `POST /api/campaigns/{id}/reschedule` (POST because `fastglue` doesn't expose `PATCH`; matches existing `/start`, `/pause`, `/cancel` convention).

Body: `{"scheduled_at": "2026-04-17T12:30:00Z"}`

Behavior:
- Allowed when current status is `draft`, `scheduled`, or `failed` (rescheduling a missed campaign is a common recovery path). Otherwise 400.
- Validate `scheduled_at > NOW() + 30s`.
- CAS update to prevent race with the scheduler:

  ```sql
  UPDATE bulk_message_campaigns
  SET status = 'scheduled', scheduled_at = $1, started_at = NULL, error_message = ''
  WHERE id = $2 AND status IN ('draft', 'scheduled', 'failed');
  ```

  If 0 rows affected → 409 `"Campaign state changed concurrently. Refresh and try again."`

- `started_at` is cleared because a rescheduled campaign hasn't started yet. `error_message` is cleared because the previous failure (if any) no longer applies. `completed_at` is NOT cleared — it was never set for a campaign that hadn't actually started; only Query B sets it for missed campaigns, and that's a real completion record. (Minor: if user reschedules a `failed`-missed campaign, `completed_at` from the Query-B update may linger. Acceptable for v1 — cosmetic only. Worth clearing too: add to the CAS SET.)

Updated CAS:

```sql
SET status = 'scheduled', scheduled_at = $1,
    started_at = NULL, completed_at = NULL, error_message = ''
```

Route is covered by the existing `/api/campaigns` prefix in `PathFeatureMap` (`internal/middleware/rbac.go:82` — longest-prefix matching already binds `/api/campaigns/*` to the `campaigns` feature). No map change needed.

#### 7. Harden cancel & delete against the scheduler race

Existing `CancelCampaign` (`campaigns.go:787-819`) reads then writes without a status guard in the UPDATE. If the scheduler picks up a `scheduled` campaign at T and Cancel fires at T+ε, Cancel overwrites `processing` with `cancelled` while jobs are already in Redis.

Fix: CAS guard on cancel.

```sql
UPDATE bulk_message_campaigns
SET status = 'cancelled'
WHERE id = $1 AND status NOT IN ('completed', 'cancelled', 'processing');
```

If 0 rows affected → 409 `"Campaign already started or finished. Cancellation not possible from current state."`

Cancelling during `processing` is explicitly NOT supported in v1 — pre-existing limitation, spec just makes it an explicit error instead of a silent race.

Same CAS guard for `DeleteCampaign` to prevent deleting a campaign the scheduler just flipped to `processing`.

#### 8. Server lifecycle

In `cmd/fs-chat/main.go:247-257`, alongside the SLA and session-recovery processors:

```go
campaignScheduler := handlers.NewCampaignScheduler(app, 30*time.Second)
schedulerCtx, schedulerCancel := context.WithCancel(context.Background())
go campaignScheduler.Start(schedulerCtx)
// ... on shutdown:
schedulerCancel()
campaignScheduler.Stop()
```

Logged on start and stop. No additional config — the 30s interval is a constant.

### Frontend (magic-flow)

#### 1. Fix the `schedule_at` typo

Files:
- `types/campaigns.ts:64` — rename field `schedule_at → scheduled_at`.
- `components/campaigns/campaign-create-form.tsx:247` — update the payload field name (currently hardcoded `schedule_at: null`).
- Any other references found via grep.

Confirm with grep before the PR that no other references exist.

#### 2. Campaign create form

File: `components/campaigns/campaign-create-form.tsx`

Add a fieldset above the Submit section:

- shadcn `RadioGroup`: "Send now" (default) / "Schedule for later"
- When "Schedule for later" is selected:
  - `<input type="datetime-local">` with label "Scheduled time"
  - Helper text: `"Your timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. The backend will validate this time; if your device clock is off, scheduling may fail. Contacts matching your filter at this moment will receive the broadcast."`
- Disable the schedule section entirely when `audience_source === "csv"` with tooltip "Scheduling is not yet supported for CSV audiences." (matches backend block.)

**Validation:**

The frontend is a hint, not the gate. Backend is the source of truth (avoids the browser-clock-skew trap — a browser that's 5 min ahead of the server would otherwise falsely reject valid times).

- If "Schedule for later" selected but input empty → inline error, block submit.
- If `new Date(input).getTime() < Date.now() + 60_000` (1 minute ahead — a friendlier hint than the backend's 30s hard minimum) → warning, but allow submit. Let the backend respond authoritatively.

**DST policy:** we document that in a timezone with DST transitions (e.g., `America/New_York`), scheduling across the spring-forward / fall-back window has browser-defined semantics — 01:30 on a fall-back day is ambiguous and the browser picks one. v1 does not disambiguate. If this becomes a support issue we'll add `date-fns-tz` and a TZ picker in v2. The vast majority of our users are in IST (no DST).

**Submit payload:** `scheduled_at: isoString || null`. IMPORTANT: convert with `new Date(input).toISOString()`. The `input` is a naive local-time string; the `Date` constructor interprets it in the browser's local TZ; `toISOString` emits UTC. This matches the codebase's existing timestamp handling everywhere else.

#### 3. Campaign list

File: `components/campaigns/campaign-list.tsx`

- When a row has `status === 'scheduled'`, show a Clock icon and the scheduled time formatted via `new Date(scheduled_at).toLocaleString()` next to the status badge. Matches the existing Vue UI convention.
- No changes to filters — status filter UI does NOT exist today (`app/(dashboard)/campaigns/page.tsx` has no filter component); not in scope for this spec.

#### 4. Campaign detail

File: `components/campaigns/campaign-detail.tsx`

When `status === 'scheduled'`:
- Banner: `"Scheduled for {formatted date} ({formatDistanceToNow(new Date(scheduled_at), { addSuffix: true })})"`.
- Action buttons replace Draft's "Start" with: "Start now", "Reschedule", "Cancel".

When `status === 'failed'` AND `error_message` begins with `"Missed scheduled start window"`:
- Red banner with the full error_message.
- Action buttons: "Reschedule", "Start now".

When `status === 'failed'` for other reasons — show error_message as-is; actions: "Retry failed" (existing) remains.

New component: `components/campaigns/reschedule-dialog.tsx`
- shadcn `Dialog`
- `<input type="datetime-local">` plus the same timezone hint text as the create form
- Same frontend validation rules as create
- Calls `POST /api/campaigns/{id}/reschedule` via the React Query hook in §5
- On success, invalidates `campaignKeys.detail(id)` + `campaignKeys.lists()`

#### 5. React Query hook

Add `useRescheduleCampaign()` to `hooks/queries/use-campaigns.ts`:

```ts
export function useRescheduleCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, scheduled_at }: { id: string; scheduled_at: string }) =>
      apiClient.post(`/api/campaigns/${id}/reschedule`, { scheduled_at }),
    onSuccess: (_data, { id }) => invalidateCampaignQueries(qc, id),
  })
}
```

Uses `apiClient.post` — no PATCH method on apiClient, no need to add one.

### AI Assistant (magic-flow)

#### 1. Pass browser timezone into the tool context

The AI currently has no knowledge of the user's timezone. Without it, "schedule for 6 PM tomorrow" can't be resolved correctly. Plumb the browser's timezone through the existing `toolContext` pipeline:

**Client side** — `components/ai/ai-assistant.tsx:316` (where `publishedFlowId` and `waAccountName` are sent):

```ts
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone  // e.g. "Asia/Kolkata"
// include in the POST body: userTimezone,
```

**Server side** — `app/api/ai/flow-assistant/route.ts`: destructure `userTimezone`, pass into `toolContext`.

**Tool context type** — `lib/ai/tools/generate-flow.ts:25` — add `userTimezone?: string` to the `toolContext` interface.

**System prompt** — `lib/ai/tools/flow-prompts.ts`, broadcasting section: include `"The user's timezone is ${toolContext.userTimezone ?? 'UTC'}. When the user mentions a time like 'tomorrow 6 PM', resolve it in that timezone, then convert to ISO 8601 UTC before calling create_campaign or reschedule_campaign. The scheduled time must be at least 2 minutes in the future."`

#### 2. Extend `create_campaign`

In `lib/ai/tools/generate-flow-edit.ts` `create_campaign` tool:

```ts
scheduled_at: z
  .string()
  .datetime()
  .optional()
  .describe(
    "Optional ISO 8601 UTC timestamp (e.g. '2026-04-17T18:00:00Z'). " +
    "If provided, the campaign is created in 'scheduled' state and will " +
    "start automatically at that time. Must be at least 2 minutes in the " +
    "future. Resolve relative times ('tomorrow 6 PM') using the user's " +
    "timezone from the system prompt, then convert to UTC. Not supported " +
    "when audience_source is 'csv'."
  ),
```

The `fetch` body on the existing create_campaign call site needs to include `scheduled_at` when provided — explicit addition to the `JSON.stringify({...})` payload, since the existing tool doesn't spread the full input.

#### 3. New tool: `reschedule_campaign`

```ts
actionTools.reschedule_campaign = tool({
  description:
    'Reschedule a draft, scheduled, or failed campaign to a new time. ' +
    'Works on any campaign that has not yet processed. Transitions the ' +
    'campaign to scheduled state. Confirm the new time with the user first.',
  inputSchema: z.object({
    campaign_id: z.string().uuid(),
    scheduled_at: z.string().datetime(),
  }),
  execute: async ({ campaign_id, scheduled_at }) => {
    const response = await fetch(`${apiUrl}/api/campaigns/${campaign_id}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ scheduled_at }),
    })
    // ... standard success / error envelope handling matching the other campaign tools ...
  },
})
```

#### 4. System prompt update

In `flow-prompts.ts` broadcasting section:

- Update the `create_campaign` bullet to mention the optional `scheduled_at` parameter.
- Add the `reschedule_campaign` bullet with the confirmation rule.
- Add the timezone sentence from §1.

#### 5. Tool documentation

Update `docs/flow-assistant-tools.md`:
- Add `reschedule_campaign` under "Broadcasting / Campaigns".
- Update `create_campaign` to document `scheduled_at`.
- Note the `userTimezone` requirement under tool availability.

Per the `feedback_update_integration_docs` memory: broadcast tools already live in `docs/flow-assistant-tools.md`, not `docs/agent-api/reference.md`. This spec follows the same boundary — the broadcast surface is intentionally outside the formal agent API.

## Data flow (end-to-end)

1. User: "broadcast this flow to Delhi contacts at 6 PM tomorrow"
2. AI reads `toolContext.userTimezone = "Asia/Kolkata"`, resolves "tomorrow 6 PM" as `2026-04-17T18:00:00+05:30` → `2026-04-17T12:30:00Z`.
3. AI: `preview_audience` → shows filter + count → asks user to confirm.
4. User confirms.
5. AI: `create_campaign({..., scheduled_at: "2026-04-17T12:30:00Z"})`.
6. Backend: validates future time, rejects if CSV, sets `status = 'scheduled'`, transactionally materializes recipients.
7. UI refreshes → user sees "Scheduled for 2026-04-17 6:00 PM IST (in 23 hours)".
8. Scheduler tick at/after 12:30 UTC → Query A picks up the campaign → `status = 'processing'` → `enqueueRecipientsForCampaign` succeeds → recipients sent.
9. Alternate path — server down 5:55 PM to 6:20 PM (IST) = 12:25 to 12:50 UTC:
   - First successful tick at 12:50 UTC finds `scheduled_at (12:30) < NOW() (12:50) - 15 min (12:35)` → Query B sets `status = 'failed'`, `error_message = 'Missed scheduled start window...'`.
   - User sees red banner, "Reschedule" action available.

## Testing

### Backend unit tests (`internal/handlers/campaign_scheduler_test.go`, new)

- Scheduler picks up a ready campaign (`scheduled_at = NOW() - 1s`); status → `processing`; recipients enqueued.
- Scheduler ignores a not-yet-ready campaign (`scheduled_at = NOW() + 1h`).
- Scheduler marks overdue campaigns (`scheduled_at < NOW() - 15m`) as `failed` with the expected `error_message`.
- Within-grace-window campaigns start (`NOW() - 10m <= scheduled_at <= NOW()`).
- If `enqueueRecipientsForCampaign` errors, CAS revert moves status back to `scheduled`; next tick retries successfully; Query B never fires for the retry-succeeded case.
- Per-tick LIMIT 100 is enforced; 150 ready campaigns split across two ticks.
- Backlog warning logged when Query A returns exactly 100 rows.
- Multi-tick race: simulate two schedulers picking up overlapping rows; SKIP LOCKED ensures no double-enqueue.

### Backend integration tests (extend `internal/handlers/campaigns_test.go`)

- `POST /api/campaigns` with `scheduled_at` → `status = 'scheduled'`, recipients materialized for `contacts` source.
- `POST /api/campaigns` with `scheduled_at` + `audience_source = 'csv'` → 400.
- `POST /api/campaigns` with `scheduled_at` in the past → 400.
- `POST /api/campaigns` with `scheduled_at` within 30s of now → 400.
- `POST /api/campaigns/{id}/reschedule` — valid, from `scheduled` → stays `scheduled` with new time; from `draft` → `scheduled`; from `failed` → `scheduled` with cleared `error_message`, `started_at`, `completed_at`.
- `POST /api/campaigns/{id}/reschedule` on `processing` → 400.
- `POST /api/campaigns/{id}/reschedule` CAS miss (row changed between read and write) → 409.
- `POST /api/campaigns/{id}/reschedule` with past time → 400.
- `POST /api/campaigns/{id}/cancel` CAS guard — cancel on `processing` → 409.
- RBAC: non-`campaigns`-feature user gets 403.

### Frontend tests

- Create form: "Schedule for later" toggles datetime input visibility.
- Create form: past time shows warning, still allowed to submit (backend is the gate).
- Create form: empty datetime blocks submit with inline error.
- Create form: scheduling disabled when `audience_source === "csv"` with tooltip.
- Create form: typo fix — payload uses `scheduled_at` (snake case).
- Reschedule dialog: same validation rules; submits `POST /reschedule`.

### Manual E2E

- Schedule for 2 minutes from now → wait → verify messages go out on time.
- Schedule for 1 day from now → verify UI shows countdown correctly.
- Reschedule an existing scheduled campaign → verify new time shows and old one is overwritten.
- Cancel a scheduled campaign during `scheduled` → 200.
- Cancel during `processing` → 409 with clear error.
- Schedule, stop server for 20 minutes, restart → verify campaign is `failed` with "Missed scheduled start window" banner; click "Reschedule" → pick new time → verify it schedules successfully.

## Risks & mitigations

- **Browser clock drift**: frontend validation is a hint; backend is the gate. Backend's 30s buffer absorbs normal network + drift. Severe drift (>2 min off) produces a 400 with a clear message; the UI surfaces it.
- **DST boundaries**: v1 ignores DST ambiguity (browser-defined). Most users are in IST (no DST). Documented; revisit with `date-fns-tz` if needed.
- **Multi-instance servers**: v1 is single-instance. SKIP LOCKED is a defensive guard if operators accidentally scale. Documented in deploy notes.
- **Stuck in `processing` from scheduler crash**: if the scheduler's UPDATE succeeds but the process dies before enqueue, the row sits in `processing` with `started_at` but zero jobs. Recovery: the existing retry-failed UI path can't help (it targets failed recipients). v1 adds a manual operator path — flip the row back to `scheduled` via SQL. Not auto-recovered. Documented as a known edge case; monitor with the backlog-warning log.
- **Worker-only deployment**: scheduler lives in the `server` process. If an operator runs only `worker` processes, scheduled campaigns never fire. Call-out in README.

## Files touched

### fs-whatsapp

- `internal/database/migrations/YYYYMMDDHHMMSS_add_campaign_error_message.{up,down}.sql` — new migration.
- `internal/models/bulk.go` — add `ErrorMessage string` field to `BulkMessageCampaign`.
- `internal/handlers/campaigns.go` — `CreateCampaign` status + CSV guard; new `RescheduleCampaign`; CAS guards on `CancelCampaign` + `DeleteCampaign`; extract `enqueueRecipientsForCampaign` helper.
- `internal/handlers/campaign_scheduler.go` — new file, ticker goroutine.
- `internal/handlers/campaign_scheduler_test.go` — new file, unit tests.
- `internal/handlers/campaigns_test.go` — extend with create/reschedule/cancel cases.
- `cmd/fs-chat/main.go` — start `CampaignScheduler` in the `server` subcommand; stop on shutdown.
- `README.md` / deploy docs — note the single-scheduler requirement.

### magic-flow

- `types/campaigns.ts` — rename `schedule_at → scheduled_at`; confirm `CampaignStatus` union includes `"scheduled"` and `"failed"`.
- `components/campaigns/campaign-create-form.tsx` — fix the typo; add "Send now / Schedule for later" section; wire validation.
- `components/campaigns/campaign-list.tsx` — show Scheduled time next to status badge.
- `components/campaigns/campaign-detail.tsx` — scheduled banner; reschedule/start-now/cancel action rows; failed-missed banner.
- `components/campaigns/reschedule-dialog.tsx` — new file.
- `hooks/queries/use-campaigns.ts` — add `useRescheduleCampaign()`.
- `components/ai/ai-assistant.tsx` — compute and POST `userTimezone`.
- `app/api/ai/flow-assistant/route.ts` — forward `userTimezone` into `toolContext`.
- `lib/ai/tools/generate-flow.ts` — add `userTimezone?: string` to `toolContext` type.
- `lib/ai/tools/generate-flow-edit.ts` — extend `create_campaign` schema + body; add `reschedule_campaign` tool.
- `lib/ai/tools/flow-prompts.ts` — update broadcasting section with `scheduled_at`, `reschedule_campaign`, and the timezone sentence.
- `docs/flow-assistant-tools.md` — document the new tool and updated `create_campaign` param; note `userTimezone` in availability.

## Open questions

None. Spec is ready for implementation plan.
