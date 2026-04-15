# Broadcasting — Frontend Implementation Plan (magic-flow)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port fs-whatsapp's existing Vue `CampaignsView.vue` to a React page in magic-flow under `app/campaigns/`, extended to support flow broadcasts and a sampling-central audience source (via a pasted audience ID).

**Architecture:**

- New pages under `app/campaigns/` (Next.js App Router).
- React Query hooks in `hooks/queries/use-campaigns.ts` following the existing factory pattern.
- `LOCAL_PREFIXES` in `lib/api-client.ts` is narrowed from `/api/campaigns` to `/api/campaigns/create` so that new campaign endpoints go directly to fs-whatsapp instead of Next.js.
- No `Combobox` wrapper exists in this codebase — searchable dropdowns use `<Popover> + <Command> + CommandInput + CommandList + CommandItem` directly, per `components/nodes/action/whatsapp-flow-node.tsx:13`. This plan follows that pattern.
- WebSocket stats subscription reuses the existing `useWebSocket()` hook at `hooks/use-websocket.ts:195` which returns `{ subscribe, sendEvent, isConnected }`.
- Only the sampling-central audience source is implemented in v1. Contacts filter and CSV upload are deferred to v1.1 (spec documents this).
- UI follows `magic-flow/CLAUDE.md` design rules: shadcn components only, `hover:bg-muted` not `hover:bg-accent`, `cursor-pointer` on clickables, `PageHeader` component for dashboard headers.

**Tech stack:** Next.js 14 (App Router), React 18, TanStack React Query v5 (verified via existing hooks), shadcn/ui (React), Tailwind, Zod + react-hook-form + shadcn Form kit. Existing `apiClient` at `lib/api-client.ts` for all fs-whatsapp calls.

---

## Spec

See `docs/superpowers/specs/2026-04-15-broadcasting-flow-extensibility-design.md`. Read it first.

## Prerequisites

The fs-whatsapp backend plan (`fs-whatsapp/docs/superpowers/plans/2026-04-15-broadcasting-backend.md`) must be merged before flow-campaign and SC-source end-to-end tests work. The list page can be built first against existing template-only backend.

---

## Ground-truth file pointers (verified at plan time)

- `apiClient` at `lib/api-client.ts` — `get<T>(url)`, `post<T>(url, body)`, `put<T>(url, body)`, `delete<T>(url)`, `fetch<T>(url, options)`, `raw(url, options)`. All unwrap the fs-whatsapp envelope `{status, data}` via `unwrapEnvelope`. TypeScript generics work.
- `LOCAL_PREFIXES` at `lib/api-client.ts:4` — currently `["/api/auth/", "/api/ai/", "/api/test-api", "/api/campaigns", "/api/debug"]`. The `/api/campaigns` entry must be narrowed to `/api/campaigns/create` so other campaign routes reach fs-whatsapp.
- `useChatbotFlows()` at `hooks/queries/use-chatbot.ts:14` — returns `UseQueryResult<ChatbotFlow[]>`. `data` is `ChatbotFlow[]` directly, NOT `{flows: [...]}`. Iterate with `data?.map(...)`.
- `useTemplates(status?)` at `hooks/queries/use-templates.ts:14` — returns `UseQueryResult<any[]>`. `data` is `any[]` directly. Pass `"APPROVED"` (uppercase — matches backend `TemplateStatusApproved = "APPROVED"` at `fs-whatsapp/internal/models/constants.go:158`).
- `useAccounts()` — returns `Account[]` directly (verified pattern).
- `useWebSocket()` at `hooks/use-websocket.ts:195` — returns `{ subscribe, sendEvent, isConnected }`. Usage: `const { subscribe } = useWebSocket(); useEffect(() => subscribe("event_type", handler), [])` — subscribe returns an unsubscribe function which you return from the effect cleanup. Provider is mounted globally via `WebSocketProvider` in `app-shell.tsx`.
- `FeatureGate` component at `components/feature-gate.tsx` — `<FeatureGate feature="campaigns">...</FeatureGate>`
- `PageHeader` component at `components/page-header.tsx` — `<PageHeader title="..." />` with optional children for action buttons
- `Combobox` component DOES NOT exist — `ls components/ui/ | grep combobox` returns nothing. Use `<Popover> + <Command>` from `components/ui/popover.tsx` + `components/ui/command.tsx`. Pattern: see `components/nodes/action/whatsapp-flow-node.tsx:13`.
- `campaigns` feature is already in `DEFAULT_ROLE_FEATURES` at `lib/permissions.ts:7,26,31` for admin + manager roles. No permission file changes needed.
- Existing Next.js route that must stay local: `app/api/campaigns/create/route.ts` (flow-publishing helper, NOT a CRUD endpoint). This is why we narrow `LOCAL_PREFIXES` to `/api/campaigns/create` specifically.

---

## File Structure

**New files:**
- `types/campaigns.ts` — TypeScript types
- `hooks/queries/use-campaigns.ts` — React Query hooks
- `hooks/queries/use-flow-variables.ts` — hook for `GET /api/chatbot/flows/{id}/variables`
- `app/(dashboard)/campaigns/layout.tsx` — shell with `FeatureGate`
- `app/(dashboard)/campaigns/page.tsx` — list page
- `app/(dashboard)/campaigns/new/page.tsx` — create form wrapper
- `app/(dashboard)/campaigns/[id]/page.tsx` — detail page wrapper
- `components/campaigns/campaign-list.tsx`
- `components/campaigns/campaign-detail.tsx`
- `components/campaigns/campaign-create-form.tsx`
- `components/campaigns/audience-picker-sampling-central.tsx`
- `components/campaigns/variable-mapping-form.tsx`
- `components/campaigns/info-banner-24hr.tsx`
- `components/campaigns/campaign-status-badge.tsx`
- `components/campaigns/recipient-table.tsx`
- `components/campaigns/searchable-picker.tsx` — reusable Popover+Command wrapper used for account/template/flow pickers
- `components/campaigns/use-campaign-stats-subscription.ts` — WebSocket subscription hook

**Modified files:**
- `lib/api-client.ts` — narrow `/api/campaigns` → `/api/campaigns/create` in `LOCAL_PREFIXES`
- `components/app-sidebar.tsx` — add Campaigns nav item
- `hooks/queries/query-keys.ts` — extend with `campaignKeys` factory (if that file is the one re-exporting; otherwise inline in `use-campaigns.ts`)

**Note on App Router layout:** magic-flow uses Next.js App Router under `app/`. Dashboard pages live under `app/(dashboard)/` based on the existing `app/(dashboard)/chat/page.tsx` structure confirmed during verification. Place new campaign pages accordingly.

---

## Task 0: Narrow LOCAL_PREFIXES

**Files:**
- Modify: `lib/api-client.ts`

Without this fix, every campaign hook will 404 because `/api/campaigns/*` routes to Next.js which only has `/api/campaigns/create`.

- [ ] **Step 1: Edit the prefixes**

Open `lib/api-client.ts:4`. Change:

```ts
const LOCAL_PREFIXES = ["/api/auth/", "/api/ai/", "/api/test-api", "/api/campaigns", "/api/debug"]
```

to:

```ts
// Keep /api/campaigns/create local because the Next.js handler at
// app/api/campaigns/create/route.ts does flow-publishing transformation
// before calling fs-whatsapp. All OTHER /api/campaigns/* routes should
// go directly to fs-whatsapp — they're pure CRUD and have no server-side
// secrets.
const LOCAL_PREFIXES = ["/api/auth/", "/api/ai/", "/api/test-api", "/api/campaigns/create", "/api/debug"]
```

- [ ] **Step 2: Verify the existing flow-publishing route still works**

Grep the frontend for callers of the local `/api/campaigns/create` endpoint:

```bash
grep -rn "/api/campaigns/create" /Users/pratikgupta/Freestand/magic-flow/ --include="*.ts" --include="*.tsx" | grep -v ".worktrees"
```

Confirm there's at least one caller (likely in the publish flow). The narrower prefix still matches these calls.

- [ ] **Step 3: Type check**

```bash
cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/broadcasting-plans
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/api-client.ts
git commit -m "fix(api-client): narrow /api/campaigns LOCAL_PREFIXES to /api/campaigns/create"
```

---

## Task 1: Types + React Query hooks

**Files:**
- Create: `types/campaigns.ts`
- Create: `hooks/queries/use-campaigns.ts`

- [ ] **Step 1: Write the types**

Create `types/campaigns.ts`:

```ts
// Campaign statuses mirror fs-whatsapp/internal/models/constants.go:143-151.
// NOTE: "processing" (not "running") matches the backend enum.
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "processing"
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
  id: string
  name: string
  account_name: string
  template_id: string | null
  flow_id: string | null
  audience_source: AudienceSource
  status: CampaignStatus
  total_recipients: number
  contacts_created?: number
  contacts_reused?: number
  invalid_phones?: number
}
```

- [ ] **Step 2: Write the hooks file**

Create `hooks/queries/use-campaigns.ts`:

```ts
import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type {
  Campaign,
  CampaignRecipient,
  AudiencePreview,
  CreateCampaignInput,
  CreateCampaignResponse,
  CampaignStatus,
} from "@/types/campaigns"

export const campaignKeys = {
  all: ["campaigns"] as const,
  lists: () => [...campaignKeys.all, "list"] as const,
  list: (filters: Record<string, unknown> = {}) => [...campaignKeys.lists(), filters] as const,
  details: () => [...campaignKeys.all, "detail"] as const,
  detail: (id: string) => [...campaignKeys.details(), id] as const,
  recipients: (campaignId: string) => [...campaignKeys.detail(campaignId), "recipients"] as const,
} as const

export function useCampaigns(filters: { status?: CampaignStatus } = {}) {
  return useQuery({
    queryKey: campaignKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.status) params.set("status", filters.status)
      const qs = params.toString() ? `?${params}` : ""
      return apiClient.get<{ campaigns: Campaign[]; total: number }>(`/api/campaigns${qs}`)
    },
    staleTime: 30 * 1000,
  })
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.detail(id ?? ""),
    queryFn: () => apiClient.get<Campaign>(`/api/campaigns/${id}`),
    enabled: Boolean(id),
    staleTime: 10 * 1000,
  })
}

export function useCampaignRecipients(campaignId: string | undefined) {
  return useInfiniteQuery({
    queryKey: campaignKeys.recipients(campaignId ?? ""),
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

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit 2>&1 | grep -E "(campaigns|campaign)" | head -20
```

Expected: no errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add types/campaigns.ts hooks/queries/use-campaigns.ts
git commit -m "feat(campaigns): types and React Query hooks"
```

---

## Task 2: Flow variables hook

**Files:**
- Create: `hooks/queries/use-flow-variables.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { chatbotKeys } from "./use-chatbot"

/**
 * Fetch the set of {{variable}} names referenced anywhere in a flow's nodes.
 * Backed by GET /api/campaigns/flow-variables/{id} on fs-whatsapp.
 *
 * The endpoint lives under /api/campaigns (not /api/chatbot) so it inherits
 * the "campaigns" RBAC feature requirement — reading flow variables for a
 * broadcast doesn't need full chatbot-settings access. See the backend plan's
 * Task 6 Step 5 for the reasoning.
 */
export function useFlowVariables(flowId: string | undefined) {
  return useQuery({
    queryKey: [...chatbotKeys.flows(), flowId, "variables"],
    queryFn: () => apiClient.get<{ variables: string[] }>(`/api/campaigns/flow-variables/${flowId}`),
    enabled: Boolean(flowId),
    staleTime: 5 * 60 * 1000, // flow variables rarely change
  })
}
```

Extends `chatbotKeys` from `use-chatbot.ts:4` instead of hardcoding a query key — preserves the factory pattern.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit 2>&1 | grep "use-flow-variables" | head
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/queries/use-flow-variables.ts
git commit -m "feat(flows): useFlowVariables hook"
```

---

## Task 3: Searchable picker primitive

**Files:**
- Create: `components/campaigns/searchable-picker.tsx`

A single reusable `<SearchablePicker>` wrapping `Popover + Command + CommandInput + CommandList` — used for account, template, and flow pickers in the create form. Avoids repeating the pattern three times, and avoids a non-existent `Combobox` import.

- [ ] **Step 1: Write the component**

Create `components/campaigns/searchable-picker.tsx`:

```tsx
"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface SearchablePickerOption {
  value: string
  label: string
  description?: string
}

interface SearchablePickerProps {
  options: SearchablePickerOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
}

export function SearchablePicker({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  emptyMessage = "No results found.",
  disabled,
}: SearchablePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal cursor-pointer",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                  className="cursor-pointer hover:bg-muted"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    {option.description && (
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit 2>&1 | grep "searchable-picker" | head
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/campaigns/searchable-picker.tsx
git commit -m "feat(campaigns): reusable SearchablePicker wrapping Popover+Command"
```

---

## Task 4: Status badge component

**Files:**
- Create: `components/campaigns/campaign-status-badge.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Badge } from "@/components/ui/badge"
import type { CampaignStatus } from "@/types/campaigns"
import { cn } from "@/lib/utils"

// Note: "processing" (not "running") matches the backend enum at
// fs-whatsapp/internal/models/constants.go:143-151.
const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft:      "bg-muted text-muted-foreground",
  scheduled:  "bg-info/10 text-info",
  queued:     "bg-info/10 text-info",
  processing: "bg-primary/10 text-primary",
  paused:     "bg-warning/10 text-warning",
  completed:  "bg-success/10 text-success",
  cancelled:  "bg-muted text-muted-foreground",
  failed:     "bg-destructive/10 text-destructive",
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status])}>
      {status}
    </Badge>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/campaigns/campaign-status-badge.tsx
git commit -m "feat(campaigns): status badge component"
```

---

## Task 5: Info banner component

**Files:**
- Create: `components/campaigns/info-banner-24hr.tsx`

- [ ] **Step 1: Write the component**

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
        If your flow doesn&apos;t start with a template message, only contacts who&apos;ve
        messaged you in the last 24 hours will receive it. Add a template node at the start
        to reach everyone.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/campaigns/info-banner-24hr.tsx
git commit -m "feat(campaigns): 24hr window info banner"
```

---

## Task 6: Variable mapping form

**Files:**
- Create: `components/campaigns/variable-mapping-form.tsx`

- [ ] **Step 1: Write the component**

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
  /** Variable names that need values (e.g. ["customer_name", "city"]) */
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
  const sortedVars = useMemo(() => [...variables].sort(), [variables])

  const handleChange = (variable: string, column: string) => {
    const next = { ...value }
    if (column === DONT_MAP) {
      delete next[variable]
    } else {
      next[variable] = column
    }
    onChange(next)
  }

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

- [ ] **Step 2: Commit**

```bash
git add components/campaigns/variable-mapping-form.tsx
git commit -m "feat(campaigns): variable mapping form"
```

---

## Task 7: Sampling-central audience picker

**Files:**
- Create: `components/campaigns/audience-picker-sampling-central.tsx`

- [ ] **Step 1: Write the component**

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
  value: string // the audience_id
  onChange: (audienceId: string) => void
  onPreviewLoaded: (preview: AudiencePreview) => void
}

export function AudiencePickerSamplingCentral({ value, onChange, onPreviewLoaded }: Props) {
  const [localId, setLocalId] = useState(value)
  const [preview, setPreview] = useState<AudiencePreview | null>(null)
  const previewMutation = usePreviewAudience()

  const handleFetch = () => {
    const trimmed = localId.trim()
    if (!trimmed) return
    previewMutation.mutate(
      { source: "sampling-central", audience_id: trimmed },
      {
        onSuccess: (p) => {
          setPreview(p)
          onPreviewLoaded(p)
          onChange(trimmed)
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="sc-audience-id">Sampling Central audience ID</Label>
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

- [ ] **Step 2: Commit**

```bash
git add components/campaigns/audience-picker-sampling-central.tsx
git commit -m "feat(campaigns): sampling-central audience picker with preview"
```

---

## Task 8: Campaigns list page + nav

**Files:**
- Create: `app/(dashboard)/campaigns/layout.tsx`
- Create: `app/(dashboard)/campaigns/page.tsx`
- Create: `components/campaigns/campaign-list.tsx`
- Modify: `components/app-sidebar.tsx`

- [ ] **Step 1: Verify the dashboard route group**

```bash
ls /Users/pratikgupta/Freestand/magic-flow/.worktrees/broadcasting-plans/app/\(dashboard\)/
```

Confirm it exists. If the project uses a different layout convention (e.g. `app/` directly without a route group), drop the `(dashboard)` segment from the paths below and place files under `app/campaigns/`.

- [ ] **Step 2: Write the layout**

Create `app/(dashboard)/campaigns/layout.tsx`:

```tsx
import { FeatureGate } from "@/components/feature-gate"

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="campaigns">{children}</FeatureGate>
}
```

- [ ] **Step 3: Write the list page**

Create `app/(dashboard)/campaigns/page.tsx`:

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
          <Link href="/campaigns/new" className="cursor-pointer">
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

- [ ] **Step 4: Write the list component**

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

- [ ] **Step 5: Add Campaigns to the sidebar nav**

Open `components/app-sidebar.tsx`. Find the existing nav items array. Add a new entry; check for an existing nav item with a `feature` field to copy the format:

```tsx
{ title: "Campaigns", url: "/campaigns", icon: Megaphone, feature: "campaigns" as const },
```

Import `Megaphone` from `lucide-react` at the top of the file if not already imported. Place the nav item near the other dashboard-level items (Chat, Contacts, etc.).

- [ ] **Step 6: Type check + visual verify**

```bash
npx tsc --noEmit 2>&1 | grep -E "(campaigns|Campaign)" | head -20
docker compose up -d
# Wait, then open http://localhost:3002/campaigns
```

Expected: page renders with either an empty state or an existing campaigns table. Sidebar shows "Campaigns" nav.

- [ ] **Step 7: Commit**

```bash
git add app/\(dashboard\)/campaigns/layout.tsx app/\(dashboard\)/campaigns/page.tsx components/campaigns/campaign-list.tsx components/app-sidebar.tsx
git commit -m "feat(campaigns): list page + sidebar nav"
```

---

## Task 9: Campaign create form

**Files:**
- Create: `app/(dashboard)/campaigns/new/page.tsx`
- Create: `components/campaigns/campaign-create-form.tsx`

- [ ] **Step 1: Page wrapper**

Create `app/(dashboard)/campaigns/new/page.tsx`:

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

- [ ] **Step 2: Create form**

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
import { Loader2 } from "lucide-react"
import { useAccounts } from "@/hooks/queries/use-accounts"
import { useTemplates } from "@/hooks/queries/use-templates"
import { useChatbotFlows } from "@/hooks/queries/use-chatbot"
import { useFlowVariables } from "@/hooks/queries/use-flow-variables"
import { useCreateCampaign } from "@/hooks/queries/use-campaigns"
import { SearchablePicker } from "./searchable-picker"
import { InfoBanner24hr } from "./info-banner-24hr"
import { VariableMappingForm } from "./variable-mapping-form"
import { AudiencePickerSamplingCentral } from "./audience-picker-sampling-central"
import type { AudiencePreview } from "@/types/campaigns"

const schema = z
  .object({
    name: z.string().min(1, "Name is required"),
    account_name: z.string().min(1, "Account is required"),
    type: z.enum(["template", "flow"]),
    template_id: z.string().optional(),
    flow_id: z.string().optional(),
    sc_audience_id: z.string().optional(),
  })
  .refine((data) => (data.type === "template" ? !!data.template_id : !!data.flow_id), {
    message: "Pick a template or flow",
    path: ["template_id"],
  })
  .refine((data) => !!data.sc_audience_id, {
    message: "Audience ID is required",
    path: ["sc_audience_id"],
  })

type FormValues = z.infer<typeof schema>

// Extract {{name}} refs from template body (ignore dotted names like session.x)
function extractTemplatePlaceholders(body: string | undefined): string[] {
  if (!body) return []
  const set = new Set<string>()
  for (const m of body.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g)) {
    const name = m[1]
    if (!name.includes(".")) set.add(name)
  }
  return Array.from(set)
}

export function CampaignCreateForm() {
  const router = useRouter()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", account_name: "", type: "template" },
  })

  // Existing hooks — verified signatures:
  //   useAccounts() → Account[] directly
  //   useTemplates("APPROVED") → any[] directly (note: uppercase APPROVED matches backend enum)
  //   useChatbotFlows() → ChatbotFlow[] directly (NOT { flows: [...] })
  const { data: accounts } = useAccounts()
  const { data: templates } = useTemplates("APPROVED")
  const { data: flows } = useChatbotFlows()
  const { mutateAsync: createCampaign, isPending } = useCreateCampaign()

  const type = form.watch("type")
  const templateId = form.watch("template_id")
  const flowId = form.watch("flow_id")

  const { data: flowVars } = useFlowVariables(type === "flow" ? flowId : undefined)
  const [preview, setPreview] = useState<AudiencePreview | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})

  // Variables that need mapping
  const variablesToMap: string[] = (() => {
    if (type === "flow") return flowVars?.variables ?? []
    if (type === "template" && templateId) {
      const t = (templates ?? []).find((tpl: any) => tpl.id === templateId)
      return extractTemplatePlaceholders(t?.body_content)
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
    router.push(`/campaigns/${res.id}`)
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
                <SearchablePicker
                  value={field.value}
                  onValueChange={field.onChange}
                  options={(accounts ?? []).map((a: any) => ({ value: a.name, label: a.name }))}
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
                  <TabsTrigger value="template" className="cursor-pointer">
                    Template
                  </TabsTrigger>
                  <TabsTrigger value="flow" className="cursor-pointer">
                    Flow
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="template" className="mt-3">
                  <FormField
                    control={form.control}
                    name="template_id"
                    render={({ field: tfield }) => (
                      <FormItem>
                        <FormControl>
                          <SearchablePicker
                            value={tfield.value ?? ""}
                            onValueChange={tfield.onChange}
                            options={(templates ?? []).map((t: any) => ({
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
                          <SearchablePicker
                            value={ffield.value ?? ""}
                            onValueChange={ffield.onChange}
                            options={(flows ?? []).map((f) => ({
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
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onPreviewLoaded={setPreview}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Variable mapping — only shown after preview + when vars exist */}
        {preview && variablesToMap.length > 0 && (
          <VariableMappingForm
            variables={variablesToMap}
            availableColumns={preview.available_columns}
            value={columnMapping}
            onChange={setColumnMapping}
          />
        )}

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

**Key fixes vs the first draft:**
- `useTemplates("APPROVED")` — uppercase, matches backend enum
- `(templates ?? []).find(...)` — templates is the array directly, not `.templates` wrapper
- `(flows ?? []).map(...)` — flows is the array directly, not `.flows` wrapper
- `SearchablePicker` import from `./searchable-picker` — no `@/components/ui/combobox` which doesn't exist
- `res.id` (not `res.campaign_id`) — backend returns `{id, ...}` per the rewritten `CreateCampaign` in the backend plan

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit 2>&1 | grep -E "campaign-create-form" | head
```

Fix any errors. Common issues:
- `useAccounts` return type may have `Account[]` typed or `any[]` — the `any` cast `(a: any)` handles both
- Template body field may be called `body_content` or `body` — check `useTemplates` shape and adjust `extractTemplatePlaceholders` accordingly

- [ ] **Step 4: Visual verify**

Open `http://localhost:3002/campaigns/new`. Confirm:
- Three searchable pickers (account, template, flow) work
- Tabs switch between template and flow
- Info banner appears under the Flow tab
- Audience ID input + Fetch button works (will error until backend is running with SC config, but should call the preview endpoint)

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/campaigns/new/page.tsx components/campaigns/campaign-create-form.tsx
git commit -m "feat(campaigns): create form with SC audience + variable mapping"
```

---

## Task 10: Campaign detail page + recipient table

**Files:**
- Create: `app/(dashboard)/campaigns/[id]/page.tsx`
- Create: `components/campaigns/campaign-detail.tsx`
- Create: `components/campaigns/recipient-table.tsx`

- [ ] **Step 1: Page wrapper**

Create `app/(dashboard)/campaigns/[id]/page.tsx`:

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

  return <CampaignDetail campaign={data} />
}
```

Note: `useCampaign` returns `Campaign` directly (not wrapped), since `apiClient.get` unwraps the envelope.

- [ ] **Step 2: Detail layout**

Create `components/campaigns/campaign-detail.tsx`:

```tsx
"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/page-header"
import { CampaignStatusBadge } from "./campaign-status-badge"
import { RecipientTable } from "./recipient-table"
import { useCampaignStatsSubscription } from "./use-campaign-stats-subscription"
import {
  useStartCampaign,
  usePauseCampaign,
  useCancelCampaign,
} from "@/hooks/queries/use-campaigns"
import type { Campaign } from "@/types/campaigns"
import { FileText, GitBranch } from "lucide-react"

export function CampaignDetail({ campaign }: { campaign: Campaign }) {
  useCampaignStatsSubscription(campaign.id)

  const { mutate: startCampaign, isPending: starting } = useStartCampaign()
  const { mutate: pauseCampaign, isPending: pausing } = usePauseCampaign()
  const { mutate: cancelCampaign, isPending: cancelling } = useCancelCampaign()

  const canStart = campaign.status === "draft" || campaign.status === "scheduled"
  const canPause = campaign.status === "processing"
  const canCancel =
    campaign.status === "processing" ||
    campaign.status === "paused" ||
    campaign.status === "scheduled"

  const progressPct = campaign.total_recipients
    ? Math.round(
        ((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100,
      )
    : 0

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={campaign.name}>
        <div className="flex items-center gap-2">
          {canStart && (
            <Button
              onClick={() => startCampaign(campaign.id)}
              disabled={starting}
              className="cursor-pointer"
            >
              Start Campaign
            </Button>
          )}
          {canPause && (
            <Button
              variant="outline"
              onClick={() => pauseCampaign(campaign.id)}
              disabled={pausing}
              className="cursor-pointer"
            >
              Pause
            </Button>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              onClick={() => cancelCampaign(campaign.id)}
              disabled={cancelling}
              className="cursor-pointer"
            >
              Cancel
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
        <CampaignStatusBadge status={campaign.status} />
        <span className="flex items-center gap-1.5">
          {campaign.flow_id ? (
            <GitBranch className="h-3.5 w-3.5" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
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

- [ ] **Step 3: Recipient table**

Create `components/campaigns/recipient-table.tsx`:

```tsx
"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCampaignRecipients } from "@/hooks/queries/use-campaigns"

export function RecipientTable({ campaignId }: { campaignId: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useCampaignRecipients(campaignId)

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading recipients...</div>
  }

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

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit 2>&1 | grep campaign | head
```

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/campaigns/\[id\]/page.tsx components/campaigns/campaign-detail.tsx components/campaigns/recipient-table.tsx
git commit -m "feat(campaigns): detail page with counters and recipient table"
```

---

## Task 11: WebSocket stats subscription

**Files:**
- Create: `components/campaigns/use-campaign-stats-subscription.ts`

Uses the existing `useWebSocket()` hook at `hooks/use-websocket.ts:195` — verified API: `{ subscribe, sendEvent, isConnected }`. The `subscribe(eventType, handler)` returns an unsubscribe function.

- [ ] **Step 1: Write the hook**

```ts
"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useWebSocket } from "@/hooks/use-websocket"
import { campaignKeys } from "@/hooks/queries/use-campaigns"

/**
 * Subscribe to the "campaign_stats_update" WebSocket event and invalidate the
 * campaign detail + recipients queries when stats for this campaign change.
 *
 * The backend publishes campaign_stats_update events via
 * queue.Publisher.PublishCampaignStats — see fs-whatsapp/internal/worker/worker.go
 * checkCampaignCompletion and publishCampaignStats for the emitter side.
 */
export function useCampaignStatsSubscription(campaignId: string) {
  const { subscribe } = useWebSocket()
  const qc = useQueryClient()

  useEffect(() => {
    if (!campaignId) return
    const unsubscribe = subscribe("campaign_stats_update", (payload: any) => {
      if (payload?.campaign_id === campaignId) {
        qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) })
        qc.invalidateQueries({ queryKey: campaignKeys.recipients(campaignId) })
      }
    })
    return unsubscribe
  }, [campaignId, subscribe, qc])
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit 2>&1 | grep stats-subscription | head
```

Expected: no errors.

- [ ] **Step 3: Verify in browser (with backend running)**

Start a test campaign from the create form. Open the detail page. Watch counters increment as the worker processes recipients. If nothing updates, check browser DevTools Network tab for the WebSocket connection and look for `campaign_stats_update` frames.

- [ ] **Step 4: Commit**

```bash
git add components/campaigns/use-campaign-stats-subscription.ts
git commit -m "feat(campaigns): WebSocket subscription for live stats updates"
```

---

## Task 12: End-to-end verification + lint

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "campaign" | head -30
```

Expected: zero errors involving campaign files.

- [ ] **Step 2: Run existing tests (don't break anything)**

```bash
npx vitest run 2>&1 | tail -20
```

Expected: existing test suites pass. New component tests are NOT required for v1 (defer to v1.1).

- [ ] **Step 3: Lint**

```bash
npx next lint 2>&1 | tail -30
```

Fix any errors in new files. Warnings in pre-existing files can be ignored.

- [ ] **Step 4: Full smoke test**

With backend running (from the backend plan's Task 12 smoke test):

1. Open `http://localhost:3002/campaigns` → "No campaigns yet" empty state
2. Click "New Campaign"
3. Name: "Frontend Smoke Test"
4. Account: pick one from the searchable picker
5. Type: Flow
6. Flow: pick a flow from the searchable picker
7. Audience ID: paste a test SC audience ID, click Fetch → preview card appears with count + columns
8. Variable mapping rows render based on the flow's variables; map each to an SC column
9. Click "Start Campaign"
10. Redirect to `/campaigns/{id}` → live detail page
11. Watch counters update as the worker dispatches

- [ ] **Step 5: Commit any final fixes**

```bash
git add -u
git commit -m "chore: lint and type fixes for broadcasting frontend"
```

- [ ] **Step 6: Push**

```bash
git push -u origin plan/broadcasting-flow-extensibility
```

---

## Summary

12 tasks land the magic-flow frontend side:

0. Narrow `/api/campaigns` LOCAL_PREFIXES to `/api/campaigns/create`
1. Types + React Query hooks
2. Flow variables hook
3. `SearchablePicker` primitive (Popover+Command)
4. `CampaignStatusBadge`
5. `InfoBanner24hr`
6. `VariableMappingForm`
7. `AudiencePickerSamplingCentral`
8. Campaigns list page + sidebar nav
9. Campaign create form
10. Campaign detail page + recipient table
11. WebSocket stats subscription
12. Lint + e2e verification

## Deferred for v1.1

- Contacts audience tab (backend + frontend)
- CSV audience tab (backend staging + frontend upload UI + column mapping)
- Component unit tests (vitest)
- Pause/resume confirmation dialogs (AlertDialog per CLAUDE.md UI rules)
- Campaign template variable validation warning ("mapping doesn't cover `customer_name`")
- SC audience ID dropdown (would require new SC list endpoint)
