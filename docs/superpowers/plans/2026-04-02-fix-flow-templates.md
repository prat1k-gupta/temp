# Fix Flow Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 template bugs — persistence (templates don't save nodes/edges), type filtering (templates appear in flows list), template editor save button, and loading state.

**Architecture:** Templates are regular `magic_flow_projects` with `type="template"`. They should use the same draft system as flows (`useAutoSave` → `useSaveDraft` → `/projects/{id}/draft`). The backend draft endpoint already works for any project type — no backend changes needed.

**Tech Stack:** React, TanStack React Query, existing hooks (`useAutoSave`, `useFlow`, `useUpdateFlow`)

---

### Task 1: Fix `getAllFlows()` to exclude templates

The API path doesn't filter by type — templates show up in the flows list.

**Files:**
- Modify: `utils/flow-storage.ts:322`

- [ ] **Step 1: Add type filter to API call**

In `utils/flow-storage.ts`, change the `getAllFlows()` function:

```typescript
// Before (line 322):
const data = await apiClient.get<any>("/api/magic-flow/projects")

// After:
const data = await apiClient.get<any>("/api/magic-flow/projects?type=flow")
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add utils/flow-storage.ts
git commit -m "fix: exclude templates from flows list by passing ?type=flow"
```

---

### Task 2: Migrate template editor to use React Query + draft system

Templates currently use `useTemplatePersistence` which calls `updateTemplate()` → `PUT /projects/{id}` (metadata-only endpoint that ignores nodes/edges). Replace with `useFlow()` for loading and `useAutoSave()` for saving — same as the flow editor.

**Files:**
- Modify: `app/template/[id]/page.tsx` — swap `useTemplatePersistence` for `useFlow` + `useAutoSave` + `useUpdateFlow`
- Modify: `components/flow/template-header.tsx` — add save indicator + save button
- Delete: `hooks/use-template-persistence.ts` — no longer needed

- [ ] **Step 1: Rewrite template page persistence**

In `app/template/[id]/page.tsx`, replace the `useTemplatePersistence` hook with the same pattern the flow page uses:

```typescript
// Remove this import:
import { useTemplatePersistence } from "@/hooks/use-template-persistence"

// Add these imports:
import { useFlow, useUpdateFlow, useAutoSave } from "@/hooks/queries"
import { Loader2, Sparkles } from "lucide-react"
```

Replace the persistence hook instantiation (lines 64-72) with:

```typescript
// Load template via React Query (same as flow page)
const flowQuery = useFlow(templateId)
const updateFlowMutation = useUpdateFlow(templateId)

// Template state
const [currentFlow, setCurrentFlow] = useState<FlowData | null>(null)
const [flowLoaded, setFlowLoaded] = useState(false)
const [isEditingFlowName, setIsEditingFlowName] = useState(false)
const [editingFlowNameValue, setEditingFlowNameValue] = useState("")

// Load template data when query resolves
useEffect(() => {
  if (flowQuery.data && !flowLoaded) {
    const templateData = flowQuery.data
    setCurrentFlow(templateData)
    setNodes(templateData.nodes)
    setEdges(templateData.edges)
    setPlatform(templateData.platform)
    setFlowLoaded(true)
    setEditingFlowNameValue(templateData.name)
  }
}, [flowQuery.data, flowLoaded])

// Auto-save via draft system (same as flows)
const autoSaveEnabled = !!templateId && !!currentFlow && flowLoaded && nodes.length > 0
const { isSaving } = useAutoSave(templateId, nodes, edges, platform, autoSaveEnabled, true)

// Metadata save helpers
const handleBackClick = useCallback(() => {
  router.push("/flow-templates")
}, [router])

const handleFlowNameBlur = useCallback(async () => {
  if (editingFlowNameValue.trim() && currentFlow && editingFlowNameValue !== currentFlow.name) {
    try {
      const updated = await updateFlowMutation.mutateAsync({ name: editingFlowNameValue.trim() })
      if (updated) {
        setCurrentFlow(updated)
        toast.success("Template name updated")
      }
    } catch {
      toast.error("Failed to update template name")
      if (currentFlow) setEditingFlowNameValue(currentFlow.name)
    }
  }
  setIsEditingFlowName(false)
}, [editingFlowNameValue, currentFlow, updateFlowMutation])

const saveFlowFields = useCallback(async (updates: Record<string, any>) => {
  if (!templateId) return
  try {
    await updateFlowMutation.mutateAsync(updates)
  } catch (error) {
    console.error("[Template] Error saving fields:", error)
  }
}, [templateId, updateFlowMutation])

const saveDescription = useCallback(async (description: string) => {
  if (!templateId) return
  try {
    const updated = await updateFlowMutation.mutateAsync({ description })
    if (updated) setCurrentFlow(updated)
  } catch {}
}, [templateId, updateFlowMutation])

const saveAIMetadata = useCallback(async (aiMetadata: TemplateAIMetadata) => {
  if (!templateId) return
  try {
    const updated = await updateFlowMutation.mutateAsync({ aiMetadata })
    if (updated) setCurrentFlow(updated)
  } catch {}
}, [templateId, updateFlowMutation])
```

Add necessary imports at the top:

```typescript
import type { FlowData } from "@/utils/flow-storage"
import type { TemplateAIMetadata } from "@/types"
import { useRouter } from "next/navigation"
```

Update all references from `persistence.xxx` to the new local variables (e.g., `persistence.currentFlow` → `currentFlow`, `persistence.handleBackClick` → `handleBackClick`, etc.).

Add loading state before the main content (after `FlowSetupModal` pattern from flow page):

```typescript
{flowQuery.isLoading && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-primary animate-pulse" />
      </div>
      <h2 className="text-xl font-semibold text-primary">Loading template...</h2>
    </div>
  </div>
)}
```

- [ ] **Step 2: Add isSaving prop to TemplateHeader**

In `components/flow/template-header.tsx`, add auto-save indicator and a manual Save button.

Add to props interface:

```typescript
isSaving?: boolean
onSave?: () => void
```

Add the `SaveStatus` component (same as flow header) and a Save button in the right section.

Import `CloudUpload`, `Check` from lucide-react.

- [ ] **Step 3: Wire isSaving to TemplateHeader in template page**

```typescript
<TemplateHeader
  ...existing props...
  isSaving={isSaving}
/>
```

- [ ] **Step 4: Delete old template persistence hook**

```bash
rm hooks/use-template-persistence.ts
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Test in browser**

1. Open a template, add nodes → auto-save indicator should appear
2. Navigate away to /flow-templates → come back → nodes should persist
3. Edit template name → should save via React Query
4. Settings (description, AI metadata) → should save

- [ ] **Step 7: Commit**

```bash
git add app/template/[id]/page.tsx components/flow/template-header.tsx
git rm hooks/use-template-persistence.ts
git commit -m "fix: migrate template persistence to React Query + draft system"
```

---

### Task 3: Add loading state to flow-templates list page

The templates list page uses raw `useState`+`useEffect` instead of React Query. Migrate to React Query and add loading indicator.

**Files:**
- Modify: `app/(dashboard)/flow-templates/page.tsx`
- Modify: `hooks/queries/use-flows.ts` — add `useTemplateFlows()` hook
- Modify: `hooks/queries/index.ts` — export new hook

- [ ] **Step 1: Add useTemplateFlows hook**

In `hooks/queries/use-flows.ts`, add:

```typescript
import { getAllFlows, getFlow, getAllTemplates, type FlowMetadata, type FlowData } from "@/utils/flow-storage"

/**
 * Fetch all flow templates (list view).
 */
export function useTemplateFlows() {
  return useQuery<FlowMetadata[]>({
    queryKey: flowKeys.templates(),
    queryFn: getAllTemplates,
  })
}
```

In `hooks/queries/query-keys.ts`, add `templates` key to `flowKeys`:

```typescript
templates: () => [...flowKeys.all, "templates"] as const,
```

Export from `hooks/queries/index.ts`:

```typescript
export { useFlows, useFlow, useTemplateFlows } from "./use-flows"
```

- [ ] **Step 2: Migrate flow-templates page to React Query**

In `app/(dashboard)/flow-templates/page.tsx`, replace:

```typescript
// Remove:
import { getAllTemplates, deleteTemplate, ... } from "@/utils/flow-storage"

// Add:
import { useTemplateFlows } from "@/hooks/queries"
import { deleteTemplate, duplicateTemplate, createTemplate, type FlowMetadata } from "@/utils/flow-storage"
import { Loader2 } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { flowKeys } from "@/hooks/queries/query-keys"
```

Replace state + useEffect:

```typescript
// Remove:
const [templates, setTemplates] = useState<FlowMetadata[]>([])
useEffect(() => { loadTemplates() }, [])
const loadTemplates = async () => { ... }

// Add:
const { data: templates = [], isLoading } = useTemplateFlows()
const queryClient = useQueryClient()
const reloadTemplates = () => queryClient.invalidateQueries({ queryKey: flowKeys.templates() })
```

Replace all `loadTemplates()` calls with `reloadTemplates()`.

Add loading UI before the grid:

```typescript
{isLoading && (
  <div className="flex items-center justify-center min-h-[40vh]">
    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
  </div>
)}
```

Wrap the existing template sections with `{!isLoading && (...)}`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add hooks/queries/use-flows.ts hooks/queries/query-keys.ts hooks/queries/index.ts app/\(dashboard\)/flow-templates/page.tsx
git commit -m "feat: migrate flow-templates page to React Query with loading state"
```

---

### Task 4: Fix flow-setup modal state reset

The create flow modal may not reset state when reopened after cancel, potentially causing type bleed.

**Files:**
- Modify: `components/flow-setup-modal.tsx`

- [ ] **Step 1: Add reset on open**

In `flow-setup-modal.tsx`, add a `useEffect` to reset state when modal opens:

```typescript
// Reset all state when modal opens
useEffect(() => {
  if (open) {
    setFlowName("")
    setFlowDescription("")
    setSelectedPlatform("whatsapp")
    setSearchQuery("")
    setConflictWarnings({})
    setRefConflict(null)
    setTriggerConfig({
      selectedTriggers: [],
      triggerKeywords: [],
      triggerMatchType: "contains_whole_word",
      triggerRef: "",
    })
    setSelectedWaAccountId("")
  }
}, [open])
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/flow-setup-modal.tsx
git commit -m "fix: reset flow-setup modal state on open to prevent type bleed"
```

---

### Task 5: Clean up dead template storage functions

After migrating templates to the draft system, several functions in `flow-storage.ts` are no longer needed for canvas persistence (templates now save via drafts, load via `useFlow`).

**Files:**
- Modify: `utils/flow-storage.ts` — remove `getTemplate`, `updateTemplate` (keep `createTemplate`, `getAllTemplates`, `deleteTemplate`, `duplicateTemplate`, `updateTemplateMetadata`)

- [ ] **Step 1: Check for remaining usages**

Grep for `getTemplate` and `updateTemplate` across the codebase. Remove only functions that are no longer called.

Note: `updateTemplateMetadata` is still used by the template editor modal for saving AI metadata on nested templates — keep it.

- [ ] **Step 2: Remove dead functions if confirmed unused**

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add utils/flow-storage.ts
git commit -m "chore: remove dead template storage functions (now using draft system)"
```
