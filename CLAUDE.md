# MagicFlow

React flow builder for Freestand. Users design chatbot flows that get published to fs-whatsapp.

## Commands

```bash
# Local (dev tooling)
npx tsc --noEmit              # TypeScript check
npm run test                  # Run tests (vitest)

# Docker (running app — source mounted, hot-reloads)
docker compose up             # Start app (port 3002)
docker logs magic-flow-app-1  # Check logs
```

## Builder (Core)

The flow editor at `app/flow/[id]/page.tsx` is the command center:
- Canvas: ReactFlow with drag-drop nodes and edge connections
- Sidebar: `components/node-sidebar.tsx` — node palette organized by category
- Properties Panel: `components/properties-panel.tsx` — node config on right side
- Node components: `components/nodes/` — inline-editable cards (by platform + category)
- Publish: `components/publish-modal.tsx` — converts and deploys to fs-whatsapp
- WhatsApp Flow Builder: `components/whatsapp-flow-builder-modal.tsx` — Meta form builder

## Node Development — Files That May Need Changes

When adding or modifying a node, consider each of these. Not all apply to every node.

### fs-whatsapp (runtime — build first if new step type)
- `internal/models/constants.go` — step type constant
- `internal/handlers/chatbot_processor.go` — step handler logic
- `pkg/whatsapp/message.go` — if new WhatsApp API message format
- `frontend/src/views/chatbot/ChatbotFlowBuilderView.vue` — Vue builder step UI
- `docs/src/content/docs/` — API reference + feature docs

### magic-flow (builder)
- `components/nodes/{category}/{name}-node.tsx` — node component (inline editing, handles)
- `constants/node-types-registry.ts` — register component in nodeTypes map
- `constants/node-categories.ts` — NODE_TEMPLATES with `ai` field (auto-wires AI prompts)
- `utils/node-factory.ts` — createNode with default data
- `utils/whatsapp-converter.ts` — forward + reverse + inferNodeType
- `utils/flow-variables.ts` — if node produces/consumes variables
- `components/properties-panel.tsx` — if node needs property editing beyond inline
- `lib/ai/core/node-documentation.ts` — buildDataStructure case for AI
- `lib/ai/tools/generate-flow.ts` — if AI prompt needs adjustment
- `lib/ai/tools/suggest-nodes.ts` — if suggestion filtering needed
- `components/condition-rule-dialog.tsx` — if node adds new condition operators
- `components/publish-modal.tsx` — if node needs publish validation
- `utils/node-data-injection.ts` — if node needs page-level callbacks

### Teach AI
AI prompts auto-generate from NODE_TEMPLATES — ensure the `ai` field is complete (description, whenToUse, selectionRule, contentFields, bestPractices). Add data structure case in `node-documentation.ts` → `buildDataStructure()`.

## UI Rules

- Use shadcn components (Select, Popover+Command, AlertDialog). Never raw HTML selects or inputs.
- Use hover:bg-muted for list item hover. Never hover:bg-accent.
- Use AlertDialog for confirmations. Never window.confirm or window.alert.
- Always add cursor-pointer on clickable/interactive elements.
- Use react-hook-form + zod + shadcn Form kit for form state management.
- Use searchable combobox (Popover+Command) for any dropdown with 5+ items.
- Use `<PageHeader title="..." />` from `components/page-header.tsx` for all dashboard page headers.

## Design System

All colors come from CSS custom properties in `globals.css`. Never use hardcoded hex colors in components.

**Color tokens:**
- `--primary` (`#0a3578`): Buttons, links, CTAs, focus rings → `bg-primary`, `text-primary`
- `--destructive`: Errors, delete actions → `bg-destructive`, `text-destructive`
- `--warning` (`#f59e0b`): Validation warnings → `text-warning`, `bg-warning`
- `--success` (`#10b981`): Success states → `text-success`, `bg-success`
- `--info` (`#3b82f6`): Info states → `text-info`, `bg-info`
- `--muted` (`#e2e8f0`): Subtle backgrounds, table headers → `bg-muted`
- `--edge-color` (`#6366f1`): ReactFlow edge/connection strokes (indigo)

**Sidebar:** Dark navy `#0D2A69` with `--sidebar-*` tokens. Logo uses `LogoFull` SVG from `freestand-logo.tsx`.

**Platform theming:**
- `--platform-accent` changes per platform via `[data-platform]` on `<body>` (WhatsApp `#25d366`, Instagram `#E1306C`)
- Only canvas elements (node handles) use `bg-platform-accent`
- `--primary` and `--ring` do NOT change per platform
- App shell (buttons, focus rings, sidebar) always uses `--primary`

**Edge styles:** Use `DEFAULT_EDGE_STYLE` from `constants/edge-styles.ts` for all ReactFlow edges. Never hardcode edge colors.

**Intentional exceptions (OK to hardcode):**
- External brand badges (WhatsApp green pill, Instagram pink pill on dashboard)
- WhatsApp UI simulation in `template-preview.tsx`
- Node identity colors: transfer (`#7c2d12`), API fetch (`#1a365d`), template message (`#075e54`)

**Never:**
- Use `bg-[#hex]` or `text-[#hex]` for any color that exists as a token
- Define color maps in TypeScript — CSS is the source of truth
- Use `border-accent` for selected/active states (accent is gray for hover only) — use `border-primary` instead

## Learnings

- Check shadcn base component source for hardcoded Tailwind classes before overriding — breakpoint prefixes and token names can silently win specificity.
- Verify CSS variable meanings in globals.css before using token classes — `--input` is used as input border color (via `border-input`), not background.
- Light mode needs intentional depth layering between nested surfaces. Dark mode hides flat design — always verify both themes.
- Every modal dismiss path must behave identically. Test Cancel, X, outside click, and Escape separately.
- If two modals share UI, extract the shared component immediately — don't ship duplicated code planning to refactor later.
- Prefer single validation on save over real-time checks. Simpler, always fresh, no debounce/cache complexity.
- When UI sections are conditionally visible, save must actively clear hidden state — don't persist what the user can't see.
- Next.js server-side `fetch()` caches GET responses by default. API proxy routes must use `cache: "no-store"` or they return stale data silently. Wasted an hour debugging why a new field wasn't showing up.

## Data Fetching — React Query (mandatory)

All server data fetching MUST use TanStack React Query hooks. Never use raw `apiClient.get/post` with `useState + useEffect`.

**Query hooks** (in `hooks/queries/`):
- Flows: `useFlows()`, `useFlow(id)`, `useCreateFlow()`, `useUpdateFlow(id)`, `useDeleteFlow()`, `useDuplicateFlow()`
- Versions: `useVersions(projectId)`, `useCreateVersion()`, `usePublishVersion()`, `useSaveDraft()`, `useDeleteDraft()`
- Auto-save: `useAutoSave(projectId, nodes, edges, platform, enabled, isEditMode)`
- Accounts: `useAccounts()`
- Chatbot: `useChatbotFlows()`, `useGlobalVariables()`
- Templates: `useTemplates(status?)`, `useSyncTemplates()`, `useDeleteTemplate()`, `usePublishTemplate()`, `useSaveTemplate()`, `useDuplicateTemplate()`
- WhatsApp Flows: `useWhatsAppFlows()`, `useCreateWhatsAppFlow()`, `useUpdateWhatsAppFlow()`, `useSaveWhatsAppFlowToMeta()`, `usePublishWhatsAppFlow()`

**Rules:**
- GET data → `useQuery` hook. Never `useState + useEffect + fetch`.
- Write data → `useMutation` hook. Show `isPending` spinner on action buttons.
- Query keys in `hooks/queries/query-keys.ts`. Follow the factory pattern.
- Cache invalidation: mutations invalidate related queries via `queryClient.invalidateQueries`.
- Optimistic updates for deletes (remove from cache immediately, rollback on error).
- `apiClient` is only used directly inside `queryFn`/`mutationFn` implementations and one-off calls (publish, test account). Components never import `apiClient` for data fetching.

**API routing:**
- `apiClient` routes requests directly to fs-whatsapp (`NEXT_PUBLIC_FS_WHATSAPP_URL`) for all data endpoints.
- Auth, AI, test-api, campaigns, debug routes stay on Next.js server (have server-side secrets).
- `lib/whatsapp-api.ts` has client-side helpers for chatbot endpoints that need response shaping.

## Key Patterns

- Inline editing on nodes: click to edit, useState for edit mode, VariablePickerTextarea for text, StoreAsPill for variable names.
- Platform-colored handles: emerald (WhatsApp), purple (Instagram), blue (web).
- Node data injection: page-level callbacks injected via `utils/node-data-injection.ts`.
- Converter: `utils/whatsapp-converter.ts` transforms ReactFlow nodes/edges to fs-whatsapp flat flow JSON.
