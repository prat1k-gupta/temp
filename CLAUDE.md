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
- Platform theme: --primary and --ring change per platform via data-platform attribute on body.
- Use searchable combobox (Popover+Command) for any dropdown with 5+ items.

## Learnings

- Check shadcn base component source for hardcoded Tailwind classes before overriding — breakpoint prefixes and token names can silently win specificity.
- Verify CSS variable meanings in globals.css before using token classes — names can be misleading (e.g. `--input` is background, not border).
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
- Auto-save: `useAutoSave(projectId, nodes, edges, platform, enabled)`
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
