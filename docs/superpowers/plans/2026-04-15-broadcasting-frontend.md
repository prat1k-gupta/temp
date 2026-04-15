# Broadcasting — Frontend Implementation Plan (magic-flow)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port fs-whatsapp's existing Vue `CampaignsView.vue` to a React page in magic-flow under `app/campaigns/`, extended to support flow broadcasts and a sampling-central audience source.

**Architecture:**

- New pages: `app/campaigns/page.tsx` (list), `app/campaigns/[id]/page.tsx` (detail), `app/campaigns/new/page.tsx` (create form)
- React Query hooks in `hooks/queries/use-campaigns.ts` following the existing factory pattern
- Audience picker component with three tabs — Contacts reuses the existing `useContactFilterUI` hook; CSV keeps the existing legacy path for template campaigns; Sampling Central is a new flow with audience ID paste + fetch + column mapping
- Variable mapping form that dynamically shows rows based on the selected template's placeholders or the selected flow's variable references (fetched from `GET /api/chatbot/flows/{id}/variables`)
- Campaign detail page subscribes to the existing WebSocket campaign stats updates

**Tech stack:** Next.js 14 (Pages Router — actually App Router; check `magic-flow/app/` vs `pages/`), React 18, TanStack React Query v5, shadcn-vue components — sorry, shadcn (React), Tailwind, Zod, react-hook-form. Existing patterns per `CLAUDE.md`.

---

## Spec

See `docs/superpowers/specs/2026-04-15-broadcasting-flow-extensibility-design.md`. Read it first.

## Prerequisites

The fs-whatsapp backend plan (`fs-whatsapp/docs/superpowers/plans/2026-04-15-broadcasting-backend.md`) must be merged before the SC source and flow-campaign tests can pass end-to-end. The template+contacts paths can be developed in parallel since those endpoints already exist.

## File Structure

**New files:**
- `app/campaigns/layout.tsx` — shell with `FeatureGate feature="campaigns"`
- `app/campaigns/page.tsx` — list view
- `app/campaigns/new/page.tsx` — create form
- `app/campaigns/[id]/page.tsx` — detail view
- `hooks/queries/use-campaigns.ts` — React Query hooks
- `hooks/queries/query-keys.ts` — extend with `campaignKeys` factory
- `components/campaigns/campaign-list.tsx` — table component
- `components/campaigns/campaign-detail.tsx` — detail layout with counters + recipient table
- `components/campaigns/campaign-create-form.tsx` — the big form
- `components/campaigns/audience-picker.tsx` — tab component with 3 modes
- `components/campaigns/audience-picker-sampling-central.tsx` — the SC-specific panel
- `components/campaigns/variable-mapping-form.tsx` — the name → column mapping rows
- `components/campaigns/info-banner-24hr.tsx` — the reusable banner for flow campaigns
- `components/campaigns/campaign-status-badge.tsx` — reusable badge
- `components/campaigns/recipient-table.tsx` — paginated recipient list
- `types/campaigns.ts` — TypeScript types
- `lib/campaigns-ws.ts` — WebSocket subscription helper

**Modified files:**
- `components/app-sidebar.tsx` — add Campaigns nav item
- `lib/permissions.ts` — verify `DEFAULT_ROLE_FEATURES` has `campaigns` on Admin/Manager
- `hooks/queries/query-keys.ts` — add `campaignKeys` factory

---

## Task 1: React Query hooks + types

**Files:**
- Create: `types/campaigns.ts`
- Create: `hooks/queries/use-campaigns.ts`
- Modify: `hooks/queries/query-keys.ts`

- [ ] **Step 1: Write the types file**

Create `types/campaigns.ts`:

```ts
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed"

export type AudienceSource = "contacts" | "csv" | "sampling-central"

export interface Campaign {
  id: string
  name: string
  account_name: string
  template_id: string | null
  flow_id: string | null
  audience_source: AudienceSource
  source_system: string | null
  source_external_id: string | null
  status: CampaignStatus
  total_recipients: number
  sent_count: number
  delivered_count: number
  read_count: number
  failed_count: number
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface CampaignRecipient {
  id: string
  campaign_id: string
  contact_id: string | null
  phone_number: string
  status: "pending" | "sent" | "delivered" | "read" | "failed"
  provider_message_id: string | null
  error_message: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
}

export interface AudiencePreview {
  total_count: number
  name?: string
  audience_type?: string
  available_columns: string[]
}

export interface CreateCampaignInput {
  name: string
  account_name: string
  template_id: string | null
  flow_id: string | null
  audience_source: AudienceSource
  audience_config: unknown // shape varies by source; see spec
  schedule_at: string | null
}

export interface CreateCampaignResponse {
  campaign_id: string
  status: CampaignStatus
  total_recipients: number
  contacts_created?: number
  contacts_reused?: number
  invalid_phones?: number
}
```

- [ ] **Step 2: Extend query keys factory**

Open `hooks/queries/query-keys.ts`. Add:

```ts
export const campaignKeys = {
  all: ["campaigns"] as const,
  lists: () => [...campaignKeys.all, "list"] as const,
  list: (filters: Record<string, unknown> = {}) => [...campaignKeys.lists(), filters] as const,
  details: () => [...campaignKeys.all, "detail"] as const,
  detail: (id: string) => [...campaignKeys.details(), id] as const,
  recipients: (campaignId: string, page: number) => [...campaignKeys.detail(campaignId), "recipients", page] as const,
}
```

- [ ] **Step 3: Write the hooks file**

Create `hooks/queries/use-campaigns.ts`:

```ts
import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { campaignKeys } from "./query-keys"
import type {
  Campaign,
  CampaignRecipient,
  AudiencePreview,
  CreateCampaignInput,
  CreateCampaignResponse,
  CampaignStatus,
} from "@/types/campaigns"

export function useCampaigns(filters: { status?: CampaignStatus } = {}) {
  return useQuery({
    queryKey: campaignKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.status) params.set("status", filters.status)
      const res = await apiClient.get<{ campaigns: Campaign[]; total: number }>(`/api/campaigns?${params}`)
      return res
    },
    staleTime: 30 * 1000,
  })
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.detail(id ?? ""),
    queryFn: () => apiClient.get<{ campaign: Campaign }>(`/api/campaigns/${id}`),
    enabled: Boolean(id),
    staleTime: 10 * 1000,
  })
}

export function useCampaignRecipients(campaignId: string | undefined) {
  return useInfiniteQuery({
    queryKey: [...campaignKeys.details(), campaignId, "recipients"],
    queryFn: async ({ pageParam = 1 }) => {
      return apiClient.get<{ recipients: CampaignRecipient[]; total: number }>(
        `/api/campaigns/${campaignId}/recipients?page=${pageParam}&limit=50`,
      )
    },
    enabled: Boolean(campaignId),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.recipients.length === 50 ? allPages.length + 1 : undefined),
  })
}

export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCampaignInput) =>
      apiClient.post<CreateCampaignResponse>("/api/campaigns", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: campaignKeys.lists() })
    },
  })
}

export function useStartCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/campaigns/${id}/start`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) })
      qc.invalidateQueries({ queryKey: campaignKeys.lists() })
    },
  })
}

export function usePauseCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/campaigns/${id}/pause`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) })
    },
  })
}

export function useCancelCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/campaigns/${id}/cancel`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) })
      qc.invalidateQueries({ queryKey: campaignKeys.lists() })
    },
  })
}

export function usePreviewAudience() {
  return useMutation({
    mutationFn: (input: { source: string; audience_id?: string; filter?: unknown }) =>
      apiClient.post<AudiencePreview>("/api/campaigns/preview-audience", input),
  })
}
```

- [ ] **Step 4: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors in the new files. (Pre-existing errors elsewhere are OK if they predate this task.)

- [ ] **Step 5: Commit**

```bash
git add types/campaigns.ts hooks/queries/use-campaigns.ts hooks/queries/query-keys.ts
git commit -m "feat(campaigns): React Query hooks and types"
```

---

## Task 2: Flow variables hook

**Files:**
- Modify: `hooks/queries/use-chatbot-flows.ts` (or create a new file `hooks/queries/use-flow-variables.ts`)

- [ ] **Step 1: Add the hook**

Create `hooks/queries/use-flow-variables.ts`:

```ts
import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

export function useFlowVariables(flowId: string | undefined) {
  return useQuery({
    queryKey: ["chatbot-flows", flowId, "variables"],
    queryFn: () => apiClient.get<{ variables: string[] }>(`/api/chatbot/flows/${flowId}/variables`),
    enabled: Boolean(flowId),
    staleTime: 5 * 60 * 1000, // flow variables rarely change
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/queries/use-flow-variables.ts
git commit -m "feat(flows): useFlowVariables hook for campaign variable mapping"
```

---

## Task 3: Campaigns list page

**Files:**
- Create: `app/campaigns/layout.tsx`
- Create: `app/campaigns/page.tsx`
- Create: `components/campaigns/campaign-list.tsx`
- Create: `components/campaigns/campaign-status-badge.tsx`

- [ ] **Step 1: Write the status badge component**

Create `components/campaigns/campaign-status-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge"
import type { CampaignStatus } from "@/types/campaigns"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft:     "bg-muted text-muted-foreground",
  scheduled: "bg-info/10 text-info",
  queued:    "bg-info/10 text-info",
  running:   "bg-primary/10 text-primary",
  paused:    "bg-warning/10 text-warning",
  completed: "bg-success/10 text-success",
  cancelled: "bg-muted text-muted-foreground",
  failed:    "bg-destructive/10 text-destructive",
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status])}>
      {status}
    </Badge>
  )
}
```

- [ ] **Step 2: Write the layout with FeatureGate**

Create `app/campaigns/layout.tsx`:

```tsx
import { FeatureGate } from "@/components/feature-gate"

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="campaigns">{children}</FeatureGate>
}
```

- [ ] **Step 3: Write the list page**

Create `app/campaigns/page.tsx`:

```tsx
"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { useCampaigns } from "@/hooks/queries/use-campaigns"
import { CampaignList } from "@/components/campaigns/campaign-list"
import { Plus } from "lucide-react"

export default function CampaignsPage() {
  const { data, isLoading, isError } = useCampaigns()

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Campaigns">
        <Button asChild>
          <Link href="/campaigns/new">
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Link>
        </Button>
      </PageHeader>

      {isLoading && <div className="text-muted-foreground">Loading campaigns...</div>}
      {isError && <div className="text-destructive">Failed to load campaigns</div>}
      {data && <CampaignList campaigns={data.campaigns} />}
    </div>
  )
}
```

- [ ] **Step 4: Write the list table component**

Create `components/campaigns/campaign-list.tsx`:

```tsx
import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CampaignStatusBadge } from "./campaign-status-badge"
import type { Campaign } from "@/types/campaigns"
import { formatDistanceToNow } from "date-fns"
import { FileText, GitBranch } from "lucide-react"

export function CampaignList({ campaigns }: { campaigns: Campaign[] }) {
  if (campaigns.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center">
        <p className="text-muted-foreground">No campaigns yet</p>
        <p className="text-sm text-muted-foreground mt-2">
          Click &ldquo;New Campaign&rdquo; to send your first broadcast.
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Recipients</TableHead>
            <TableHead className="text-right">Sent</TableHead>
            <TableHead className="text-right">Delivered</TableHead>
            <TableHead className="text-right">Read</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((c) => (
            <TableRow key={c.id} className="cursor-pointer hover:bg-muted">
              <TableCell className="font-medium">
                <Link href={`/campaigns/${c.id}`} className="hover:underline">
                  {c.name}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {c.flow_id ? (
                    <>
                      <GitBranch className="h-3.5 w-3.5" /> Flow
                    </>
                  ) : (
                    <>
                      <FileText className="h-3.5 w-3.5" /> Template
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <CampaignStatusBadge status={c.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{c.total_recipients.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{c.sent_count.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{c.delivered_count.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{c.read_count.toLocaleString()}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 5: Build + type check**

```bash
npx tsc --noEmit
```

Expected: no new type errors.

- [ ] **Step 6: Add nav item in sidebar**

Open `components/app-sidebar.tsx`. Find the existing nav items array. Add:

```tsx
{ title: "Campaigns", url: "/campaigns", icon: Megaphone, feature: "campaigns" as const },
```

Import `Megaphone` from `lucide-react` if not already imported.

- [ ] **Step 7: Start dev server and verify**

```bash
docker compose up -d
# Wait a few seconds, then open http://localhost:3002/campaigns
```

Expected: page loads with "No campaigns yet" empty state (or existing campaigns if DB has some). Status badge styles should match the design system colors.

- [ ] **Step 8: Commit**

```bash
git add app/campaigns/layout.tsx app/campaigns/page.tsx components/campaigns/campaign-list.tsx components/campaigns/campaign-status-badge.tsx components/app-sidebar.tsx
git commit -m "feat(campaigns): list page and status badge"
```

---

## Task 4: Info banner component

**Files:**
- Create: `components/campaigns/info-banner-24hr.tsx`

- [ ] **Step 1: Write the component**

Create `components/campaigns/info-banner-24hr.tsx`:

```tsx
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"

export function InfoBanner24hr({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-md border border-info/30 bg-info/5 p-3 text-sm",
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
      <p className="text-muted-foreground">
        If your flow doesn&apos;t start with a template message, only contacts who&apos;ve messaged
        you in the last 24 hours will receive it. Add a template node at the start to reach everyone.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/campaigns/info-banner-24hr.tsx
git commit -m "feat(campaigns): 24hr window info banner component"
```

---

## Task 5: Variable mapping form

**Files:**
- Create: `components/campaigns/variable-mapping-form.tsx`

- [ ] **Step 1: Write the component**

Create `components/campaigns/variable-mapping-form.tsx`:

```tsx
"use client"

import { useMemo } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface VariableMappingFormProps {
  /** Variable names that need values (e.g. ["customer_name", "city"] from flow or template) */
  variables: string[]
  /** Available source columns (e.g. ["name", "city", "pincode"] from SC) */
  availableColumns: string[]
  /** Current mapping: variable name → column name */
  value: Record<string, string>
  /** Called when mapping changes */
  onChange: (next: Record<string, string>) => void
}

const DONT_MAP = "__dont_map__"

export function VariableMappingForm({
  variables,
  availableColumns,
  value,
  onChange,
}: VariableMappingFormProps) {
  const handleChange = (variable: string, column: string) => {
    const next = { ...value }
    if (column === DONT_MAP) {
      delete next[variable]
    } else {
      next[variable] = column
    }
    onChange(next)
  }

  const sortedVars = useMemo(() => [...variables].sort(), [variables])

  if (variables.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This template/flow has no variables that need mapping.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Label className="text-sm font-medium">Map variables to audience columns</Label>
      <div className="grid gap-2">
        {sortedVars.map((variable) => (
          <div key={variable} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <code className="text-sm font-mono px-2 py-1 rounded bg-muted">
              {`{{${variable}}}`}
            </code>
            <span className="text-muted-foreground text-sm">→</span>
            <Select
              value={value[variable] ?? DONT_MAP}
              onValueChange={(col) => handleChange(variable, col)}
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Pick a column..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DONT_MAP} className="cursor-pointer">
                  Don&apos;t map
                </SelectItem>
                {availableColumns.map((col) => (
                  <SelectItem key={col} value={col} className="cursor-pointer">
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/campaigns/variable-mapping-form.tsx
git commit -m "feat(campaigns): variable mapping form component"
```

---

## Task 6: Sampling-central audience picker

**Files:**
- Create: `components/campaigns/audience-picker-sampling-central.tsx`

- [ ] **Step 1: Write the component**

Create `components/campaigns/audience-picker-sampling-central.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { usePreviewAudience } from "@/hooks/queries/use-campaigns"
import { Loader2, Users } from "lucide-react"
import type { AudiencePreview } from "@/types/campaigns"

interface Props {
  value: { audience_id: string; column_mapping: Record<string, string> }
  onChange: (v: { audience_id: string; column_mapping: Record<string, string> }) => void
  onPreviewLoaded: (preview: AudiencePreview) => void
}

export function AudiencePickerSamplingCentral({ value, onChange, onPreviewLoaded }: Props) {
  const [localId, setLocalId] = useState(value.audience_id)
  const [preview, setPreview] = useState<AudiencePreview | null>(null)
  const previewMutation = usePreviewAudience()

  const handleFetch = () => {
    if (!localId.trim()) return
    previewMutation.mutate(
      { source: "sampling-central", audience_id: localId.trim() },
      {
        onSuccess: (p) => {
          setPreview(p)
          onPreviewLoaded(p)
          onChange({ ...value, audience_id: localId.trim() })
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="sc-audience-id">Sampling Central Audience ID</Label>
        <div className="flex gap-2">
          <Input
            id="sc-audience-id"
            placeholder="sc-audience-abc123"
            value={localId}
            onChange={(e) => setLocalId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleFetch()
              }
            }}
          />
          <Button
            type="button"
            onClick={handleFetch}
            disabled={!localId.trim() || previewMutation.isPending}
            className="cursor-pointer"
          >
            {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
          </Button>
        </div>
      </div>

      {previewMutation.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {(previewMutation.error as Error).message || "Failed to fetch audience"}
        </div>
      )}

      {preview && (
        <div className="rounded-md border bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{preview.name ?? "Audience"}</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {preview.total_count.toLocaleString()} contacts
            {preview.audience_type && <> · {preview.audience_type}</>}
          </div>
          {preview.available_columns.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              Available columns: {preview.available_columns.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/campaigns/audience-picker-sampling-central.tsx
git commit -m "feat(campaigns): sampling-central audience picker with fetch preview"
```

---

## Task 7: Campaign create form

**Files:**
- Create: `app/campaigns/new/page.tsx`
- Create: `components/campaigns/campaign-create-form.tsx`

- [ ] **Step 1: Write the new page wrapper**

Create `app/campaigns/new/page.tsx`:

```tsx
import { PageHeader } from "@/components/page-header"
import { CampaignCreateForm } from "@/components/campaigns/campaign-create-form"

export default function NewCampaignPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <PageHeader title="New Campaign" />
      <CampaignCreateForm />
    </div>
  )
}
```

- [ ] **Step 2: Write the form**

Create `components/campaigns/campaign-create-form.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Combobox } from "@/components/ui/combobox"
import { useAccounts } from "@/hooks/queries/use-accounts"
import { useTemplates } from "@/hooks/queries/use-templates"
import { useChatbotFlows } from "@/hooks/queries"
import { useFlowVariables } from "@/hooks/queries/use-flow-variables"
import { useCreateCampaign } from "@/hooks/queries/use-campaigns"
import { InfoBanner24hr } from "./info-banner-24hr"
import { VariableMappingForm } from "./variable-mapping-form"
import { AudiencePickerSamplingCentral } from "./audience-picker-sampling-central"
import { Loader2 } from "lucide-react"
import type { AudiencePreview } from "@/types/campaigns"

const schema = z
  .object({
    name: z.string().min(1, "Name is required"),
    account_name: z.string().min(1, "Account is required"),
    type: z.enum(["template", "flow"]),
    template_id: z.string().optional(),
    flow_id: z.string().optional(),
    audience_source: z.enum(["sampling-central"]), // v1 only; contacts/csv will be added later
    sc_audience_id: z.string().optional(),
  })
  .refine((data) => (data.type === "template" ? !!data.template_id : !!data.flow_id), {
    message: "Select a template or flow",
    path: ["template_id"],
  })
  .refine((data) => data.audience_source !== "sampling-central" || !!data.sc_audience_id, {
    message: "Audience ID is required",
    path: ["sc_audience_id"],
  })

type FormValues = z.infer<typeof schema>

export function CampaignCreateForm() {
  const router = useRouter()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      account_name: "",
      type: "template",
      audience_source: "sampling-central",
    },
  })

  const { data: accounts } = useAccounts()
  const { data: templatesData } = useTemplates("approved")
  const { data: flowsData } = useChatbotFlows()
  const { mutateAsync: createCampaign, isPending } = useCreateCampaign()

  const type = form.watch("type")
  const templateId = form.watch("template_id")
  const flowId = form.watch("flow_id")

  const { data: flowVars } = useFlowVariables(type === "flow" ? flowId : undefined)
  const [preview, setPreview] = useState<AudiencePreview | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})

  // Determine which variables need mapping
  const variablesToMap: string[] = (() => {
    if (type === "flow") return flowVars?.variables ?? []
    if (type === "template" && templateId) {
      const t = templatesData?.templates.find((t) => t.id === templateId)
      if (!t) return []
      // Extract {{name}} references from body
      const matches = (t.body_content ?? "").match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g) ?? []
      return [...new Set(matches.map((m) => m.slice(2, -2)))]
    }
    return []
  })()

  const onSubmit = async (values: FormValues) => {
    if (!preview) {
      form.setError("sc_audience_id", { message: "Fetch the audience first" })
      return
    }
    const res = await createCampaign({
      name: values.name,
      account_name: values.account_name,
      template_id: values.type === "template" ? values.template_id! : null,
      flow_id: values.type === "flow" ? values.flow_id! : null,
      audience_source: "sampling-central",
      audience_config: {
        audience_id: values.sc_audience_id!,
        column_mapping: columnMapping,
      },
      schedule_at: null,
    })
    router.push(`/campaigns/${res.campaign_id}`)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Campaign name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Diwali Promo 2026" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Account */}
        <FormField
          control={form.control}
          name="account_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>WhatsApp account</FormLabel>
              <FormControl>
                <Combobox
                  value={field.value}
                  onValueChange={field.onChange}
                  options={(accounts ?? []).map((a) => ({ value: a.name, label: a.name }))}
                  placeholder="Pick an account..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Type + picker */}
        <div className="flex flex-col gap-3">
          <Label>Send</Label>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <Tabs value={field.value} onValueChange={(v) => field.onChange(v)}>
                <TabsList className="w-fit">
                  <TabsTrigger value="template" className="cursor-pointer">Template</TabsTrigger>
                  <TabsTrigger value="flow" className="cursor-pointer">Flow</TabsTrigger>
                </TabsList>

                <TabsContent value="template" className="mt-3">
                  <FormField
                    control={form.control}
                    name="template_id"
                    render={({ field: tfield }) => (
                      <FormItem>
                        <FormControl>
                          <Combobox
                            value={tfield.value ?? ""}
                            onValueChange={tfield.onChange}
                            options={(templatesData?.templates ?? []).map((t) => ({
                              value: t.id,
                              label: t.name,
                            }))}
                            placeholder="Pick a template..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="flow" className="mt-3 space-y-3">
                  <FormField
                    control={form.control}
                    name="flow_id"
                    render={({ field: ffield }) => (
                      <FormItem>
                        <FormControl>
                          <Combobox
                            value={ffield.value ?? ""}
                            onValueChange={ffield.onChange}
                            options={(flowsData?.flows ?? []).map((f) => ({
                              value: f.id,
                              label: f.name,
                            }))}
                            placeholder="Pick a flow..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <InfoBanner24hr />
                </TabsContent>
              </Tabs>
            )}
          />
        </div>

        {/* Audience — SC only in v1 */}
        <div className="flex flex-col gap-3">
          <Label>Audience</Label>
          <FormField
            control={form.control}
            name="sc_audience_id"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <AudiencePickerSamplingCentral
                    value={{ audience_id: field.value ?? "", column_mapping: columnMapping }}
                    onChange={(v) => {
                      field.onChange(v.audience_id)
                      setColumnMapping(v.column_mapping)
                    }}
                    onPreviewLoaded={(p) => setPreview(p)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Variable mapping — only when we have preview + variables to map */}
        {preview && variablesToMap.length > 0 && (
          <VariableMappingForm
            variables={variablesToMap}
            availableColumns={preview.available_columns}
            value={columnMapping}
            onChange={setColumnMapping}
          />
        )}

        {/* Submit */}
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isPending} className="cursor-pointer">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Campaign
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/campaigns")}
            className="cursor-pointer"
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
```

**Note:** the `Combobox` component may or may not exist with that exact API in this codebase. Check `components/ui/combobox.tsx`. If the API is different (e.g. you must pass children), adapt accordingly. Use a searchable Popover + Command pattern if no Combobox wrapper exists.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Fix any import errors. Common issues:
- `useChatbotFlows` may be exported from a different path — search `hooks/queries/`
- `useTemplates` signature — check existing usage
- `useAccounts` signature

- [ ] **Step 4: Visual verify in browser**

```bash
# Dev server already running from earlier tasks
# Open http://localhost:3002/campaigns/new
```

Expected: the form renders, all fields work, tabs switch between template and flow, info banner shows under the flow tab.

- [ ] **Step 5: Commit**

```bash
git add app/campaigns/new/page.tsx components/campaigns/campaign-create-form.tsx
git commit -m "feat(campaigns): create form with SC audience + variable mapping"
```

---

## Task 8: Campaign detail page

**Files:**
- Create: `app/campaigns/[id]/page.tsx`
- Create: `components/campaigns/campaign-detail.tsx`
- Create: `components/campaigns/recipient-table.tsx`

- [ ] **Step 1: Detail page wrapper**

Create `app/campaigns/[id]/page.tsx`:

```tsx
"use client"

import { useParams } from "next/navigation"
import { useCampaign } from "@/hooks/queries/use-campaigns"
import { CampaignDetail } from "@/components/campaigns/campaign-detail"

export default function CampaignDetailPage() {
  const params = useParams()
  const id = typeof params?.id === "string" ? params.id : undefined
  const { data, isLoading, isError } = useCampaign(id)

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>
  if (isError || !data) return <div className="p-6 text-destructive">Campaign not found</div>

  return <CampaignDetail campaign={data.campaign} />
}
```

- [ ] **Step 2: Detail layout component**

Create `components/campaigns/campaign-detail.tsx`:

```tsx
"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/page-header"
import { CampaignStatusBadge } from "./campaign-status-badge"
import { RecipientTable } from "./recipient-table"
import { useStartCampaign, usePauseCampaign, useCancelCampaign } from "@/hooks/queries/use-campaigns"
import type { Campaign } from "@/types/campaigns"
import { FileText, GitBranch } from "lucide-react"

export function CampaignDetail({ campaign }: { campaign: Campaign }) {
  const { mutate: startCampaign, isPending: starting } = useStartCampaign()
  const { mutate: pauseCampaign, isPending: pausing } = usePauseCampaign()
  const { mutate: cancelCampaign, isPending: cancelling } = useCancelCampaign()

  const canStart = campaign.status === "draft" || campaign.status === "scheduled"
  const canPause = campaign.status === "running"
  const canCancel = campaign.status === "running" || campaign.status === "paused" || campaign.status === "scheduled"

  const progressPct = campaign.total_recipients
    ? Math.round(((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100)
    : 0

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={campaign.name}>
        <div className="flex items-center gap-2">
          {canStart && (
            <Button onClick={() => startCampaign(campaign.id)} disabled={starting} className="cursor-pointer">
              Start Campaign
            </Button>
          )}
          {canPause && (
            <Button variant="outline" onClick={() => pauseCampaign(campaign.id)} disabled={pausing} className="cursor-pointer">
              Pause
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" onClick={() => cancelCampaign(campaign.id)} disabled={cancelling} className="cursor-pointer">
              Cancel
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <CampaignStatusBadge status={campaign.status} />
        <span className="flex items-center gap-1.5">
          {campaign.flow_id ? <GitBranch className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
          {campaign.flow_id ? "Flow campaign" : "Template campaign"}
        </span>
        <span>·</span>
        <span>{campaign.account_name}</span>
        {campaign.source_system && (
          <>
            <span>·</span>
            <span>
              Source: {campaign.source_system}
              {campaign.source_external_id ? ` / ${campaign.source_external_id}` : ""}
            </span>
          </>
        )}
      </div>

      <Progress value={progressPct} className="h-2" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Recipients" value={campaign.total_recipients} />
        <Stat label="Sent" value={campaign.sent_count} />
        <Stat label="Delivered" value={campaign.delivered_count} />
        <Stat label="Read" value={campaign.read_count} />
        <Stat label="Failed" value={campaign.failed_count} highlight="destructive" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipientTable campaignId={campaign.id} />
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: "destructive"
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          highlight === "destructive" && value > 0 ? "text-destructive" : ""
        }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Recipient table component**

Create `components/campaigns/recipient-table.tsx`:

```tsx
"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCampaignRecipients } from "@/hooks/queries/use-campaigns"

export function RecipientTable({ campaignId }: { campaignId: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useCampaignRecipients(campaignId)

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading recipients...</div>

  const allRecipients = data?.pages.flatMap((p) => p.recipients) ?? []

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Delivered</TableHead>
            <TableHead>Read</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allRecipients.map((r) => (
            <TableRow key={r.id} className="hover:bg-muted">
              <TableCell className="font-mono text-sm">{r.phone_number}</TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.sent_at ? new Date(r.sent_at).toLocaleTimeString() : "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.delivered_at ? new Date(r.delivered_at).toLocaleTimeString() : "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.read_at ? new Date(r.read_at).toLocaleTimeString() : "—"}
              </TableCell>
              <TableCell className="max-w-xs truncate text-sm text-destructive">
                {r.error_message ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {hasNextPage && (
        <div className="flex justify-center mt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="cursor-pointer"
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Type check + visual verify**

```bash
npx tsc --noEmit
# Open http://localhost:3002/campaigns/<existing-id> — or create one via the form first
```

- [ ] **Step 5: Commit**

```bash
git add app/campaigns/[id]/page.tsx components/campaigns/campaign-detail.tsx components/campaigns/recipient-table.tsx
git commit -m "feat(campaigns): detail page with counters, progress bar, recipient table"
```

---

## Task 9: WebSocket live updates

**Files:**
- Create: `lib/campaigns-ws.ts`
- Modify: `components/campaigns/campaign-detail.tsx`

- [ ] **Step 1: Check existing WebSocket infrastructure**

Look at how existing chat features subscribe to the WebSocket. Relevant files:
- `lib/websocket-client.ts` or similar
- `contexts/websocket-context.tsx` or `hooks/use-websocket.ts`

The Vue version broadcasts `campaign_stats_update` events on the WebSocket. Find the existing subscription pattern and match it.

- [ ] **Step 2: Write a hook that invalidates campaign detail on stats update**

Create `lib/campaigns-ws.ts` (or add to an existing ws subscription file):

```ts
import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { campaignKeys } from "@/hooks/queries/query-keys"
// Import existing websocket subscribe function
import { subscribeWebSocket } from "@/lib/websocket" // adjust path

export function useCampaignStatsSubscription(campaignId: string) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!campaignId) return
    const unsubscribe = subscribeWebSocket((msg) => {
      if (msg.type === "campaign_stats_update" && msg.payload?.campaign_id === campaignId) {
        qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) })
        qc.invalidateQueries({ queryKey: [...campaignKeys.details(), campaignId, "recipients"] })
      }
    })
    return unsubscribe
  }, [campaignId, qc])
}
```

- [ ] **Step 3: Wire into the detail page**

In `components/campaigns/campaign-detail.tsx`, call the hook at the top:

```tsx
import { useCampaignStatsSubscription } from "@/lib/campaigns-ws"
// ...
export function CampaignDetail({ campaign }: { campaign: Campaign }) {
  useCampaignStatsSubscription(campaign.id)
  // ... rest
}
```

- [ ] **Step 4: Verify in browser**

Trigger a test campaign start (via the backend curl from backend Task 12). Open the detail page. Watch the counters increment in real time as the worker dispatches.

- [ ] **Step 5: Commit**

```bash
git add lib/campaigns-ws.ts components/campaigns/campaign-detail.tsx
git commit -m "feat(campaigns): WebSocket live stats updates on detail page"
```

---

## Task 10: RBAC verification + final pass

- [ ] **Step 1: Verify permissions fallback**

Open `lib/permissions.ts`. Confirm `DEFAULT_ROLE_FEATURES` has `campaigns` enabled for admin and manager roles. If not, add it:

```ts
export const DEFAULT_ROLE_FEATURES: Record<Role, Feature[]> = {
  admin: [..., "campaigns"],
  manager: [..., "campaigns"],
  agent: [...], // agents do NOT get campaigns
}
```

- [ ] **Step 2: Final type check**

```bash
npx tsc --noEmit
```

Expected: no errors in any new file.

- [ ] **Step 3: Run unit tests (if vitest suite covers any of the new files)**

```bash
npx vitest run components/campaigns
```

Expected: no tests exist yet for these files; vitest may report "No test files found", which is fine for v1. Add tests in a follow-up.

- [ ] **Step 4: Smoke test end-to-end**

With backend running and sampling-central stub reachable:

1. Navigate to `/campaigns` — should show empty state
2. Click New Campaign
3. Fill in name, account, pick Flow, pick a flow
4. Paste a test audience ID, click Fetch — should show count + columns
5. Map flow variables to SC columns
6. Click Start Campaign
7. Should redirect to `/campaigns/{id}` with live counters
8. Watch counters update as worker dispatches

- [ ] **Step 5: Commit any final fixes**

```bash
git add -u
git commit -m "chore: RBAC and final pass"
```

- [ ] **Step 6: Push**

```bash
git push -u origin plan/broadcasting-flow-extensibility
```

---

## Summary

10 tasks land the magic-flow frontend side of broadcasting:

1. React Query hooks + types
2. Flow variables hook
3. Campaigns list page + nav
4. Info banner component
5. Variable mapping form
6. Sampling-central audience picker
7. Campaign create form
8. Campaign detail page
9. WebSocket live updates
10. RBAC + final pass

Execution depends on the backend plan landing first for flow-campaign testing, but pages 1-4 (list, badge, banner, mapping form) can be built in parallel on mocked data.

## Deferred for v1.1

- `Contacts` audience tab (reuse `useContactFilterUI`) — backend support exists, frontend tab just needs wiring
- `CSV` audience tab — backend staging endpoint needed first
- Flow variable mapping validation warning ("your mapping doesn't cover `customer_name`")
- Unit tests for components (vitest)
- Pause/resume confirmation dialogs (use AlertDialog per CLAUDE.md UI rules)
