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
- Action node (set variables + manage tags in one step)
- API node success/failure handles with dual routing
- WhatsApp Flows node with form builder and lifecycle management
- Cross-flow clipboard
- Shadcn component migration (replaced raw HTML selects/inputs)

**FS Chat runtime:**
- E.164 phone number normalization
- Named template param sending (header, body, URL button suffix)
- Contact variables persisted across flows
- Global/cross-flow variable injection
- Failed template error visibility in chat
- API node success/failure routing with error logging and system variables
- Action node (set variables + manage tags)
- WhatsApp Flows lifecycle, new components, response field persistence
- Typing indicator + read receipts on incoming messages
- Webhook outbox processor with advisory locks and retry logic

---

## Phase 1 — Launch Blockers

Features first. These work on localStorage and don't depend on database/auth. The goal is: **run a full Freestand marketing campaign end-to-end.**

Three features block launch. Without them, existing BotPenguin flows can't be migrated.

### 1.1 API Node Success/Failure Handles ✅

The eligibility check flow (API call to Sampling Central → branch on result) breaks silently if the API fails. Currently, a failed API call proceeds with empty variables → wrong routing → approving ineligible consumers.

**MagicFlow:**
- Add success/failure output handles to apiFetch node (follow condition node pattern)
- Converter: emit `conditional_next` based on API response status

**FS Chat:**
- `fetchApiResponse` already returns errors cleanly
- Store `sessionData["_api_status"] = "success"` or `"error"` after fetch
- Branch to success/failure next step based on status (~20 lines)

> Shipped: magic-flow #10, fs-whatsapp #12

### 1.2 Tagging Node ✅

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

> Shipped as "Action Node" (combined set variables + manage tags): magic-flow #12, fs-whatsapp #13

### 1.3 WhatsApp Flows Node ✅

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

> Shipped: magic-flow (a2844d6), fs-whatsapp #14

---

### 1.4 Typing Indicator + API Timeout Config ✅ (partial)

- ~~**Typing indicator** — send `typing_on` status before every bot reply and before API calls. WhatsApp Cloud API now supports this. Auto-dismisses after 25s or when bot responds.~~
- **API timeout dropdown** — configurable per API node (5s/10s/15s/30s), server-side hard cap at 30s. Dropdown in both MagicFlow and FS Chat properties panel.
- ~~**Mark as read** — send blue ticks immediately on message receipt (already have `MarkMessageRead`)~~

> Typing indicator + read receipts shipped: fs-whatsapp #15. API timeout config not yet implemented.


---

## Phase 1.5 — Post-Launch Improvements

### Template Builder: FLOW Button + Media Headers

The template builder currently supports `quick_reply`, `url`, `phone_number`, `copy_code` buttons but **not** `flow` buttons. Template messages with FLOW buttons unlock:
- **Image/video/document headers** on flow messages (interactive flow messages only support text headers)
- **Sending flows outside the 24hr window** (templates don't require an active conversation)
- **Mixing buttons** — FLOW + URL, FLOW + Quick Reply on the same template

**What's needed:**
- Add `"flow"` to button types in template builder (`template-builder.tsx`)
- FLOW button fields: `flow_id` (searchable flow picker), `navigate_screen`, `flow_action` (navigate/data_exchange)
- Send-time parameters: `sub_type: "flow"`, `flow_token`, `flow_action_data`
- Backend: template creation API already supports FLOW buttons — just need to pass the right component structure

### Variables Phase 5

Quick wins to improve flow builder productivity.

- **Global variables editor** — settings page in MagicFlow calling `GET/PUT /api/whatsapp/settings`
- **Inline global variable creation** — "Create global variable" action in picker's Global tab
- **AI awareness** — update flow assistant & node suggestor prompts for `{{global.x}}` and `{{flow.slug.var}}` syntax
- **External variable loading** — proper cache invalidation, loading state in picker

---

## Phase 2 — Database + Auth + React Query

Multi-user persistent storage. All flow data in PostgreSQL via FS Chat backend.

### 2.1 Auth ✅

- Login/register pages, JWT token management (access + refresh)
- `api-client.ts` with auto-refresh on 401, concurrent refresh dedup
- Next.js middleware for route protection
- All proxy routes forward JWT instead of shared API key

> Shipped: magic-flow #21

### 2.2 Backend Tables ✅

New models in FS Chat's PostgreSQL:

```
magic_flow_projects          — flow identity (name, slug, platform, publish target)
magic_flow_versions          — canvas snapshots (nodes, edges, changes)
magic_flow_drafts            — auto-saved current work (per user per project)
```

11 CRUD endpoints with org-scoping, transactions, pagination.

> Shipped: fs-chat #19

### 2.3 Storage Swap ✅

- `flow-storage.ts` functions switched from localStorage to `apiClient.get/post/put/delete`
- Flows page redesigned with search, table/cards views, sort, platform filter, status badges
- Redis removed, 5 new proxy routes for magic-flow endpoints
- Feature flag `NEXT_PUBLIC_STORAGE_MODE` gates localStorage fallback (default: `api`)

> Shipped: fs-chat #20, magic-flow #22

### 2.4 React Query ✅

- TanStack React Query (`@tanstack/react-query`) for all data fetching
- Query key factory (`flowKeys`, `versionKeys`) for cache management
- Hooks: `useFlows`, `useFlow`, `useCreateFlow`, `useUpdateFlow`, `useDeleteFlow`, `useDuplicateFlow`
- Version hooks: `useVersions`, `useCreateVersion`, `usePublishVersion`, `useSaveDraft`, `useDeleteDraft`
- `useAutoSave` — debounced 1s draft save replacing manual setTimeout
- Optimistic deletes, `isPending` spinner states on action buttons
- Version manager migrated from localStorage to API-backed React Query hooks

> Shipped: magic-flow #23

### 2.5 Remove Proxy ✅

- `apiClient` calls fs-whatsapp directly via `NEXT_PUBLIC_FS_WHATSAPP_URL`
- Deleted 20 proxy route files + `lib/fs-whatsapp-proxy.ts`
- Response envelope unwrapping moved to `apiClient`
- `lib/whatsapp-api.ts` for chatbot endpoint response shaping
- 13 routes remain (auth, AI, test-api, campaigns, debug — server secrets)
- Auto-save architecture rewritten: gated on `isEditMode`, baseline seeding, flush on toggle

> Shipped: magic-flow #24

### 2.6 Remove localStorage ✅

- Edit mode derived from server draft existence — no localStorage
- Change tracker stored in `magic_flow_drafts.changes` JSONB with user attribution (userId, userEmail, userName per change)
- `is_edit_mode` boolean on drafts table
- Flow templates migrated from localStorage to API (`?type=template` filter)
- `ai_metadata` JSONB on projects table for template metadata
- `version-storage.ts` deleted (~350 lines dead code)
- Debounced node update tracking (500ms collapse for keystrokes)
- Changes modal: timeline UI with user avatar initials

> Shipped: fs-chat #21, magic-flow #25

---

## Phase 3 — Next Up

### 3.1 Variable & Tag Registry [#11](https://github.com/freestandtech/magic-flow/issues/11)

Variables and tags become first-class entities with originator tracking, picker-based creation (no free text), and smart impact checking on change. Prevents silent cross-flow breakage and data orphaning.

- `flow_variables` table: `(flow_id, name, source_node, source_type)` — tracks which node created each variable
- `tags` + `contact_tags` tables: org-wide tags with junction table for campaign filtering
- **Originator picker** (storeAs, response mapping, action node, WhatsApp Flow field "Saves as"): shows existing variables + "Create new". No free text.
- **Consumer picker** (message body, API body, conditions): shows existing variables only. No creation.
- **VariableImpactDialog**: when changing a variable at its originator, checks cross-flow references + contact data count. Shows appropriate options (Rename Everywhere / Only This Flow / Cancel). "Rename Everywhere" runs as a single DB transaction — all or nothing.
- Zero runtime changes — `processTemplate`, `saveContactVariable`, converter all unchanged.
- Full design: `docs/variable-tag-registry-plan.md`

### 3.2 Test API via Go Backend [#9](https://github.com/freestandtech/magic-flow/issues/9)

Route test API calls through Go's `fetchApiResponse` instead of Next.js proxy. Ensures test uses the exact same variable replacement, timeout, and header handling as production.

### 3.3 Embedded Signup (Connect WhatsApp)

- FS Chat backend fully implemented (`/api/embedded-signup/*`)
- MagicFlow needs: Facebook SDK loading, `FB.login()` flow, postMessage listener for `WA_EMBEDDED_SIGNUP` events, completion call
- ~150 lines of React (Vue reference: `useFacebookSDK.ts`)

### 3.4 Media Storage (S3/GCS) [#13](https://github.com/freestandtech/magic-flow/issues/13)

Template messages with image/video/document headers need publicly accessible media URLs. Currently users must host media themselves and paste URLs. We need our own storage so users can upload directly.

**Why now (Phase 2):** Requires auth (org-scoped uploads) and database (tracking uploaded files).

**What's needed:**
- S3-compatible storage bucket (AWS S3, GCS, MinIO for self-hosted)
- Upload endpoint: `POST /api/media/upload` → stores file, returns public CDN URL
- File metadata table: `media_files (id, org_id, filename, url, content_type, size, created_at)`
- Upload UI: drag-and-drop or file picker in template builder header section
- Size/format validation: image (5MB, JPEG/PNG), video (16MB, MP4), document (100MB, PDF/DOC)
- Reusable across: template headers, WhatsApp Flow images, campaign media, future channels

**Not needed yet:** Media gallery/browser, image cropping, CDN cache invalidation

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

### 3.2 Dynamic WhatsApp Flows (Endpoint-Powered)

Conditional screen routing in WhatsApp Flows via backend endpoint. Currently only static flows (fixed screen navigation) are supported.

**What it enables:**
- User picks radio option → different screen shows based on selection
- Real-time data from your backend (available slots, inventory, personalized content)
- Full conditional routing logic on your server

**What's needed:**
- RSA key pair management for WABA encryption
- Encrypted data_exchange endpoint (receives AES-GCM encrypted requests from Meta)
- Flow token validation
- Conditional screen routing logic
- `flow_action: "data_exchange"` support in SendFlowMessage

**Depends on:** Phase 1 WhatsApp Flows node (static) being stable

### 3.3 Subflows (Call by Reference)

- Changes propagate to all flows using the subflow
- Templates (current) = call by value, Subflows = call by reference
- Multiple named exits

### 3.5 AI WhatsApp Flow Builder Agent [#14](https://github.com/freestandtech/magic-flow/issues/14)

The flow assistant (Haiku create, Sonnet edit) builds chatbot flows but has no ability to create WhatsApp Flows (native forms). Need a dedicated AI agent for form building, and the flow assistant should use it as a subagent.

**What's needed:**
- **WhatsApp Flow Builder Agent** — takes a description ("registration form with name, email, phone, city dropdown") and generates the `screens[]` JSON for the WhatsApp Flow builder. Knows about all Meta components, constraints, and best practices.
- **Flow assistant integration** — when the flow assistant encounters a WhatsApp Flow node, it delegates form design to the builder agent rather than generating `screens[]` itself
- **Existing flow context** — the flow assistant needs awareness of already-created WhatsApp Flows (names, field names, what they collect) so it can reference them in chatbot flows instead of creating duplicates
- **API**: new tool in `lib/ai/tools/` — `generate-whatsapp-flow.ts`

### 3.6 Media Message Nodes (Image, Video, Document, Audio, Location, Sticker) [#15](https://github.com/freestandtech/magic-flow/issues/15)

WhatsApp supports several message types beyond text and buttons that we don't have nodes for yet. Need to research which ones are available and add support.

**Potential nodes:**
- **Image** — send image with optional caption (URL or media ID)
- **Video** — send video with optional caption
- **Document** — send PDF/DOC with filename
- **Audio** — send voice note or audio file
- **Location** — send GPS coordinates with label
- **Sticker** — send WhatsApp sticker
- **Contacts** — send vCard contact

**What's needed:**
- Research which message types Meta's Cloud API supports and their constraints (size limits, formats, etc.)
- New node types in MagicFlow with appropriate properties (URL, caption, filename, coordinates)
- Converter mapping to fs-whatsapp message types
- fs-whatsapp runtime support for each message type (some may already exist in `pkg/whatsapp/`)
- Media upload depends on Phase 2.8 (S3 storage) for best UX, but URL-based sending works without it

### 3.7 Node-Level Comments with Actionable Notifications [#16](https://github.com/freestandtech/magic-flow/issues/16)

Currently MagicFlow has generic comment nodes that float anywhere on the canvas. Need per-node comments (like Google Sheets per-cell comments) that are attached to specific nodes and support collaboration.

**Use cases:**
- Copy review: "Is this message tone right for our brand?"
- Decision making: "Should this be 3 options or 5? Need PM input"
- Task assignment: "@pratik please finalize the dropdown options"
- Knowledge capture: "Using opt_B because A/B test showed 12% higher CTR"

**What's needed:**
- **Comment model** — `node_comments (id, flow_id, node_id, author, text, resolved, created_at)`
- **UI** — small comment icon on nodes with unresolved comments, click to open comment thread
- **Notifications** — when a user is @mentioned in a comment, notify them (email, in-app, or Slack webhook)
- **Resolution** — comments can be resolved/reopened (like GitHub PR reviews)
- **Comment panel** — flow-level view of all open comments across nodes for triage

**Depends on:** Phase 2 (auth + database) for user identity and persistence

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

| Item | Issue | Priority |
|------|-------|----------|
| Replace primitive HTML with shadcn components ✅ | [#17](https://github.com/freestandtech/magic-flow/issues/17) | Done |
| Version history modal UI redesign | [#26](https://github.com/freestandtech/magic-flow/issues/26) | High |
| API Fetch response mapping key collision | [#27](https://github.com/freestandtech/magic-flow/issues/27) | High |
| AI-generated flows have overlapping nodes | [#7](https://github.com/freestandtech/magic-flow/issues/7) | High |
| Standardize AI flow JSON naming/redirection | [#2](https://github.com/freestandtech/magic-flow/issues/2) | High |
| API Fetch node: compact UI + improved panel | [#8](https://github.com/freestandtech/magic-flow/issues/8) | Medium |
| Account references: string → UUID FK | — | Medium |
| Docs inaccuracies (field names in API reference) | — | Low |
| `interface{}` → `any` in Go handlers | — | Low |
| Drop Next.js, move to Vite (proxies removed ✅) | — | Later |

### Shadcn Component Migration [#17](https://github.com/freestandtech/magic-flow/issues/17)

Replace raw HTML primitives (`<select>`, `<input>`, custom dropdowns) with shadcn equivalents across the codebase. Ensures consistent design, accessibility (keyboard nav, aria), and maintainability.

**`<select>` → shadcn Select (5 instances):**
- `whatsapp-flow-builder-modal.tsx` — input type, footer action, next page, account selector
- `properties-panel.tsx` — tag action (add/remove)

**`<input>` → shadcn Input (4 instances worth fixing):**
- `variable-picker.tsx`, `properties-panel.tsx`, `condition-rule-dialog.tsx`, `screenshot-modal.tsx`

**Custom dropdowns → Popover + Command (2 instances):**
- `properties-panel.tsx` — WhatsAppFlowPicker
- `condition-rule-dialog.tsx` — tag picker

**Exceptions (keep as-is):**
- `<input type="color">` in screenshot-modal (no shadcn equivalent)
- `<input type="file">` in export-modal (hidden, triggered by button)
- `<input>` in store-as-pill (intentionally unstyled inline edit)
- `variable-picker.tsx` popover (complex keyboard nav, multi-tab — migration needs care)

---

## Current Workstreams

| Person | Focus |
|--------|-------|
| **Pratik** | MagicFlow development, FS Chat WhatsApp capabilities |
| **Abhishek** | Flow sending reliability, Meta app approvals, Line support in FS Chat |

---

## Timeline Target

**Phase 1 — ✅ Complete** (as of late March 2026)
- API handles, action node (tags + variables), WhatsApp Flows, typing indicator all shipped
- Trigger match types, ref link triggers, global cancel keywords shipped
- Flows publishable to FS Chat and triggerable via API from Sampling Central

**Phase 2 — ✅ Complete** (March 2026)
- 2.1-2.6 all shipped: Auth, backend tables, storage swap, React Query, proxy removal, localStorage removal
- MagicFlow is now fully multi-user with server-backed persistent storage

**Deferred to Phase 3:**
- API timeout config (1.4 partial)
- FLOW button in template builder (1.5)
- Variables Phase 5 — global editor, inline creation, AI awareness (1.5)
