# Phase 3: Frontend + AI Tools for Go-Backend Claimant Audience Source (magic-flow)

> **🚧 PRE-FLIGHT (added 2026-04-18, after this plan was written):** campaign scheduling shipped to magic-flow main after this plan was authored. Before executing any task below, run `git pull origin main`, skim the scheduling diff, and reconcile the following touchpoints: `AudienceSource` / `CampaignStatus` TypeScript unions (Task 1 — scheduler may have added its own status values), `create_campaign` / `get_campaign_status` AI tool schemas (Task 5 — scheduler almost certainly extended `scheduled_at` semantics and return shape), broadcast create form (Task 3 — scheduler likely added a schedule picker), campaign detail page (Task 4 — scheduler likely added countdown/scheduled-at rendering that must coexist with the materializing progress bar), and the Org settings form (Task 6 — low risk but verify no conflict with a scheduler settings UI). If anything conflicts, add a "Reconciliation with scheduling" section to this plan before starting tasks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the new `"freestand-claimant"` audience source into MagicFlow's React UI and AI flow-assistant tools: new source option on the broadcast create form, live progress bar for the `materializing` status, Org settings field for `freestand_client_id`, and AI tool schema extensions (`preview_audience`, `create_campaign`, `get_campaign_status`). Remove all `"sampling-central"` references from the frontend.

**Architecture:**
- TypeScript types updated to add `"freestand-claimant"` to `AudienceSource`, `"materializing"` to `CampaignStatus`, and three optional progress fields to `Campaign` — `materialized_count`, `audience_total`, `failure_reason`.
- New hook `useCampaignMaterializationSubscription` mirroring the existing stats subscription; invalidates the campaign detail cache on `campaign_materializing_progress` WS events.
- Broadcast create form gets a new source radio, UUID-validated input for `audience_id`, and a column-mapping editor backed by a fixed allowlist dropdown.
- Campaign detail page shows a progress bar during `materializing`; Start/Cancel buttons disabled.
- AI tool schemas extended with the new source variant; tool docs updated.
- Org settings page gets a "Freestand Client ID" field.
- All `"sampling-central"` strings deleted.

**Tech Stack:** Next.js 14, React 18, TypeScript, TanStack Query, shadcn/ui, react-hook-form + Zod, Vitest, Vercel AI SDK (`streamText` / tool schemas).

**Spec reference:** `/Users/pratikgupta/Freestand/magic-flow/docs/superpowers/specs/2026-04-18-go-backend-claimant-audience-design.md` §9–§11.

**Dependencies:** Phase 2 (fs-whatsapp) must be deployed on the dev environment before UI/tool manual tests can pass. TypeScript + unit tests can land without waiting.

---

## File Structure

### Create

- `hooks/queries/use-campaign-materialization-subscription.ts` — WS subscriber hook (mirrors `use-campaign-stats-subscription.ts`)
- `components/campaigns/freestand-claimant-audience-fields.tsx` — the audience-id + column-mapping form section (extracted so the create form stays readable)
- `components/campaigns/materialization-progress.tsx` — the progress bar render for `status === "materializing"`

### Modify

- `types/campaigns.ts` — add `"freestand-claimant"` to `AudienceSource`, add `"materializing"` to `CampaignStatus`, add optional progress fields to `Campaign`, extend `AudiencePreview`
- `components/campaigns/campaign-create-form.tsx` (or the actual file name — confirm in Task 3) — add new source option, wire the audience fields, call `preview_audience` on UUID blur
- `components/campaigns/campaign-detail.tsx` — mount the new subscription hook; render `materialization-progress` when status is `materializing`; disable Start + Cancel
- `app/api/ai/chat/route.ts` (and/or the exact tool-definition file found in Task 5) — extend the three AI tool schemas + handlers
- `docs/flow-assistant-tools.md` — document the new source option, new status, new response fields
- `components/settings/accounts-settings.tsx` (or the org-settings form file — confirm in Task 7) — add the Freestand Client ID field

### Delete / cleanup

- Every `"sampling-central"` string in `magic-flow/` source — replaced or removed based on context
- Any hardcoded SC column allowlist — replaced with the new freestand-claimant allowlist

---

## Task 1: TypeScript types

**Files:**
- Modify: `types/campaigns.ts`

- [ ] **Step 1: Update `AudienceSource`**

Edit `types/campaigns.ts:13`. Change:

```ts
export type AudienceSource = "contacts" | "csv" | "sampling-central"
```

to:

```ts
export type AudienceSource = "contacts" | "csv" | "freestand-claimant"
```

- [ ] **Step 2: Update `CampaignStatus`**

Edit `types/campaigns.ts:3-11`. Change the union to add `"materializing"`:

```ts
// Campaign statuses mirror fs-whatsapp/internal/models/constants.go:143-152.
// NOTE: "processing" (not "running") matches the backend enum. "materializing"
// is a transient state for freestand-claimant broadcasts while the background
// goroutine fetches recipients from go-backend.
export type CampaignStatus =
  | "draft"
  | "materializing"
  | "scheduled"
  | "queued"
  | "processing"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed"
```

- [ ] **Step 3: Add progress fields to `Campaign`**

Edit `types/campaigns.ts:15-35`. Add three optional fields:

```ts
export interface Campaign {
  id: string
  // ... existing fields unchanged ...
  status: CampaignStatus
  total_recipients: number

  // Populated only while status === "materializing" or after a failed
  // freestand-claimant materialization. Null for other sources and legacy rows.
  materialized_count: number | null
  audience_total: number | null
  failure_reason: string | null

  // ... existing trailing fields unchanged ...
}
```

- [ ] **Step 4: Extend `AudiencePreview`**

Edit `types/campaigns.ts:50-55`. The `name` and `audience_type` optional fields already exist from the SC preview. Confirm they're still optional (they are, per current code). Add an explicit allowlist type for the claimant source allowlist:

```ts
// Columns exposed in the freestand-claimant column-mapping UI.
// Must match fs-whatsapp/internal/handlers/materialize_go_backend.go's
// freestandClaimantAllowedColumns(). Rename/extend in lockstep.
export const FREESTAND_CLAIMANT_ALLOWED_COLUMNS = [
  "name", "city", "state", "pincode", "country", "address",
  "status", "claim_date", "campaign_name", "skus", "utm_source",
  "order_status", "delivery_status", "waybill_number",
] as const

export type FreestandClaimantColumn = typeof FREESTAND_CLAIMANT_ALLOWED_COLUMNS[number]

// Shape of audience_config when audience_source === "freestand-claimant".
export interface AudienceConfigFreestandClaimant {
  audience_id: string
  column_mapping: Record<string, FreestandClaimantColumn>
}
```

- [ ] **Step 5: Typecheck**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`

Expected: errors in files that still reference `"sampling-central"`. List them — they'll be fixed in Tasks 3, 5, and 11. For now, either leave the errors red (and fix as we go) or comment them out one-by-one. Prefer the former: the red errors guide the remaining tasks.

Also expect errors in any file that reads `campaign.materialized_count` or similar that used `any`-typed responses — those will resolve as Task 2+ progress.

- [ ] **Step 6: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && \
git add types/campaigns.ts && \
git commit -m "feat(types): add freestand-claimant source + materializing status + progress fields"
```

Accept that `npx tsc --noEmit` is red at this commit — subsequent tasks fix the downstream consumers.

---

## Task 2: `useCampaignMaterializationSubscription` hook

**Files:**
- Create: `hooks/queries/use-campaign-materialization-subscription.ts`
- Create: `hooks/queries/use-campaign-materialization-subscription.test.ts` (optional — if the repo has vitest tests for the existing stats subscription hook, mirror the test; otherwise skip)

- [ ] **Step 1: Read the existing stats-subscription hook for the pattern**

Run: `cat /Users/pratikgupta/Freestand/magic-flow/components/campaigns/use-campaign-stats-subscription.ts`

(The file is in `components/campaigns/` per the review findings, not `hooks/queries/`. Match the existing path rather than introducing a new one — create the new hook in the same directory.)

- [ ] **Step 2: Create the new hook at the same path**

Create `components/campaigns/use-campaign-materialization-subscription.ts`:

```ts
"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useWebSocket } from "@/hooks/use-websocket"
import { campaignKeys } from "@/hooks/queries/use-campaigns"

/**
 * Subscribes to the server-emitted campaign_materializing_progress WebSocket
 * event and invalidates the campaign detail cache so the progress bar in
 * campaign-detail.tsx re-renders with fresh numbers.
 *
 * Mirrors use-campaign-stats-subscription.ts — same shape, different event.
 * Invalidation is all we need: the campaign row carries materialized_count
 * and audience_total, and useCampaign has staleTime=0 + refetchOnMount="always"
 * so the detail query refetches instantly.
 */
export function useCampaignMaterializationSubscription(campaignId: string | undefined) {
  const { subscribe } = useWebSocket()
  const qc = useQueryClient()

  useEffect(() => {
    if (!campaignId) return
    const unsubscribe = subscribe("campaign_materializing_progress", (payload: any) => {
      if (payload?.campaign_id !== campaignId) return
      qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) })
    })
    return unsubscribe
  }, [campaignId, subscribe, qc])
}
```

Verify the `campaignKeys` import path — may be `@/hooks/queries/use-campaigns` or `@/hooks/queries/query-keys` depending on where the factory lives. Match existing imports in the sibling subscription file.

- [ ] **Step 3: Typecheck**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit components/campaigns/use-campaign-materialization-subscription.ts`

Expected: no errors specific to this file (the wider codebase is still red from Task 1).

- [ ] **Step 4: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && \
git add components/campaigns/use-campaign-materialization-subscription.ts && \
git commit -m "feat(campaigns): add materialization-progress WS subscription hook"
```

---

## Task 3: Broadcast create form — new source option + audience fields

**Files:**
- Locate (use Task 3.0): the campaign-create-form component
- Create: `components/campaigns/freestand-claimant-audience-fields.tsx`
- Modify: the create form to switch on `audience_source` and render the new component for `"freestand-claimant"`

- [ ] **Step 0: Find the create form**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && grep -rln 'audience_source\|sampling-central\|AudienceSource' app/ components/ | head`

The create form is likely `components/campaigns/campaign-create-form.tsx` (or `.../create-form.tsx`). Confirm and note the exact path.

- [ ] **Step 1: Create the `FreestandClaimantAudienceFields` component with a failing visual test**

Create `components/campaigns/freestand-claimant-audience-fields.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import type { Control } from "react-hook-form"
import { useFormContext, useWatch, useFieldArray } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Trash2, Plus } from "lucide-react"
import {
  FREESTAND_CLAIMANT_ALLOWED_COLUMNS,
  type FreestandClaimantColumn,
} from "@/types/campaigns"

interface Props {
  // Preview state is owned by the parent create form (it also displays the
  // "3,247 claimants" line after the UUID is valid).
  onAudienceIdChange: (id: string) => void
  previewCount: number | null
  previewError: string | null
}

/**
 * Form section for the freestand-claimant audience source. Renders:
 *   1. A UUID-validated input for audience_id
 *   2. A repeatable column-mapping editor (flow variable name → claimant column dropdown)
 *
 * The parent form supplies react-hook-form via FormProvider. This component
 * reads/writes audience_config.audience_id and audience_config.column_mapping.
 */
export function FreestandClaimantAudienceFields({
  onAudienceIdChange,
  previewCount,
  previewError,
}: Props) {
  const { register, control, formState: { errors } } = useFormContext()
  const audienceId = useWatch({ control, name: "audience_config.audience_id" })
  const columnMapping = useWatch({ control, name: "audience_config.column_mapping" }) ?? {}

  // Debounced preview trigger — parent handles the actual fetch.
  useEffect(() => {
    if (!audienceId || !isUUID(audienceId)) return
    const h = setTimeout(() => onAudienceIdChange(audienceId), 500)
    return () => clearTimeout(h)
  }, [audienceId, onAudienceIdChange])

  const mappingEntries = Object.entries(columnMapping) as Array<[string, FreestandClaimantColumn]>

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="audience_id">Audience ID</Label>
        <Input
          id="audience_id"
          placeholder="00000000-0000-0000-0000-000000000000"
          {...register("audience_config.audience_id", {
            required: "audience_id is required",
            validate: (v) => isUUID(v) || "must be a UUID",
          })}
        />
        {errors?.audience_config?.audience_id && (
          <p className="text-destructive text-sm mt-1">
            {String(errors.audience_config.audience_id.message)}
          </p>
        )}
        {previewCount !== null && (
          <p className="text-sm text-muted-foreground mt-1">
            {previewCount.toLocaleString()} claimants
          </p>
        )}
        {previewError && (
          <p className="text-warning text-sm mt-1">
            Could not preview audience: {previewError}. You can still create the campaign; the error will show on the campaign detail page if materialization fails.
          </p>
        )}
      </div>

      <div>
        <Label>Column mapping (optional)</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Map claimant columns to flow/template variables. Phone is always the send identifier.
        </p>
        <ColumnMappingEditor control={control} />
      </div>
    </div>
  )
}

function ColumnMappingEditor({ control }: { control: Control<any> }) {
  // react-hook-form's useFieldArray doesn't natively support object maps, so
  // we use a local "entries" array that we sync back to column_mapping on
  // change via a useEffect owned by the parent form. Keep it simple: offer add
  // / remove / select, and stringify on submit.
  const [rows, setRows] = useState<Array<{ flowVar: string; column: FreestandClaimantColumn | "" }>>(
    [{ flowVar: "", column: "" }],
  )

  // Publish the mapping up through the form state on every change.
  const { setValue } = useFormContext()
  useEffect(() => {
    const mapping: Record<string, FreestandClaimantColumn> = {}
    for (const r of rows) {
      if (r.flowVar && r.column) mapping[r.flowVar] = r.column
    }
    setValue("audience_config.column_mapping", mapping, { shouldValidate: false })
  }, [rows, setValue])

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="flow variable (e.g. customer_name)"
            value={row.flowVar}
            onChange={(e) =>
              setRows((r) => r.map((x, j) => (j === i ? { ...x, flowVar: e.target.value } : x)))
            }
            className="flex-1"
          />
          <span className="text-muted-foreground">←</span>
          <Select
            value={row.column}
            onValueChange={(v) =>
              setRows((r) => r.map((x, j) => (j === i ? { ...x, column: v as FreestandClaimantColumn } : x)))
            }
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="claimant column" />
            </SelectTrigger>
            <SelectContent>
              {FREESTAND_CLAIMANT_ALLOWED_COLUMNS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
            disabled={rows.length === 1}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setRows((r) => [...r, { flowVar: "", column: "" }])}
      >
        <Plus className="h-4 w-4 mr-1" />
        Add mapping
      </Button>
    </div>
  )
}

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}
```

- [ ] **Step 2: Plug into the create form**

In the campaign-create-form file identified in Step 0:

1. Import `FreestandClaimantAudienceFields` and the preview call helper.
2. In the `audience_source` switch/radio group, add an option labeled "Freestand Claimant Audience" with value `"freestand-claimant"`.
3. When `watch("audience_source") === "freestand-claimant"`, render `<FreestandClaimantAudienceFields ... />`.
4. Replace the old `"sampling-central"` case entirely (its section is deleted).
5. Wire the preview: on `onAudienceIdChange`, call the existing `preview_audience` helper (confirm its current function name — likely `previewAudience` or a react-query hook like `usePreviewAudience`). Update request payload shape to `{ source: "freestand-claimant", audience_id: <id> }`. On success, set local state `previewCount = response.total_count`; on failure, set `previewError = error.message`.
6. In the submit handler, when `audience_source === "freestand-claimant"`, build `audience_config = { audience_id, column_mapping }` and POST.

- [ ] **Step 3: Remove the old SC option and its code path**

Search for every reference to `"sampling-central"` in the create form file and delete:
- The radio option labeled "Sampling Central"
- Its conditional field rendering
- Its preview/submit branches

Run: `cd /Users/pratikgupta/Freestand/magic-flow && grep -n 'sampling-central' components/campaigns/*.tsx`

Expected after cleanup: no hits.

- [ ] **Step 4: Typecheck & visual check**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`

Fix any remaining errors related to the create form. Start the dev server and navigate to the broadcast create page:

Run: `cd /Users/pratikgupta/Freestand/magic-flow && docker compose up` (or `npm run dev` depending on setup)

Verify:
- New radio option "Freestand Claimant Audience" appears
- Selecting it reveals audience_id input + column mapping table
- Typing a UUID triggers preview (requires Phase 2 deployed — local-dev can mock or just accept the preview-error flow)
- Invalid UUID shows validation error

- [ ] **Step 5: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && \
git add components/campaigns/freestand-claimant-audience-fields.tsx components/campaigns/campaign-create-form.tsx && \
git commit -m "feat(campaigns): add freestand-claimant audience source to create form"
```

---

## Task 4: Campaign detail — materialization progress bar

**Files:**
- Create: `components/campaigns/materialization-progress.tsx`
- Modify: `components/campaigns/campaign-detail.tsx`

- [ ] **Step 1: Create the progress-bar component**

Create `components/campaigns/materialization-progress.tsx`:

```tsx
"use client"

import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { Campaign } from "@/types/campaigns"

interface Props {
  campaign: Campaign
}

/**
 * Renders the materialization progress bar for freestand-claimant broadcasts.
 * Shows only when campaign.status === "materializing". The parent decides
 * whether to render; this component renders defensively-safely if given a
 * campaign in any state.
 */
export function MaterializationProgress({ campaign }: Props) {
  if (campaign.status !== "materializing") return null

  const total = campaign.audience_total
  const done = campaign.materialized_count ?? 0

  const pctRaw = total && total > 0 ? (done / total) * 100 : 0
  // Clamp 0..100 to guard against dynamic-audience drift where the goroutine
  // processes more rows than the first page's totalItems reported.
  const pct = Math.max(0, Math.min(100, pctRaw))

  const label =
    total === null
      ? "Materializing — counting recipients..."
      : `Materializing recipients — ${done.toLocaleString()} of ${total.toLocaleString()}`

  return (
    <Alert className="border-primary/50">
      <AlertTitle>{label}</AlertTitle>
      <AlertDescription>
        <Progress value={pct} className="mt-2" />
        <p className="text-xs text-muted-foreground mt-2">
          The campaign will be ready to start once recipients finish loading.
        </p>
      </AlertDescription>
    </Alert>
  )
}
```

- [ ] **Step 2: Integrate in `campaign-detail.tsx`**

In `components/campaigns/campaign-detail.tsx`:

1. Add at the top of the file (alongside existing imports): `import { MaterializationProgress } from "./materialization-progress"` and `import { useCampaignMaterializationSubscription } from "./use-campaign-materialization-subscription"`.
2. Inside the component body, after the existing `useCampaignStatsSubscription(campaignId)` call (or similar), add `useCampaignMaterializationSubscription(campaignId)`.
3. Render `<MaterializationProgress campaign={campaign} />` near the top of the detail body (above the stats panel and the action buttons).
4. Disable the Start and Cancel buttons when `campaign.status === "materializing"`:

```tsx
<Button
  onClick={handleStart}
  disabled={campaign.status !== "draft"}
  title={campaign.status === "materializing" ? "Waiting for recipients to materialize" : undefined}
>
  Start campaign
</Button>
<Button
  variant="outline"
  onClick={handleCancel}
  disabled={campaign.status === "materializing" || campaign.status === "completed" || campaign.status === "cancelled"}
  title={campaign.status === "materializing" ? "Cannot cancel during materialization — please wait" : undefined}
>
  Cancel
</Button>
```

5. If `campaign.status === "failed"` and `campaign.failure_reason` is present, render a destructive alert above the stats:

```tsx
{campaign.status === "failed" && campaign.failure_reason && (
  <Alert variant="destructive">
    <AlertTitle>Campaign failed</AlertTitle>
    <AlertDescription>{campaign.failure_reason}</AlertDescription>
  </Alert>
)}
```

- [ ] **Step 3: Typecheck & visual check**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`

Expected: clean (or narrow to the remaining unconverted files).

Load a campaign with `status=materializing` (create one in dev via the form from Task 3). Verify:
- Progress bar appears
- Label updates (assuming Phase 2 is deployed and WS events flow)
- Start/Cancel buttons disabled with tooltip

- [ ] **Step 4: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && \
git add components/campaigns/materialization-progress.tsx components/campaigns/campaign-detail.tsx && \
git commit -m "feat(campaigns): materialization progress bar + disabled action buttons"
```

---

## Task 5: AI tool schema extensions (`preview_audience`, `create_campaign`, `get_campaign_status`)

**Files:**
- Locate (Step 0): the tool definition file
- Modify: that file
- Modify: `docs/flow-assistant-tools.md`

- [ ] **Step 0: Find the tool definitions**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && grep -rln '"create_campaign"\|"preview_audience"\|"get_campaign_status"' app/ lib/ | head`

Common locations: `app/api/ai/chat/route.ts`, `lib/ai/tools/campaign-tools.ts`, or inside a larger agent setup. Open the primary file and note the Zod schemas for all three tools. Copy them for reference.

- [ ] **Step 1: Extend `preview_audience` input schema**

Add a new variant to the Zod input schema. Today's schema is (paraphrased) something like:

```ts
const previewAudienceInput = z.object({
  source: z.literal("contacts"),
  filter: z.any().optional(),
  search: z.string().optional(),
  channel: z.string().optional(),
})
```

Change to a discriminated union:

```ts
const previewAudienceInput = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("contacts"),
    filter: z.any().optional(),
    search: z.string().optional(),
    channel: z.string().optional(),
  }),
  z.object({
    source: z.literal("freestand-claimant"),
    audience_id: z.string().uuid(),
  }),
])
```

Update the handler body to dispatch on `input.source`:
- `"contacts"` → existing behavior unchanged
- `"freestand-claimant"` → call fs-whatsapp's new `/api/campaigns/preview-audience` (or whichever backend endpoint Phase 2 exposed — confirm the exact route in the Phase 2 implementation) with body `{ source: "freestand-claimant", audience_id }`. Return `{ total_count, audience_name, audience_type, snapshot_date }`.

Return schema: extend to include optional name/type/snapshot_date fields.

- [ ] **Step 2: Extend `create_campaign` input schema**

Add `"freestand-claimant"` to the `audience_source` enum. Add a new branch in the `audience_config` schema:

```ts
const audienceConfigFreestandClaimant = z.object({
  audience_id: z.string().uuid(),
  column_mapping: z.record(z.string(), z.enum([
    "name", "city", "state", "pincode", "country", "address",
    "status", "claim_date", "campaign_name", "skus", "utm_source",
    "order_status", "delivery_status", "waybill_number",
  ])),
})
```

And replace any single-variant `audience_config` with a discriminated union if the current schema allows multiple:

```ts
const createCampaignInput = z.object({
  name: z.string(),
  account_name: z.string(),
  flow_id: z.string().optional(),
  template_id: z.string().optional(),
  audience_source: z.enum(["contacts", "csv", "freestand-claimant"]),
  audience_config: z.union([
    // ... existing contacts/csv variants ...
    audienceConfigFreestandClaimant,
  ]),
  scheduled_at: z.string().datetime().optional(),
})
```

Update the return schema to include the new transient state: `status` can now be `"materializing"`; add `audience_total: z.number().nullable().optional()` to the response.

- [ ] **Step 3: Extend `get_campaign_status` output schema**

Add `"materializing"` to the allowed status enum, plus new optional progress fields:

```ts
const getCampaignStatusOutput = z.object({
  status: z.enum([
    "draft", "materializing", "scheduled", "queued", "processing",
    "paused", "completed", "cancelled", "failed",
  ]),
  sent_count: z.number(),
  delivered_count: z.number(),
  read_count: z.number(),
  failed_count: z.number(),
  total_recipients: z.number(),
  materialized_count: z.number().nullable().optional(),
  audience_total: z.number().nullable().optional(),
  failure_reason: z.string().nullable().optional(),
})
```

Handler body: no change needed — the fields are already on the Campaign model from Phase 2, so the pass-through just needs to include them.

- [ ] **Step 4: Remove any `"sampling-central"` from AI tool files**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && grep -rn 'sampling-central' app/api/ lib/ai/`

Expected: each hit lives in a Zod enum, tool description, system prompt, or example. Replace `"sampling-central"` with `"freestand-claimant"` everywhere it references the wire value. Where an example mentions the SC UI or flow, rewrite the example to use the claimant flow (paste UUID, map columns).

- [ ] **Step 5: Update tool docs**

Edit `docs/flow-assistant-tools.md`:

1. In the `create_campaign` section (line ~623 per earlier review), change the `audience_source` cell from `"contacts"` to `"contacts" | "csv" | "freestand-claimant"`.
2. Add a new subsection under `audience_config` describing the `"freestand-claimant"` shape (the `AudienceConfigFreestandClaimant` interface from Task 1).
3. Under `create_campaign` return, document the new `status: "materializing"` transient state and the `audience_total` field.
4. Under `get_campaign_status` return, document `status: "materializing"`, `materialized_count`, `audience_total`, `failure_reason`.
5. Add a worked example at the bottom: the preview → create → poll → start sequence from the spec's §9.

- [ ] **Step 6: Typecheck and run chat locally to smoke**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit && npx vitest run --reporter=default --testPathPattern=tools` (if tests exist for tools)

Start dev server, open the AI chat panel, test prompt: *"schedule a broadcast using my <flow name> flow to audience <uuid>, map customer_name to the claimant's name column"*.

Verify (assuming Phase 2 deployed):
- AI calls `preview_audience` with the new source variant
- AI calls `create_campaign` and gets back `status: "materializing"`
- AI polls `get_campaign_status` and eventually sees `status: "draft"`
- AI proposes to call `start_campaign`

- [ ] **Step 7: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && \
git add app/api/ai/ lib/ai/ docs/flow-assistant-tools.md && \
git commit -m "feat(ai): extend tools for freestand-claimant source + materializing status"
```

---

## Task 6: Org settings — Freestand Client ID field

**Files:**
- Locate (Step 0): the org/accounts settings page
- Modify: that page and its form submit handler

- [ ] **Step 0: Find the org settings page**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && grep -rln 'organizations/self\|org-settings\|OrgSettings\|organization_id' app/settings app/\(dashboard\)/settings components/settings 2>/dev/null | head`

Common location: `app/(dashboard)/settings/accounts/page.tsx` or `components/settings/organization-form.tsx`.

- [ ] **Step 1: Add the field to the form**

In the org settings form:

```tsx
<FormField
  control={form.control}
  name="freestand_client_id"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Freestand Client ID</FormLabel>
      <FormControl>
        <Input
          {...field}
          placeholder="00000000-0000-0000-0000-000000000000"
          value={field.value ?? ""}
        />
      </FormControl>
      <FormDescription>
        UUID for your tenant in the Freestand data platform. Required to broadcast to claimant audiences.
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

- [ ] **Step 2: Extend the Zod validation schema**

```ts
const orgFormSchema = z.object({
  // ... existing fields ...
  freestand_client_id: z
    .string()
    .uuid("Must be a valid UUID")
    .or(z.literal(""))
    .optional()
    .nullable(),
})
```

- [ ] **Step 3: Update the submit handler**

Ensure the PUT payload includes `freestand_client_id`. Empty string → send `null` (to clear). Matches the backend's nullable column.

- [ ] **Step 4: Update the Org TypeScript type**

If there's a `types/organization.ts` or inline Org type in the settings code, add `freestand_client_id: string | null`. (Phase 2 adds the field to the GORM model; this mirrors it on the client side.)

- [ ] **Step 5: Typecheck + visual test**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`

Load the org settings page in dev, paste a UUID, save, reload — verify the value persists.

- [ ] **Step 6: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && \
git add app/ components/settings/ types/ && \
git commit -m "feat(settings): add Freestand Client ID org field"
```

---

## Task 7: Sampling Central cleanup — final grep

**Files:** any file still referencing `"sampling-central"` or `SamplingCentral`

- [ ] **Step 1: Grep everywhere**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && grep -rn 'sampling[_-]central\|SamplingCentral' --include='*.ts' --include='*.tsx' --include='*.md' app/ components/ hooks/ lib/ types/ utils/ docs/`

Expected candidates:
- Type strings in union literals (already handled in Task 1)
- AI tool prompts / examples (already handled in Task 5)
- Form labels / dropdown options (already handled in Task 3)
- Docs outside `docs/superpowers/plans/` (handled in Task 5)

If any hit remains in production code (anywhere outside `docs/superpowers/`), replace or delete it. Preserve historical references in `docs/superpowers/plans/` and `docs/superpowers/specs/` verbatim.

- [ ] **Step 2: Typecheck + full test run**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit && npx vitest run`

Expected: all green.

- [ ] **Step 3: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && \
git add -A && \
git commit -m "chore: remove remaining sampling-central references" --allow-empty
```

(If the grep found nothing, commit `--allow-empty` for a clean audit trail, or skip.)

---

## Task 8: Manual test matrix

**Files:** none (runtime verification; corresponds to spec §12.1 items 16–20)

Requires Phase 2 deployed to the dev environment.

- [ ] **Step 1: Set the org's client ID**

Open Org Settings → paste a valid Freestand Client ID → save.

- [ ] **Step 2: Create a broadcast (UI)**

Broadcast create form:
- Pick a published flow
- Choose "Freestand Claimant Audience"
- Paste audience UUID → preview shows "N claimants" within 1s
- Add one mapping row: `customer_name` ← `name`
- Submit

Expected:
- Submit button shows loading state briefly
- Navigate to campaign detail page
- Page shows the progress bar with "Materializing recipients — 0 of N..."
- Bar fills smoothly via WS events
- Status flips to "Draft" when done
- Start button becomes enabled

- [ ] **Step 3: AI chat path**

Open AI chat, prompt: *"Create a broadcast with my <flow name> flow to audience <uuid>."*

Expected:
- AI calls `preview_audience` (confirms size)
- Asks about mapping; user says "map customer_name to name"
- AI calls `create_campaign` — response includes `status: "materializing"`
- AI polls `get_campaign_status` a few times
- Reports "Campaign ready. Say 'send' to start."

- [ ] **Step 4: Bad audience ID**

UI: paste `00000000-0000-0000-0000-000000000000` → preview shows "Could not preview audience" warning → submit anyway → campaign detail shows status=failed with `failure_reason` mentioning "Audience not found."

- [ ] **Step 5: Zero-claimant audience**

Create an audience in go-backend that returns 0 rows. Broadcast to it → campaign flips to `failed` with `failure_reason="audience has zero claimants"`.

- [ ] **Step 6: Progress bar overflow (dynamic audience)**

If you have a dynamic audience that grows during materialization, verify the progress bar stays pinned at 100% (not >100%).

- [ ] **Step 7: Capture outputs for PR description**

Screenshots of the create form, the progress bar mid-materialize, and the AI chat transcript. Paste into the PR body.

---

## Task 9: Final lint + test + PR

**Files:** none

- [ ] **Step 1: Lint and test**

Run:
```bash
cd /Users/pratikgupta/Freestand/magic-flow && \
npx tsc --noEmit && \
npx vitest run && \
npm run lint   # if the repo has a lint npm script
```

Expected: all green.

- [ ] **Step 2: Open PR**

Title: `feat(campaigns): wire freestand-claimant audience source in UI + AI tools`.

PR body:
- Link to design spec
- Confirmation that Phase 1 + Phase 2 are both deployed
- Screenshots from Task 8 (create form, progress bar, AI chat)
- Regressions checked: `"sampling-central"` removed; existing broadcast flows (contacts, csv) still work; org settings page still saves
- Explicit note: "No feature flag — this is a destructive replacement on the wire (SC audience source is gone). Ensure Phase 2 is live before merging."

---

## Self-review

Against spec §9–§11:

- ✅ §9.1 `preview_audience` extended with `"freestand-claimant"` source variant, returns name/type/snapshot_date — Task 5 step 1
- ✅ §9.2 `create_campaign` accepts new source + AudienceConfigFreestandClaimant + returns `status: "materializing"` — Task 5 step 2
- ✅ §9.3 `get_campaign_status` surfaces progress fields — Task 5 step 3
- ✅ §9.4 tool docs updated — Task 5 step 5
- ✅ §10.1 broadcast create form — Task 3
- ✅ §10.2 new subscription hook — Task 2
- ✅ §10.3 campaign detail page — Task 4
- ✅ §10.4 org settings — Task 6
- ✅ §10.5 TypeScript types — Task 1
- ✅ §11 SC cleanup — distributed across Tasks 1, 3, 5, 7 (final sweep)

One deliberate simplification worth flagging: the column-mapping editor in Task 3 uses local `useState` for the row list rather than `useFieldArray`. Reason: react-hook-form's `useFieldArray` works with array-of-objects but our underlying shape is a map (`Record<string, ...>`). Translating rows ↔ map inside a `useEffect` is simpler than inventing a custom field registration. If this turns into a bug-magnet (e.g., rows not resetting on form reset), swap to a controlled array field with serialization in the submit handler.

One gap: Step 2 in Task 3 assumes there's a "preview" helper already in place for the contacts source. If not, the step needs a small extra substep to add a `usePreviewAudience` hook (or similar). Handle during implementation — add a sub-step 2a if the helper doesn't exist.

No placeholders. Every commit is a self-contained unit. Each task ends with a passing typecheck or a deliberate, documented red state that the next task fixes.
