# Broadcasting: Flow Extensibility + Sampling-Central Integration — Design Spec

**Date:** 2026-04-15
**Roadmap item:** `magic-flow/ROADMAP.md` Phase 4.2 — Campaigns / Broadcasting
**Branches:** `plan/broadcasting-flow-extensibility` (magic-flow + fs-whatsapp)

---

## Goal

Two things, bundled because they share a feature surface:

1. **Port the existing campaigns/broadcast feature from fs-whatsapp's Vue frontend into magic-flow's React app.** fs-whatsapp ships today as a single binary with an embedded Vue 3 frontend at `frontend/src/views/settings/CampaignsView.vue`. We want the campaigns feature inside magic-flow so it lives alongside the rest of the Freestand admin experience.
2. **Add flow broadcasting.** Today, campaigns can only send a WhatsApp template to each recipient. After this work, a campaign can alternatively send an entire published flow — each recipient enters the flow at its start node and runs through it independently. This is the ManyChat-style broadcast pattern referenced in the roadmap.
3. **Integrate sampling-central as an audience source.** sampling-central (`freestand/apps/sampling-central`) has a concept of `ClaimantAudience` that resolves to a list of claimants with phone numbers and metadata. fs-whatsapp gains the ability to accept a sampling-central audience ID when creating a campaign; at ingestion it calls sampling-central's audience resolution API, materializes the claimants as local contacts, and broadcasts to them.

## Scope

**In scope:**

- Schema changes on `bulk_message_campaigns` and `bulk_message_recipients` to support flow campaigns and external audience sources
- Worker branch in `internal/worker/worker.go` that calls the existing `triggerFlow()` when a campaign's `flow_id` is set, instead of `sendTemplateMessage()`
- Extended `POST /api/campaigns` handler that accepts `flow_id` (XOR `template_id`) and a new `audience_source` / `audience_config` pair
- sampling-central audience resolver client (a small internal HTTP client inside fs-whatsapp)
- Find-or-create contact helper that accepts a batch of phones + metadata and returns contact IDs, auto-tagging imports with their source
- Helper endpoint `GET /api/chatbot/flows/{id}/variables` that walks a flow's graph and returns the set of `{{var}}` names referenced anywhere in its nodes
- React port of the campaigns UI in magic-flow under `app/campaigns/` — list page, detail page, create form
- Audience picker with three tabs: existing contacts (reuses `useContactFilterUI`), CSV upload, sampling-central audience ID
- Variable mapping form that maps flow/template variable names to audience columns
- Info banner in the create form explaining the 24hr window implication for flows without a leading template
- WebSocket-driven live progress on the campaign detail page (existing `CampaignStatsUpdate` already fires from the backend)

**Out of scope (deferred):**

- **sampling-central's own audience resolution API.** Pratik will implement this on the SC side in a separate workstream. This spec fixes the contract fs-whatsapp will code against so both sides can proceed independently.
- **SC audience picker dropdown.** v1 requires the user to paste an audience ID manually. A dropdown requires a second SC list endpoint, which we'll add later.
- **Recurring campaigns.** v1 supports "send now" and "schedule for later". Weekly/monthly recurrence can be a follow-up.
- **Template + flow hybrid campaigns.** v1 forces the user to choose one or the other. If you want a "template opener → flow follow-up" UX, put the template node as the first node of the flow; don't build hybrid mode.
- **Flow completion rate analytics.** v1 tracks sent/delivered/read/failed (what the existing counters already provide). "% of recipients who reached a flow end node" is a nice-to-have; needs a join between `bulk_message_recipients` and `chatbot_sessions` and a new aggregation. Defer to v2.
- **Rate limiting beyond current behavior.** v1 inherits whatever rate the WhatsApp account tier allows; no per-campaign or per-API-key throttling.
- **CSV audience for flow campaigns that maps columns to flow variables.** CSV upload in v1 only supports the existing template path (where each row carries `template_params`). We can unify CSV + flow variable mapping in a follow-up if needed.
- **Pagination on the SC resolve call.** v1 fetches all claimants in a single call. Pratik will add cursor pagination in SC when audiences routinely cross ~50k members.

## Roles and responsibilities

- **magic-flow** (React builder): owns the broadcast creation UX. Knows about templates, flows, contacts, CSVs, and sampling-central audience IDs. Doesn't talk to sampling-central directly — proxies through fs-whatsapp.
- **fs-whatsapp** (Go runtime): owns the campaign model, worker, WhatsApp API calls, contact management, flow runtime. Owns the HTTP client that calls sampling-central at campaign creation time. Stores the audience metadata on the campaign for audit.
- **sampling-central** (Next.js app, separate repo): owns `ClaimantAudience` definitions and claimant data. Exposes ONE new external endpoint that resolves an audience ID to a list of claimants. Has no concept of "broadcast" — it's a data source only.

## Architecture

### Data model changes in fs-whatsapp

#### `bulk_message_campaigns` (additions)

```sql
ALTER TABLE bulk_message_campaigns
  ADD COLUMN flow_id           UUID NULL REFERENCES chatbot_flows(id) ON DELETE SET NULL,
  ADD COLUMN audience_source   VARCHAR(50) NOT NULL DEFAULT 'csv',
  ADD COLUMN audience_config   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN source_system     VARCHAR(50) NULL,
  ADD COLUMN source_external_id VARCHAR(255) NULL,
  ADD CONSTRAINT campaign_type_xor CHECK (
    (template_id IS NOT NULL AND flow_id IS NULL) OR
    (template_id IS NULL     AND flow_id IS NOT NULL)
  );
```

- **`flow_id`** — nullable FK to `chatbot_flows.id`. Mutually exclusive with `template_id` via the XOR check constraint. `template_id` stays nullable (it already is).
- **`audience_source`** — enum-ish string: `contacts` (picked from existing contacts via filter or manual selection), `csv` (uploaded CSV), `sampling-central` (resolved from an SC audience ID). Default `'csv'` matches existing behavior for backfill.
- **`audience_config`** — JSONB blob whose shape depends on `audience_source`. See the "Audience sources" section below.
- **`source_system`** + **`source_external_id`** — traceability. For SC-sourced campaigns: `source_system = 'sampling-central'`, `source_external_id = <audience_id>`. Lets us answer "which campaigns came from which SC audience" later.

#### `bulk_message_recipients` (additions)

```sql
ALTER TABLE bulk_message_recipients
  ADD COLUMN contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipients_contact_id ON bulk_message_recipients(contact_id) WHERE contact_id IS NOT NULL;
```

- **`contact_id`** — nullable FK. For flow campaigns, this MUST be populated (`triggerFlow()` needs a contact row). For template campaigns, it's populated when the audience source is `contacts` or `sampling-central`, and null for legacy CSV-only template rows.
- The existing `template_params` JSONB column is **reused as-is** for both paths. For template campaigns it's read by `resolveTemplateParams()` as today. For flow campaigns, the worker passes it as `Variables` to `triggerFlow()` so the flow's session is pre-populated with the audience row's data.

### Audience sources

**Three distinct shapes for `audience_config`:**

#### `audience_source = 'contacts'`

```json
{
  "filter": { /* ContactFilter tree, same shape as POST /api/contacts/search */ },
  "search": "optional string",
  "channel": "whatsapp" | "instagram" | null
}
```

Campaign create handler calls the existing contact filter resolver (extracted into `internal/services/contactfilter/resolver.go` if not already), gets matching contact IDs, inserts `bulk_message_recipients` rows with `contact_id` set and `template_params` empty (for template campaigns the user maps per-recipient data elsewhere, or sends without variables; for flow campaigns the flow runs with whatever vars the contact already has).

#### `audience_source = 'csv'`

```json
{
  "filename": "original-upload.csv",
  "row_count": 1247,
  "column_mapping": {
    "phone_number": "Phone",
    "customer_name": "Name",
    "city": "City"
  }
}
```

Campaign create handler:
1. Parses the uploaded CSV (multipart body, stored temporarily)
2. Maps CSV columns to expected fields using `column_mapping` (phone + optional variable columns)
3. Normalizes phones to E.164 (+91 prefix if 10-digit Indian, otherwise use as-is)
4. Find-or-creates contacts with `source:csv:{campaign_id}` auto-tag
5. Inserts recipient rows with `contact_id` + `template_params` built from the CSV row's variable columns

#### `audience_source = 'sampling-central'`

```json
{
  "audience_id": "sc-audience-abc123",
  "column_mapping": {
    "customer_name": "name",
    "city": "city",
    "order_id": "channel_contact_id"
  }
}
```

Campaign create handler:
1. Reads SC base URL + API key from org config (`organizations.sampling_central_base_url` + encrypted token) or falls back to env var (for dev)
2. Calls `POST {SC_BASE_URL}/api/external/audiences/{audience_id}/resolve` with the set of columns needed by `column_mapping` (plus `phone_number` implicitly)
3. SC returns the full claimant list (no pagination in v1)
4. Normalizes phones: prepends `+91` to each `phone_number` (since SC stores 10-digit Indian)
5. Find-or-creates contacts with `source:sampling-central:{audience_id}` auto-tag
6. Inserts recipient rows with `contact_id` + `template_params` built from the claimant row's fields via `column_mapping`

### Variable mapping

Both templates AND flows use the same storage shape: `bulk_message_recipients.template_params` is a `JSONB` map of `name → value`.

**Templates:** the existing `resolveTemplateParams(template, params)` at `internal/worker/worker.go:82` already handles named keys (it extracts `{{customer_name}}` from the body and looks up `params["customer_name"]`). Positional `{{1}}` is the fallback. No changes needed.

**Flows:** the worker, on the flow branch, passes `recipient.template_params` directly as the `Variables` field of `TriggerFlowParams`. `triggerFlow()` at `internal/handlers/chatbot.go:1615` already merges this into `session.SessionData`, so any text/template/condition node inside the flow that references `{{customer_name}}` resolves it from session data. **Zero new resolver code.**

The only new thing is the mapping UI in magic-flow, which lets the user map flow variable names to audience columns (CSV column names, SC column names, or contact custom fields) at campaign creation time. The mapping is applied by the campaign create handler — by the time recipient rows hit the DB, the mapping is already materialized into per-recipient `template_params`.

### Worker branch

```go
// internal/worker/worker.go — HandleRecipientJob (existing function, new branch)

if campaign.FlowID != nil {
    // Flow campaign path
    _, _, err := a.triggerFlow(handlers.TriggerFlowParams{
        OrgID:     campaign.OrganizationID,
        FlowID:    *campaign.FlowID,
        ContactID: *recipient.ContactID,
        Variables: recipient.TemplateParams, // reuse existing JSONB column
    })
    if err != nil {
        // Mark recipient failed with the error message
        a.markRecipientFailed(recipient, err)
        return
    }
    a.markRecipientSent(recipient, "") // no wamid for flows; session_id tracked separately
    return
}

// Existing template path unchanged
a.sendTemplateMessage(...)
```

The contract of `triggerFlow()` is:
- Loads the flow from cache
- Loads the contact
- Resolves the account via `resolveAccountForContact()`
- Creates or finds a `ChatbotSession` with `SessionData` pre-populated from `Variables`
- Starts the flow async via `a.startFlow()`
- Returns `(SessionID, ContactID, FlowName)` or an error

The flow runtime (`chatbot_processor.go`) handles everything after. If the first node is a template → template gets sent via the existing send path. If the first node is a session message and the contact is outside the 24hr window → WhatsApp API rejects → the async `startFlow` logs the error, the session enters a failed state, and the recipient's status gets updated by the existing error-path code. **No special-cased classifier or pre-flight check for window state.**

### sampling-central API contract (the thing Pratik will build)

**Endpoint:**

```
POST {SC_BASE_URL}/api/external/audiences/{audience_id}/resolve
Authorization: Bearer {sc_api_key}
Content-Type: application/json
```

`audience_id` maps to `ClaimantAudience.id` in SC's Prisma schema (`packages/prisma/schema.prisma:347`).

**Request body:**

```json
{
  "columns": ["phone_number", "name", "city", "pincode"]
}
```

- `columns` — array of `TableData` field names (from `apps/sampling-central/src/server/api/routers/claimant.ts:86`). Allowed values: `id`, `name`, `phone_number`, `address`, `status`, `city`, `state`, `pincode`, `created_at`, `channel_contact_id`. Server includes `phone_number` even if not listed.

**Response (200):**

```json
{
  "audience_id": "sc-audience-abc123",
  "audience_name": "Diwali Shoppers 2026",
  "audience_type": "static",
  "total_count": 12847,
  "claimants": [
    {
      "phone_number": "9560062621",
      "name": "Rahul Kumar",
      "city": "Mumbai",
      "pincode": "400001"
    }
  ]
}
```

- `audience_type` — `"static"` or `"dynamic"`, from `ClaimantAudience.type`. fs-whatsapp stores this on the campaign for debugging but doesn't behave differently based on it in v1.
- `total_count` — the length of `claimants`. Returned as a separate field for future pagination.
- `claimants` — every row, only the columns requested. Phone number is 10-digit unformatted (no country code).

**Error responses:**

```json
// 400 — invalid columns
{ "error": "invalid_columns", "message": "Unknown column 'email'", "invalid": ["email"] }

// 401 — missing or bad API key
{ "error": "unauthorized", "message": "Invalid API key" }

// 403 — API key cannot access this audience
{ "error": "forbidden", "message": "API key does not have access to audience sc-audience-abc123" }

// 404 — audience does not exist
{ "error": "audience_not_found", "message": "Audience sc-audience-abc123 does not exist" }

// 413 — audience too large for single-response (soft cap — 50k rows)
{ "error": "audience_too_large", "message": "Audience has 120000 members, max 50000 per request", "total_count": 120000 }

// 500 — internal error (claimant server down, DB error, etc.)
{ "error": "internal_error", "message": "..." }
```

**Soft cap:** 50,000 rows per response. If an audience exceeds this, SC returns `413 audience_too_large`. fs-whatsapp surfaces the error verbatim to the user; they can either split the audience or wait for pagination support.

**Auth model:** SC issues an API key per Freestand organization. fs-whatsapp stores it in `organizations.sampling_central_api_key` (encrypted at rest) and `organizations.sampling_central_base_url`. First request: admin user pastes the values into fs-whatsapp's org settings (new Settings → Integrations page, or reuse API Keys).

### Magic-flow UI changes

#### Navigation

Add nav item in `components/app-sidebar.tsx`:

```tsx
{ title: "Campaigns", url: "/campaigns", icon: Megaphone, feature: "campaigns" }
```

The `campaigns` feature already exists in the 12 flat features — no RBAC changes needed backend-side.

#### Pages

- `app/campaigns/page.tsx` — list view (table with name, type, status, counters, created_at)
- `app/campaigns/new/page.tsx` (or drawer on the list page) — create form
- `app/campaigns/[id]/page.tsx` — detail view with live progress + recipient table

#### React Query hooks

`hooks/queries/use-campaigns.ts`:

```ts
useCampaigns()              // list
useCampaign(id)             // detail
useCampaignRecipients(id)   // paginated recipient table
useCreateCampaign()         // mutation
useStartCampaign(id)
usePauseCampaign(id)
useCancelCampaign(id)
useDeleteCampaign(id)
usePreviewAudience()        // for the "Fetch" button — calls a new helper endpoint that returns total_count + column list without materializing recipients
```

Query keys follow the existing factory pattern in `hooks/queries/query-keys.ts`.

#### Create form UX

1. **Name** — text input
2. **Account** — shadcn Combobox of connected accounts (`useAccounts()`)
3. **Type** — segmented control: `Template` | `Flow`
4. **Template or Flow picker** — searchable combobox
   - Template: `useTemplates("approved")` — shows approved templates
   - Flow: `useChatbotFlows()` — shows enabled flows
5. **Audience source** — tabs: `Contacts` | `CSV` | `Sampling Central`
6. **Audience picker** (depends on tab):
   - **Contacts:** reuse the existing `useContactFilterUI()` hook. Shows a filter cascader. Live count underneath via `useFilteredContacts().data?.total`.
   - **CSV:** file picker → column mapping screen → list of expected fields (phone + any template/flow variables) with a dropdown next to each picking a CSV column
   - **Sampling Central:** single text input for `audience_id`. "Fetch" button calls `usePreviewAudience({ source: 'sampling-central', audience_id })` which returns `{ name, total_count, available_columns }`. Then shows a mapping form (one row per flow variable / template placeholder → dropdown of SC columns)
7. **Info banner** (flow type only): *"If your flow doesn't start with a template message, only contacts who've messaged you in the last 24 hours will receive it."*
8. **Schedule** — radio: `Send now` | `Schedule for later` + datetime picker
9. **Buttons:** `Save Draft` | `Start Campaign`

Variable mapping form is only shown once the template/flow is picked AND the audience has columns available. Flow variables come from `GET /api/chatbot/flows/{id}/variables` (new helper endpoint); template placeholders from the template body via `extractParameterNames()`.

#### Detail page

- Header with name, type, status badge, account name, source badge (for SC-sourced campaigns, shows the audience ID and a link to SC)
- Counter cards: Queued / Sent / Delivered / Read / Failed
- Progress bar (derived from counters)
- Action buttons: Pause / Resume / Cancel (enabled based on status)
- Recipient table (paginated): phone, name, status, session_id (for flow campaigns), error message (if failed)
- Live WebSocket updates via existing `CampaignStatsUpdate` event — React Query's `queryClient.invalidateQueries` on message receipt

## API contracts (fs-whatsapp side)

### `POST /api/campaigns` (extended)

Request body (new/changed fields marked):

```json
{
  "name": "Diwali Promo 2026",
  "account_name": "freestand_whatsapp_prod",
  "template_id": "uuid" | null,       // XOR with flow_id
  "flow_id": "uuid" | null,           // NEW, XOR with template_id
  "audience_source": "sampling-central", // NEW: contacts | csv | sampling-central
  "audience_config": { /* see below */ }, // NEW, shape varies by source
  "schedule_at": "2026-04-20T10:00:00Z" | null
}
```

Validation:
- Exactly one of `template_id` / `flow_id` set
- `account_name` exists and belongs to the caller's org
- `audience_source` is a known value
- `audience_config` matches the expected shape for that source
- For flow campaigns, every recipient MUST get a `contact_id` → audience_source `csv` or `contacts` or `sampling-central` (no legacy CSV-only path allowed)

Response (201):

```json
{
  "campaign_id": "uuid",
  "status": "queued",
  "total_recipients": 12847,
  "contacts_created": 8634,
  "contacts_reused": 4213,
  "invalid_phones": 0
}
```

### `POST /api/campaigns/preview-audience` (new)

Lightweight preflight that returns audience metadata WITHOUT creating a campaign or materializing recipients.

Request body:

```json
{ "source": "sampling-central", "audience_id": "sc-audience-abc123" }
// OR
{ "source": "contacts", "filter": { /* ContactFilter */ }, "search": "", "channel": null }
// OR
{ "source": "csv", "upload_id": "temp-upload-abc" }  // after uploading CSV to a separate staging endpoint
```

Response:

```json
{
  "total_count": 12847,
  "name": "Diwali Shoppers 2026",
  "available_columns": ["name", "city", "state", "pincode", "address", "channel_contact_id"]
}
```

For SC source: proxies to SC's resolve endpoint with `columns: ["phone_number"]` just to get the count, and returns `available_columns` from a hardcoded list (the 10 `TableData` fields) since SC doesn't have a "describe schema" endpoint in v1.

### `GET /api/chatbot/flows/{id}/variables` (new helper)

Returns the set of variable names referenced anywhere in a flow's node graph:

```json
{
  "variables": ["customer_name", "city", "order_id"]
}
```

Implementation: loads the flow's steps, walks their content (message body, button labels, condition operands), extracts `{{var}}` names via `extractParameterNames()` (reused from template code). Deduplicated, sorted.

Used by magic-flow to populate the variable mapping form when the user picks a flow.

## Flow dry run (what "live" looks like)

Detailed walkthrough is in the conversation log; summary:

1. User in magic-flow opens `/campaigns`, clicks "New Campaign"
2. Fills name, picks account, picks Type=Flow, picks flow `diwali_promo_v2`
3. Magic-flow fetches the flow's variables via `GET /api/chatbot/flows/{id}/variables` → `["customer_name", "city", "order_id"]`
4. User picks audience source = Sampling Central, pastes audience ID, clicks Fetch
5. Magic-flow calls `POST /api/campaigns/preview-audience` → backend calls SC → returns `{total_count: 12847, available_columns: [...]}`
6. Variable mapping form appears — user maps each flow variable to an SC column
7. User clicks Start Campaign
8. Magic-flow POSTs to `POST /api/campaigns` with full config
9. Backend calls SC's resolve endpoint → gets 12,847 claimants → normalizes phones → find-or-creates contacts (8,634 new, 4,213 reused) → inserts recipient rows with `template_params` built from the mapping → enqueues to Redis
10. User redirected to `/campaigns/{id}` → sees live progress
11. Worker consumes jobs → for each, calls `triggerFlow()` with pre-populated variables → flow runs → first template message sent → recipient sees it on WhatsApp
12. When user taps a button → chatbot_processor routes them through the rest of the flow normally

## Known gaps / risks

1. **SC call blocks campaign creation.** For 12k-50k audiences, the resolve call can take 5-15s. The campaign creation handler holds the HTTP request open during this time. Fine for v1; if it becomes an issue, move resolution into a background job with a `resolving` status that flips to `queued` once done.
2. **SC might return a phone we can't normalize.** If SC ever returns a non-10-digit non-international phone, our `+91` prepend heuristic is wrong. For v1, we accept only:
   - 10 digits → prepend `+91`
   - 12 digits starting with `91` → prepend `+`
   - Already starts with `+` → use as-is
   - Anything else → mark as `invalid_phone` in the response and skip that recipient
3. **Contact auto-tagging will grow the tag list.** Every broadcast creates a tag like `source:sampling-central:sc-audience-abc123`. Over time this clutters the tag dropdown in chat filters. Mitigation: the chat tag filter list can exclude tags prefixed with `source:` in a follow-up UI tweak.
4. **Flow campaigns have no retry semantics beyond what `triggerFlow` gives.** If `triggerFlow` fails because the contact has an active session on another flow, we mark it failed and move on. No automatic retry. User can manually re-run the campaign for failed recipients.
5. **Variable mapping is not validated against template/flow placeholders at create time for flows.** Templates validate strictly (mapping must cover every placeholder). Flows don't — the flow runtime degrades gracefully on missing variables. If a user maps nothing and the flow references `{{customer_name}}`, they'll see `{{customer_name}}` literally in the sent message. UX improvement for v1.1: show a warning if mapping doesn't cover all flow variables.

## Open questions (not blocking)

1. **Where does the SC API key live — per-org or global env?** Per-org is more flexible (multi-tenant Freestand deploys pointing at different SC instances); global env is simpler (single-tenant). Going with per-org stored on the `organizations` table, falling back to env var for dev.
2. **What happens when a sampling-central audience is "dynamic" and the filter changes between campaign creation and re-send?** Not an issue today — we materialize once at creation. If we ever add "resend failed recipients", we'll snapshot the audience state at creation and reuse the stored recipient rows, NOT re-query SC.
3. **Do we support manually editing a draft campaign's recipient list?** No in v1. Drafts save the audience config; recipients are materialized when the campaign transitions to `queued`/`running`.
