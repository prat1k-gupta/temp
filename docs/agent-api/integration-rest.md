# Freestand REST API — Integration Guide

Programmatic CRUD for flows, templates, broadcasts, and accounts. Use this when you don't need natural language — you already know what you want to do.

For natural-language flow creation and editing, see the [agent endpoints](./integration-guide.md). For complete API shapes, see [reference.md](./reference.md).

---

## When to use REST vs the agent endpoints

| You want to... | Use |
|---|---|
| Create a flow from a sentence ("a feedback flow that asks 3 questions") | **Agent** — `POST /v1/agent/flows` |
| Edit a flow from a sentence ("change the welcome message") | **Agent** — `POST /v1/agent/flows/{id}/edit` |
| List, get, delete, publish, trigger, or read variables of a flow | **REST** — `/v1/flows/*` |
| Anything with templates (CRUD, submit for approval, sync from Meta) | **REST** — `/v1/templates/*` |
| Anything with broadcasts (preview audience, create, start, pause, status) | **REST** — `/v1/campaigns/*` |
| List the WhatsApp accounts in your org | **REST** — `/v1/accounts` |

REST is deterministic, cheap (60-120 requests/min), and predictable. The agent endpoints are slow, expensive (10/min), and use an LLM under the hood — only use them when natural language genuinely helps.

---

## Authentication

All endpoints require `X-API-Key: whm_*` header authentication.

1. **Get a key:** Settings → API Keys → General → Create Key
2. **Store it as an env var** so you don't paste it into shell history:

```bash
export FREESTAND_API_KEY="whm_live_xxxxxxxxxxxx"
```

3. **Send it on every request:**

```bash
curl -H "X-API-Key: $FREESTAND_API_KEY" https://fs-flow.vercel.app/api/v1/accounts
```

Wrong key or no key → `401 unauthorized`.

---

## Rate limits

Per API key, per bucket, sliding 60-second windows:

| Bucket | Limit | Used by |
|---|---|---|
| `cheap` | 120/min | All `GET` endpoints |
| `write` | 60/min | `POST`/`PUT`/`DELETE` on templates and campaigns |
| `publish` | 30/min | Flow publish, campaign start/pause/cancel, template submit |
| `expensive` | 10/min | Agent endpoints (`/v1/agent/*`) — unchanged |

Hit the limit → `429 rate_limited`. Back off and retry. The response body includes a hint on when to retry, but a fixed 5-second backoff is fine for most callers.

---

## Endpoint reference

### Accounts

| Method | Path | Bucket | Purpose |
|---|---|---|---|
| GET | `/v1/accounts` | cheap | List connected WhatsApp accounts in your org |

### Flows

| Method | Path | Bucket | Purpose |
|---|---|---|---|
| GET | `/v1/flows` | cheap | List flows |
| GET | `/v1/flows/{id}` | cheap | Get a single flow |
| PATCH | `/v1/flows/{id}` | write | Update metadata (name, keywords, match type, ref, description, enabled). Cascades to the runtime on published flows — no re-publish needed. |
| DELETE | `/v1/flows/{id}` | write | Delete a flow |
| POST | `/v1/flows/{id}/publish` | publish | Publish the latest draft (idempotent) |
| POST | `/v1/flows/{id}/trigger` | write | Send the flow to a phone number for testing |
| GET | `/v1/flows/{id}/variables` | cheap | List variables the flow collects/references |

### Templates

| Method | Path | Bucket | Purpose |
|---|---|---|---|
| GET | `/v1/templates?status=APPROVED\|PENDING\|DRAFT\|REJECTED` | cheap | List templates, optionally filtered by status |
| POST | `/v1/templates` | write | Create a draft template |
| GET | `/v1/templates/{id}` | cheap | Get a template (includes `rejection_reason` if REJECTED) |
| PUT | `/v1/templates/{id}` | write | Update a draft (only DRAFT and REJECTED templates can be edited) |
| DELETE | `/v1/templates/{id}` | write | Delete a draft |
| POST | `/v1/templates/{id}/submit` | publish | Submit for Meta approval |
| POST | `/v1/templates/sync` | write | Force-resync from Meta |

### Campaigns (broadcasts)

| Method | Path | Bucket | Purpose |
|---|---|---|---|
| GET | `/v1/campaigns?status=...` | cheap | List campaigns, optional status filter |
| POST | `/v1/campaigns` | write | Create a draft (or scheduled) campaign |
| GET | `/v1/campaigns/{id}` | cheap | Get campaign status, recipient counts, delivery stats |
| PUT | `/v1/campaigns/{id}` | write | Reschedule (`{ "scheduled_at": "..." }`) |
| DELETE | `/v1/campaigns/{id}` | write | Cancel |
| POST | `/v1/campaigns/{id}/start` | publish | Start sending |
| POST | `/v1/campaigns/{id}/pause` | publish | Pause an in-flight campaign |
| POST | `/v1/campaigns/{id}/cancel` | publish | Cancel permanently |
| POST | `/v1/campaigns/preview-audience` | write | Preview recipient count for an audience filter |

Every campaign response (list, detail, create) carries top-level `audience_id` and `audience_name` for `freestand-claimant` sources so callers don't have to dig into `audience_config` JSONB or resolve the name out-of-band. `audience_id` is always populated; `audience_name` is best-effort — resolved from go-backend with a short cache and omitted if upstream is unreachable.

---

## Happy-path walkthrough — broadcast a flow

The most common multi-step workflow. Five calls.

### 1. Find your account name

```bash
curl -H "X-API-Key: $FREESTAND_API_KEY" \
  https://fs-flow.vercel.app/api/v1/accounts
```

```json
{
  "accounts": [
    {
      "id": "acct_01H...",
      "name": "default",
      "phone_number": "+15551234567",
      "platform_url": "https://fs-flow.vercel.app/settings/accounts/acct_01H..."
    }
  ]
}
```

Save `accounts[0].name` — every campaign needs it.

### 2. Find a flow to broadcast

```bash
curl -H "X-API-Key: $FREESTAND_API_KEY" \
  "https://fs-flow.vercel.app/api/v1/flows?limit=10"
```

```json
{
  "flows": [
    {
      "flow_id": "f_01H...",
      "name": "Diwali promo",
      "trigger_keyword": "diwali",
      "node_count": 6,
      "platform_url": "https://fs-flow.vercel.app/flow/f_01H..."
    }
  ]
}
```

If the flow isn't in the list, log into the platform and check it's published — only published flows are broadcastable.

### 3. Preview the audience

Always preview before creating. The count is the only sanity check on your filter — if it returns 0 or 100,000 when you expected 1,500, something's wrong.

```bash
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "contacts",
    "audience_config": {
      "channel": "whatsapp",
      "filter": { "tags": ["diwali-2026"] }
    }
  }' \
  https://fs-flow.vercel.app/api/v1/campaigns/preview-audience
```

```json
{
  "total_count": 1247,
  "audience_type": "contacts",
  "sample": ["+15551111111", "+15551111112", "+15551111113"]
}
```

If `total_count` looks right, proceed. Otherwise, tweak the filter and re-preview.

### 4. Create the campaign

```bash
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Diwali promo — Delhi VIPs",
    "flow_id": "f_01H...",
    "account_name": "default",
    "audience_source": "contacts",
    "audience_config": {
      "channel": "whatsapp",
      "filter": { "tags": ["diwali-2026"] }
    },
    "scheduled_at": "2026-04-21T14:00:00Z"
  }' \
  https://fs-flow.vercel.app/api/v1/campaigns
```

```json
{
  "id": "cmp_01H...",
  "name": "Diwali promo — Delhi VIPs",
  "status": "scheduled",
  "scheduled_at": "2026-04-21T14:00:00Z",
  "total_recipients": 1247,
  "platform_url": "https://fs-flow.vercel.app/campaigns/cmp_01H...",
  "warnings": [
    {
      "code": "first_message_not_template",
      "message": "The first user-facing message in this flow isn't a template. Non-template first messages can only be delivered to recipients within the 24-hour reply window. Cold recipients will not receive this broadcast."
    }
  ]
}
```

**Read the `warnings[]` array.** They're non-blocking but they tell you what will silently fail. See [warnings](#warnings) below.

Omit `scheduled_at` to create a draft you'll start manually.

### 5. Start the campaign (skip if you scheduled)

```bash
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  https://fs-flow.vercel.app/api/v1/campaigns/cmp_01H.../start
```

```json
{
  "id": "cmp_01H...",
  "status": "processing",
  "started_at": "2026-04-20T14:25:00Z",
  "platform_url": "https://fs-flow.vercel.app/campaigns/cmp_01H..."
}
```

If you get `409 campaign_materializing` instead, the audience is still being assembled — see [polling pattern](#polling-the-materializing-status) below.

### 6. Watch progress

```bash
curl -H "X-API-Key: $FREESTAND_API_KEY" \
  https://fs-flow.vercel.app/api/v1/campaigns/cmp_01H...
```

```json
{
  "id": "cmp_01H...",
  "status": "processing",
  "total_recipients": 1247,
  "sent": 843,
  "delivered": 801,
  "read": 412,
  "failed": 12,
  "platform_url": "https://fs-flow.vercel.app/campaigns/cmp_01H..."
}
```

Or just open `platform_url` in a browser — the platform shows live counts and per-recipient status.

---

## Editing flow metadata without re-publishing

`PATCH /v1/flows/{id}` updates **metadata only** — rename a flow, swap the trigger keyword, flip the match mode, change the wa.me ref, rewrite the description, or pause/resume the runtime. For **content** changes (add/remove nodes, edit messages) use `POST /v1/agent/flows/{id}/edit`.

All fields optional; at least one is required.

```json
PATCH /v1/flows/{id}
{
  "name": "Pedigree — Shop & Save",
  "description": "Inbound offer claim flow",
  "trigger_keywords": ["offer", "deal"],
  "trigger_match_type": "exact",
  "trigger_ref": "summer-2025",
  "is_enabled": true
}
```

| Field | Type | Notes |
|---|---|---|
| `name` | string | Display name (builder, chat logs, admin UI). |
| `description` | string | Free text, ≤1000 chars. |
| `trigger_keywords` | string[] | Full replace. Max 20 items, each ≤50 chars. |
| `trigger_match_type` | enum | `exact`, `contains_whole_word`, `contains`, `starts_with`. |
| `trigger_ref` | string | Ref param for `wa.me/...?ref=xxx` attribution. |
| `is_enabled` | boolean | Write-only. `false` pauses the runtime (bot ignores the flow); `true` resumes. Not returned on reads — inspect `chatbot_flows` if you need the current value. |

**Effects are immediate on published flows.** The backend cascades these fields into the runtime row in the same transaction as the project write, so there's no re-publish dance. On **unpublished** drafts only the project row changes; keyword/match-type/ref/is_enabled have no runtime to hit yet and will take effect on first publish.

### Appending / removing a single keyword

The PATCH body takes the full array. To append, read-modify-write:

```bash
current=$(curl -sH "X-API-Key: $KEY" https://fs-flow.vercel.app/api/v1/flows/$ID | jq -c '.project.trigger_keywords')
curl -X PATCH -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d "{\"trigger_keywords\": $(echo $current | jq '. + ["deal"]')}" \
  https://fs-flow.vercel.app/api/v1/flows/$ID
```

### Errors

| Code | Status | When |
|---|---|---|
| `invalid_param` | 400 | Empty body, unknown `trigger_match_type` enum, keywords array over 20 items, etc. |
| `flow_not_found` | 404 | No project with that ID in your org. |

---

## `platform_url` — when your UI can't show everything

Every flow / template / campaign / account response includes a `platform_url` pointing at the Freestand UI for that resource. Use it to deep-link instead of replicating live state in your own app:

- **Materializing campaigns** — your poll sees `status: materializing`, but the platform UI shows progress like `3,200 / 8,900 recipients fetched`.
- **PENDING templates** — your `GET /v1/templates/{id}` returns `status: PENDING`, but the platform shows Meta approval flow + ETAs + rejection reasons.
- **Running campaigns** — the platform has live delivery/read counts, per-recipient retries, and error breakdowns you'd otherwise rebuild.
- **REJECTED templates** — the platform shows Meta's rejection text and an edit-and-resubmit button.

A simple `<a href="{response.platform_url}">View live status →</a>` button covers the long tail of states that aren't worth re-implementing.

---

## Status lifecycles

### Templates

```
DRAFT ──── submit ────▶ PENDING ──┬──▶ APPROVED ────▶ (broadcast-ready)
                                  │
                                  ▶  REJECTED ──── edit ──▶ DRAFT (loop)
```

- `DRAFT` — you just created or edited it. Not sendable.
- `PENDING` — submitted to Meta. Typically minutes to hours.
- `APPROVED` — sendable. Use in flows and campaigns.
- `REJECTED` — Meta rejected; check `rejection_reason`. Edit (PUT) → resubmit.
- `DISABLED` / `PAUSED` — Meta side, less common.

You can broadcast a flow whose templates are still PENDING **only if the campaign is scheduled far enough in the future** that Meta has time to approve. Immediate sends with non-APPROVED templates are rejected with `409 template_not_approved_for_immediate_send`. See [warnings](#warnings).

### Campaigns

```
draft ─── start ────▶ queued ──▶ processing ──┬──▶ completed
   │                                          │
   │                                          ▶ paused ─── start ──▶ processing
   │                                          │
   │                                          ▶ cancelled / failed
   │
   └── (freestand-claimant audience only) ──▶ materializing ──▶ scheduled / draft

(scheduled) ── time arrives ──▶ queued ──▶ processing ──▶ completed
```

- `draft` — created, not started. You can still `PUT` to reschedule, `DELETE` to cancel.
- `materializing` — recipients still being fetched (only freestand-claimant audiences). Transient. **You cannot start a materializing campaign** — wait for it to leave this state.
- `scheduled` — queued for a future `scheduled_at`. Can be rescheduled with `PUT`.
- `queued` → `processing` — sending in progress.
- `paused` — pause/resume mid-flight.
- `completed` / `cancelled` / `failed` — terminal.

---

## Warnings

`POST /v1/campaigns` may return a `warnings[]` array with informational messages. They're non-blocking — the campaign is created either way. Surface them to your user, don't silently swallow.

### `first_message_not_template`

```json
{
  "code": "first_message_not_template",
  "message": "The first user-facing message in this flow isn't a template. Non-template first messages can only be delivered to recipients within the 24-hour reply window. Cold recipients will not receive this broadcast."
}
```

**What it means.** WhatsApp only allows templates as the first message to a contact who hasn't replied to you in the last 24 hours. Your flow's first user-facing message is plain text or a question, not a template. Cold recipients will silently fail.

**What to do.** Either:
- Edit the flow to put a `templateMessage` at the top (use `POST /v1/agent/flows/{id}/edit`).
- Or proceed knowing this is for warm recipients only (e.g., a follow-up to people who messaged you yesterday).

### `template_pending_approval`

```json
{
  "code": "template_pending_approval",
  "message": "this flow uses non-APPROVED templates: \"order_confirm\" (PENDING). The scheduled send will only succeed if Meta approves them by then; otherwise every recipient fails",
  "template_name": "order_confirm"
}
```

**What it means.** Your scheduled campaign references a template that's still PENDING (or DRAFT or REJECTED) Meta approval. If Meta hasn't approved by `scheduled_at`, every recipient fails.

**What to do.** Either:
- Submit the template now (`POST /v1/templates/{id}/submit`) and check on it before the scheduled time.
- Or swap the flow to use an APPROVED template.
- Or open `template.platform_url` and check approval status.

---

## Error codes

Errors return as `{ "code": "...", "message": "..." }` with the appropriate HTTP status. Common codes:

| Code | HTTP | When | What to do |
|---|---|---|---|
| `unauthorized` | 401 | Missing or invalid `whm_*` key | Check the env var, regenerate the key if needed |
| `rate_limited` | 429 | Hit the per-bucket limit | Back off ~5 seconds and retry |
| `invalid_param` | 400 | Request body or query failed validation | Read `message` for which field |
| `flow_not_found` / `template_not_found` / `campaign_not_found` | 404 | Resource doesn't exist or isn't in your org | Check the ID, check it's the right org's key |
| `keyword_conflict` | 409 | Trigger keyword already used by another flow | Pick a different keyword |
| `template_not_approved_for_immediate_send` | 409 | `POST /v1/campaigns` with no `scheduled_at` and a non-APPROVED template | Either submit + wait for approval, or set `scheduled_at` far enough in the future |
| `campaign_materializing` | 409 | `POST /v1/campaigns/{id}/start` while audience is still being fetched | Poll status, retry when not materializing |
| `internal_error` | 500 | Something broke on our side | Retry once. If it persists, contact support |

### Polling the materializing status

When you `POST /v1/campaigns/{id}/start` for a freestand-claimant campaign that just got created, you may see:

```bash
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  https://fs-flow.vercel.app/api/v1/campaigns/cmp_01H.../start
```

```json
{
  "code": "campaign_materializing",
  "message": "Campaign recipients are still being fetched. Wait until the campaign leaves the materializing status before starting it."
}
```

Poll the campaign every few seconds until `status` ≠ `materializing`, then retry the start:

```bash
while true; do
  STATUS=$(curl -s -H "X-API-Key: $FREESTAND_API_KEY" \
    https://fs-flow.vercel.app/api/v1/campaigns/cmp_01H... | jq -r .status)
  [ "$STATUS" != "materializing" ] && break
  sleep 3
done
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  https://fs-flow.vercel.app/api/v1/campaigns/cmp_01H.../start
```

In production, use a job queue with exponential backoff — most materializations finish in 5-30 seconds, but big freestand-claimant audiences can take a minute or two.

---

## Worked examples

### Create + submit a template, then broadcast with it

```bash
# 1. Create the template (DRAFT)
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "diwali_promo_2026",
    "language": "en_US",
    "category": "MARKETING",
    "account_name": "default",
    "components": [
      { "type": "BODY", "text": "Hi {{1}}! Diwali sale is live — 20% off. Reply YES to claim." }
    ]
  }' \
  https://fs-flow.vercel.app/api/v1/templates

# Returns { "id": "tpl_01H...", "status": "DRAFT", "platform_url": "..." }

# 2. Submit for Meta approval
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  https://fs-flow.vercel.app/api/v1/templates/tpl_01H.../submit

# Returns { "id": "tpl_01H...", "status": "PENDING", "platform_url": "..." }

# 3. (Wait. Meta usually approves in minutes, sometimes hours.
#     Either poll GET /v1/templates/tpl_01H... or open platform_url.)

# 4. Build a flow that uses the template (use the agent endpoint here —
#    natural language is faster than hand-crafting a flow JSON):
curl -N -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Diwali Sale 2026",
    "instruction": "Send the diwali_promo_2026 template, then if user says YES, ask for their address.",
    "channel": "whatsapp",
    "trigger_keyword": "diwali"
  }' \
  https://fs-flow.vercel.app/api/v1/agent/flows

# 5. Then preview-audience + create campaign + start (steps 3-5 above).
```

### Test-send a flow to your own phone

Use `POST /v1/flows/{id}/trigger` to send a published flow to a single phone number. Useful for QA before broadcasting.

```bash
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+919876543210",
    "account_name": "default",
    "variables": {
      "customer_name": "Asha",
      "order_id": "ORD-99",
      "discount_percent": "30"
    }
  }' \
  https://fs-flow.vercel.app/api/v1/flows/f_01H.../trigger
```

```json
{
  "contact_id": "ct_01H...",
  "flow_name": "Diwali promo",
  "session_id": "ss_01H..."
}
```

**`variables` is mandatory if the flow's first user-facing node is a `templateMessage` with `{{name}}` body parameters.** If you omit them, Meta will silently reject the send with error 131008 ("template body parameters cannot be empty"). The 200 response just means the session was created — delivery happens asynchronously, check `platform_url` for status.

The trigger forces a new session, so any stuck prior session on the contact won't block the test.

### Idempotently start a campaign

```bash
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  https://fs-flow.vercel.app/api/v1/campaigns/cmp_01H.../start
```

Already-started campaigns return their current state without error. You can safely retry on network failures.

### Cancel a scheduled campaign

```bash
curl -X DELETE -H "X-API-Key: $FREESTAND_API_KEY" \
  https://fs-flow.vercel.app/api/v1/campaigns/cmp_01H...
```

Or `POST /v1/campaigns/cmp_01H.../cancel` — same result. `DELETE` is the REST-y way; `cancel` exists so the URL reads naturally if you're chaining actions.

### Reschedule a campaign

```bash
curl -X PUT -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "scheduled_at": "2026-04-22T18:00:00Z" }' \
  https://fs-flow.vercel.app/api/v1/campaigns/cmp_01H...
```

Only `draft` and `scheduled` campaigns can be rescheduled. Once it's `processing` or terminal, `PUT` returns 409.

### Broadcast to a freestand-claimant audience

Use this when your audience lives in an external Freestand claimant audience (e.g., a list of users from a campaign-tracking system, with extra columns like `order_status`, `waybill_number`, etc.) instead of your org contacts DB.

The flow is the same shape as the contacts example, but with two key differences:
1. `audience_config` carries an `audience_id` (UUID) and a `column_mapping` instead of a contact filter.
2. The campaign returns `status: "materializing"` while recipients are fetched in the background. You **must wait** for it to leave `materializing` before starting.

#### 1. Preview the audience

```bash
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "freestand-claimant",
    "audience_config": {
      "audience_id": "aud_01H..."
    }
  }' \
  https://fs-flow.vercel.app/api/v1/campaigns/preview-audience
```

```json
{
  "total_count": 8923,
  "audience_id": "aud_01H...",
  "audience_type": "freestand-claimant",
  "audience_name": "Diwali Sale Claimants — Round 2",
  "snapshot_date": "2026-04-19T22:00:00Z",
  "available_columns": [
    "name", "city", "state", "pincode", "country", "address",
    "status", "claim_date", "campaign_name", "skus",
    "utm_source", "order_status", "delivery_status", "waybill_number"
  ]
}
```

The response echoes the `audience_id` you sent so you can correlate a preview back to its request without client-side bookkeeping. `available_columns` lists the 14 fields the claimant audience exposes — you can map any of them to your flow's variables in step 2.

#### 2. Create the campaign with `column_mapping`

`column_mapping` tells the runtime: "When sending the flow to each recipient, set the flow variable `<key>` to the value of the claimant column `<value>`." This is how you personalize messages with claimant-specific data.

```bash
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Diwali Sale — Round 2 fulfillment update",
    "flow_id": "f_01H...",
    "account_name": "default",
    "audience_source": "freestand-claimant",
    "audience_config": {
      "audience_id": "aud_01H...",
      "column_mapping": {
        "customer_name": "name",
        "tracking_id": "waybill_number",
        "order_state": "order_status"
      }
    }
  }' \
  https://fs-flow.vercel.app/api/v1/campaigns
```

```json
{
  "id": "cmp_02H...",
  "name": "Diwali Sale — Round 2 fulfillment update",
  "status": "materializing",
  "total_recipients": null,
  "audience_total": 8923,
  "audience_source": "freestand-claimant",
  "audience_id": "aud_01H...",
  "audience_name": "Diwali Sale Claimants — Round 2",
  "platform_url": "https://fs-flow.vercel.app/campaigns/cmp_02H..."
}
```

Note `status: "materializing"` and `total_recipients: null`. The runtime is fetching the recipients in the background. **Do not call `start` yet** — you'll get `409 campaign_materializing`.

#### 3. Poll until materialization completes

```bash
while true; do
  RESP=$(curl -s -H "X-API-Key: $FREESTAND_API_KEY" \
    https://fs-flow.vercel.app/api/v1/campaigns/cmp_02H...)
  STATUS=$(echo "$RESP" | jq -r .status)
  MATERIALIZED=$(echo "$RESP" | jq -r .materialized_count)
  TOTAL=$(echo "$RESP" | jq -r .audience_total)
  echo "status=$STATUS  $MATERIALIZED / $TOTAL"
  [ "$STATUS" != "materializing" ] && break
  sleep 5
done
```

Typical output:

```
status=materializing  0 / 8923
status=materializing  3200 / 8923
status=materializing  6800 / 8923
status=draft  8923 / 8923
```

The campaign transitions `materializing → draft` (or `scheduled` if you passed `scheduled_at`).

#### 4. Start

```bash
curl -X POST -H "X-API-Key: $FREESTAND_API_KEY" \
  https://fs-flow.vercel.app/api/v1/campaigns/cmp_02H.../start
```

```json
{
  "id": "cmp_02H...",
  "status": "processing",
  "total_recipients": 8923,
  "started_at": "2026-04-20T15:00:00Z",
  "platform_url": "https://fs-flow.vercel.app/campaigns/cmp_02H..."
}
```

#### Notes specific to freestand-claimant

- **Allowed `column_mapping` values** (right-hand side of each key) — `name, city, state, pincode, country, address, status, claim_date, campaign_name, skus, utm_source, order_status, delivery_status, waybill_number`. Anything else is rejected with `400 invalid_param`.
- **Variable names** (left-hand side) must match `storeAs` fields in the flow's `question` / `quickReply` / `interactiveList` nodes — that's what the flow's downstream message templates reference as `{{customer_name}}`, `{{tracking_id}}`, etc.
- **Materialization is one-shot** — if you cancel the campaign and re-create it for the same `audience_id`, the runtime materializes again. There's no caching.
- **Scheduling works the same way:** add `scheduled_at` in step 2 to get `materializing → scheduled` instead of `materializing → draft`. The scheduler picks it up at the scheduled time.

---

## FAQ

**Do I need to call `preview-audience` before `create campaign`?**

It's not enforced server-side, but you should. The count is the only sanity check on your filter. Skipping it means you find out you targeted the wrong people only after you've sent.

**Can I broadcast a flow that has no template at all (only `apiFetch` / `action` nodes)?**

Yes. Pure action / data-pipeline broadcasts are valid — the runtime executes per recipient without sending any WhatsApp message. You'll get no `first_message_not_template` warning because there's no first user-facing message to check.

**Can I broadcast a flow whose first node is `apiFetch → templateMessage`?**

Yes. The advisory walks past server-side nodes (`apiFetch`, `action`, `transfer`, `condition`, `flowComplete`, integrations) when checking. The first **user-facing** node is what matters — if it's a template, no warning fires.

**Where do I find rejection reasons for REJECTED templates?**

`GET /v1/templates/{id}` returns the full template including `rejection_reason`. Or open `template.platform_url` — the UI also shows Meta's exact text and offers an edit form.

**What's the difference between `audience_source: "contacts"` and `"freestand-claimant"`?**

- `contacts` — your org's WhatsApp contacts DB. Filter by tags, search, channel.
- `freestand-claimant` — a Freestand claimant audience (managed externally). Pass `audience_id` and `column_mapping` in `audience_config`. Materialization is async — campaign starts in `materializing` status while recipients are fetched.

---

## Known limitations

A few rough edges to be aware of (tracked in [magic-flow#95](https://github.com/freestandtech/magic-flow/issues/95)):

- **Project publish state has three flags** — `has_published`, `latest_version.is_published`, and `published_flow_id`. They can disagree (e.g. `has_published: false` while a non-null `published_flow_id` points at a deployed-but-stale runtime version). When in doubt, the **runtime** is what broadcasts use, not the latest draft.
- **`/v1/flows/{id}/variables` reflects the deployed runtime, not the unpublished draft.** If you edit a flow in the builder and don't publish, new `storeAs` values won't show up here. Cross-check `has_published` if a variable seems missing.
- **Backend errors may include implementation details** in the `message` field for now (SQL state codes, vendor codes). This is being cleaned up — write integration code defensively against the structured `code` field, not free-form message text.

---

## Support

- **Issues / questions:** github.com/freestandtech/magic-flow/issues
- **API status:** check `platform_url` on any resource — if the UI loads, the API is up
- **Spec history:** `docs/superpowers/specs/` (engineering reference)
