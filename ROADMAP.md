# MagicFlow — Product Roadmap

## Vision

MagicFlow is the unified workflow builder for Freestand. It replaces FS Chat's Vue frontend for flow building and eventually becomes the single platform for all customer interaction — WhatsApp, Instagram, Web, and future channels.

**FS Chat** (Go backend) remains the runtime engine. MagicFlow is the builder.

---

## Architecture

```
MagicFlow (React)
├── Auth → FS Chat backend (JWT)
├── Data → FS Chat PostgreSQL (projects, versions, drafts)
├── WhatsApp/Instagram → publish to FS Chat (chatbot_flows)
├── Web → publish to trysample (Form) — standalone renderer
└── Future (Line, etc.) → publish to FS Chat
```

**Three systems, one builder:**

| System | Role | Database |
|--------|------|----------|
| **MagicFlow** | Flow builder UI | FS Chat's PostgreSQL |
| **FS Chat** | Runtime engine (WhatsApp, Instagram, chatbot processor) | Own PostgreSQL |
| **trysample** | Web form renderer (to be decoupled from Sampling Central) | Freestand PostgreSQL |

---

## Current State — What's Done

- Flow builder with ReactFlow (drag & drop, 25+ node types)
- Flow templates (Name, Email, DOB, Address) with flattener
- Variables: session, global, cross-flow with Lexical inline pills
- Variable picker with `{{` trigger, search, create
- Named template parameters (`{{customer_name}}` instead of `{{1}}`)
- Template builder with pill editor, inline sample values
- WhatsApp converter (magic-flow → fs-chat flat flow format)
- Publish pipeline with slug management
- Publish validation (blocks unknown variables, amber node highlights)
- Synchronous next-step (follow-up before waiting for input)
- Condition node with conditional routing
- API fetch node with response mapping
- Template message node with parameter mappings
- AI flow generation (Haiku for create, Sonnet for edit)
- AI template generation with named variables

**FS Chat runtime:**
- E.164 phone number normalization
- Named template param sending (header, body, URL button suffix)
- Contact variables persisted across flows
- Global/cross-flow variable injection
- Failed template error visibility in chat

---

## Phase 1 — Launch Blockers (Week 1-2)

Features first. These work on localStorage and don't depend on database/auth. The goal is: **run a full Freestand marketing campaign end-to-end.**

Three features block launch. Without them, existing BotPenguin flows can't be migrated.

### 1.1 API Node Success/Failure Handles ⚡ Day 1-2

The eligibility check flow (API call to Sampling Central → branch on result) breaks silently if the API fails. Currently, a failed API call proceeds with empty variables → wrong routing → approving ineligible consumers.

**MagicFlow:**
- Add success/failure output handles to apiFetch node (follow condition node pattern)
- Converter: emit `conditional_next` based on API response status

**FS Chat:**
- `fetchApiResponse` already returns errors cleanly
- Store `sessionData["_api_status"] = "success"` or `"error"` after fetch
- Branch to success/failure next step based on status (~20 lines)

### 1.2 Tagging Node ⚡ Day 2-3

Every Freestand flow tags contacts for future targeting (`sampled_product_x`, `region_north`). Without tagging: no audience segmentation, no re-sampling suppression, no follow-up targeting.

**MagicFlow:**
- New node type: "Set Tag" / "Remove Tag"
- Properties panel: tag name input, action (add/remove)
- Converter: maps to tag action in flat flow
- Register in node-types-registry, node-categories, node-factory

**FS Chat:**
- Contact model already has `Tags JSONBArray` field
- New step type handler in chatbot_processor
- Inject `contact.Tags` into `sessionData["_tags"]` at session start
- Condition evaluator: support "has tag" / "doesn't have tag" checks

### 1.3 WhatsApp Flows Node ⚡ Day 3-5

Freestand uses Meta's WhatsApp Flows (interactive forms) in existing campaigns. Can't migrate those flows without this node.

**MagicFlow:**
- New node type with flow selector (calls FS Chat's `GET /api/flows` to list registered WhatsApp Flows)
- Properties panel: flow ID, header text, CTA button text
- Converter: emit `message_type: "whatsapp_flow"` with `input_config`

**FS Chat (runtime already done):**
- `FlowStepTypeWhatsAppFlow` constant exists
- `sendAndSaveFlowMessage()` sends WhatsApp Flow messages
- `nfm_reply` response parsing works
- **Gap:** form responses only stored in session data, not persisted to `contact_variables`

---

### 1.4 Typing Indicator + API Timeout Config (quick win)

- **Typing indicator** — send `typing_on` status before every bot reply and before API calls. WhatsApp Cloud API now supports this. Auto-dismisses after 25s or when bot responds.
- **API timeout dropdown** — configurable per API node (5s/10s/15s/30s), server-side hard cap at 30s. Dropdown in both MagicFlow and FS Chat properties panel.
- **Mark as read** — send blue ticks immediately on message receipt (already have `MarkMessageRead`)

### 1.5 Variable Uniqueness Check (quick win, anytime)

- Warn/prevent duplicate `storeAs` names across the flow
- Visual indicator on nodes with conflicting variable names
- Small effort — validation check, not a feature

---

## Phase 1.5 — Post-Launch Improvements

### Variables Phase 5

Quick wins to improve flow builder productivity.

- **Global variables editor** — settings page in MagicFlow calling `GET/PUT /api/whatsapp/settings`
- **Inline global variable creation** — "Create global variable" action in picker's Global tab
- **AI awareness** — update flow assistant & node suggestor prompts for `{{global.x}}` and `{{flow.slug.var}}` syntax
- **External variable loading** — proper cache invalidation, loading state in picker

---

## Phase 2 — Database + Auth + React Query

Separate clean effort. Features work on localStorage until this is done.

### 2.1 React Query Migration

Introduce TanStack Query to replace synchronous localStorage patterns with async data fetching. This is the prerequisite for the database swap — once consumers use React Query, the backend can change from localStorage to API without touching any component.

**Step 1:** Add React Query provider, wrap app
**Step 2:** Replace `getAllFlows()` / `getFlow()` calls with `useQuery`
**Step 3:** Replace `saveFlow()` / `updateFlow()` / `deleteFlow()` with `useMutation`
**Step 4:** `flow-storage.ts` functions become `queryFn` implementations — still hitting localStorage for now

### 2.2 Go Backend Tables

New models in FS Chat's PostgreSQL:

```
magic_flow_projects          — flow identity (name, slug, platform, publish target)
magic_flow_versions          — canvas snapshots (nodes, edges, changes)
magic_flow_drafts            — auto-saved current work (one per project)
```

CRUD endpoints for all three. Auto-save endpoint (debounced from frontend).

### 2.3 Storage Swap

Change `flow-storage.ts` queryFn implementations from localStorage to `fetch('/api/...')`. Zero consumer changes needed — React Query handles the async.

Version/draft storage can stay in localStorage (session-scoped, not user-scoped).

### 2.4 Auth

- Login page → `POST /api/auth/login` on FS Chat
- JWT storage, auth interceptor on all API calls
- Protected routes middleware
- Update proxy routes from single API key to per-user JWT forwarding

### 2.5 Test API via Go Backend (Single Source of Truth)

Route test API calls through Go's `fetchApiResponse` instead of Next.js proxy. Ensures test uses the exact same variable replacement, timeout, and header handling as production. Blocked on Phase 2 (backend always available). See [#9](https://github.com/freestandtech/magic-flow/issues/9).

### 2.6 Embedded Signup (Connect WhatsApp)

- FS Chat backend fully implemented (`/api/embedded-signup/*`)
- MagicFlow needs: Facebook SDK loading, `FB.login()` flow, postMessage listener for `WA_EMBEDDED_SIGNUP` events, completion call
- New proxy routes for embedded-signup endpoints
- ~150 lines of React (Vue reference: `useFacebookSDK.ts`)

---

## Phase 3 — Delay Blocks + Advanced Features

### 3.1 Delay Blocks

Time-based wait between flow steps. **Requires new infrastructure** — FS Chat has zero scheduling capability today.

**Options:**
- **v1 (simple):** In-process `time.Sleep` for short delays (seconds). Quick to ship but blocks the goroutine.
- **v2 (proper):** Redis sorted sets with execution timestamp, polled by a background goroutine. Handles minutes/hours. Needs session resumption logic.

**Design considerations:**
- What if user responds during a delay?
- Session timeout overlapping with delay
- Multiple delays in sequence

### 3.2 Variable Uniqueness Check

- Warn/prevent duplicate `storeAs` names across the flow
- Visual indicator on nodes with conflicting variable names

### 3.3 Subflows (Call by Reference)

- Changes propagate to all flows using the subflow
- Templates (current) = call by value, Subflows = call by reference
- Multiple named exits

---

## Phase 4 — FS Chat Frontend Transfer

Transfer FS Chat's Vue frontend features to MagicFlow in React. Same APIs, same data — substantial UI rebuild.

**Scope reality check:** FS Chat's ChatView.vue alone is 2,025 lines with ~137 functions. Full transfer (chat + contacts + campaigns + settings) is ~15,000+ lines of Vue. This is a multi-week effort per subsection.

### 4.1 Chat Interface
### 4.2 Contact Management
### 4.3 Campaigns / Broadcasting
### 4.4 Settings (accounts, chatbot, teams, keywords, AI contexts)

---

## Phase 5 — Full Convergence

### 5.1 Form Renderer Decoupling
- Decouple trysample from Sampling Central campaigns
- Standalone form renderer — MagicFlow web flows publish directly
- Requires new submission pipeline (current one assumes campaign context)

### 5.2 Multi-Channel
- Line support (Abhishek adds to FS Chat first, then MagicFlow node)

### 5.3 Account References Migration
- String → UUID foreign keys across all tables

### 5.4 Analytics Dashboard

### 5.5 Flow Execution Logs (Yellow.ai-style)

Per-step execution trace for debugging flow runs. Currently API errors are saved as failed messages in chat — this would be a dedicated logs system.

- New `flow_execution_logs` table — one row per step per session
- Fields: session_id, step_name, step_type, status (success/error), request (URL, method, headers, body), response (status code, body snippet), variables_before, variables_after, error_message, duration_ms, created_at
- API: `GET /api/chatbot/logs?flow_id=&contact_id=&status=error&limit=50`
- Filter by: flow, contact, date range, step type, error status
- UI in FS Chat: Logs page under Chatbot section
- UI in MagicFlow: flow-level log viewer (see recent executions, drill into step details)

### 5.6 Error Logging / Debug Tools

---

## Technical Debt

| Item | Priority |
|------|----------|
| Account references: string → UUID FK | Medium |
| Docs inaccuracies (field names in API reference) | Low |
| `interface{}` → `any` in Go handlers | Low |
| Drop Next.js, move to Vite (once API proxies removed) | Later |

---

## Current Workstreams

| Person | Focus |
|--------|-------|
| **Pratik** | MagicFlow development, FS Chat WhatsApp capabilities |
| **Abhishek** | Flow sending reliability, Meta app approvals, Line support in FS Chat |

---

## Timeline Target

**End of first week of April:**
- Phase 1 complete (tagging, API handles, variables, WhatsApp Flows)
- Flows publishable to FS Chat and triggerable via API from Sampling Central

**Phase 2 follows immediately after** — database + auth + React Query to make MagicFlow multi-user for Freestand customers.
