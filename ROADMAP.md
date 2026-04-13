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

## Phase 2.7 — App Shell + Settings ✅

MagicFlow app shell shipped with sidebar navigation, profile page, 5 settings pages, embedded signup, and design system cleanup.

### App Shell
- Sidebar navigation (collapsible) replacing header-only layout
- Navigation: Flows, Templates, Settings, Profile
- User avatar + org name in sidebar footer

### Profile Page
- View/edit user profile (name, email)
- Reference: `fs-whatsapp/frontend/src/views/profile/ProfileView.vue`

### Settings Pages (priority order)
1. **Accounts** — WhatsApp Business account management (connect, test, configure)
2. **Users** — Invite users, manage roles (admin/manager/agent)
3. **Teams** — Team structure
4. **Chatbot Settings** — Global variables editor, cancel keywords
5. **API Keys** — API key management

All backend endpoints already exist in fs-whatsapp — MagicFlow just needs React pages calling them via apiClient.

---

## Pre-Phase 3 — Flow Template Bugs + Polish ✅

All items shipped (April 2026).

1. ~~Templates appear in Flows tab~~ ✅ — `?type=flow` filter on `getAllFlows()` (PR #37)
2. ~~Normal flows sometimes created as templates~~ ✅ — modal state reset on open (PR #37)
3. ~~Template persistence broken~~ ✅ — migrated to React Query + draft system, same as flows (PR #37)
4. ~~No loading state for templates~~ ✅ — `useTemplateFlows` React Query hook (PR #37)
5. ~~Flow card enhancements~~ ✅ — wa.me links, ref link column, account indicator (PR #38)
6. ~~Test Flow panel~~ ✅ — "Test" button on start node, phone input + template params, End Session & Retry (PR #42)
7. ~~Flattener sync-next leak~~ ✅ — excluded from template open exits, renamed to `sync-next` (PR #37)
8. ~~Start node draggable~~ ✅ — new + existing flows (PR #42)
9. ~~apiClient error messages~~ ✅ — shows backend messages instead of status codes (PR #42)
10. ~~Header consolidation~~ ✅ — static platform badge, theme icon row (PR #40)

**fs-whatsapp:** `PUT /api/chatbot/sessions/{id}` for session status updates (fs-chat#23)

---

## Phase 3 — Features

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

### 3.5–3.7 AI Platform — Multi-Agent Tools + MCP Server ⚡ BUILDING

Upgrading the flow assistant into a multi-agent platform: 4 subagents, 6 direct tools, exposed internally (MagicFlow UI) and externally (MCP server for Claude Code, Cursor, etc.).

> Full plan: [`docs/superpowers/specs/2026-04-11-ai-platform-plan.md`](docs/superpowers/specs/2026-04-11-ai-platform-plan.md)

**Phase A** — Direct tools (in progress):
- `node_docs_cache` → `trigger_flow` → `list_variables` → `undo_last`
- Switch to Sonnet everywhere (dev mode)

**Phase B** — Infrastructure (strengthens foundation before subagents):
- AI streaming (`streamText`/`streamObject`)
- Handle resolution investigation
- Suggest nodes revisit (future)

**Phase C** — Subagents (brainstorm per subagent, then build on streaming-capable foundation):
- `template_manage` — WhatsApp template CRUD subagent (list, create, publish, get_status)
- `wa_flow_manage` — WhatsApp Flow builder subagent (list, create, update, publish)

**Phase D** — MCP server (wraps A + B + C for external agents):
- 6 direct tools + 4 subagent tools + 3 resources
- Progress notifications for subagent tools
- `magic-flow/mcp-server/`

**Pre-D cleanup — unify quickReply/list field name to `choices` (keep both node types):**

Right now `whatsappQuickReply.data.buttons` and `whatsappInteractiveList.data.options` are two different field names for the same concept: a list of user choices. The split leaks WhatsApp's wire format (`interactive.type: "button"` vs `"list"`) into the builder, AI prompts, validator, and converter, and has already caused multiple bugs (hybrid state, the `mixed_button_option_fields` validator rule, `contentToNodeData` having to branch on both, etc. — see `820b71b`).

**Scope:** narrower than a type collapse. Keep both `whatsappQuickReply` and `whatsappInteractiveList` as distinct node types with distinct palette items (users legitimately want to pick between "inline buttons UX" and "list drawer UX" manually — list has extra features like `listTitle`, section headers, descriptions, longer labels). Only unify the *field name*.

- Rename `whatsappQuickReply.data.buttons` → `whatsappQuickReply.data.choices`
- Rename `whatsappInteractiveList.data.options` → `whatsappInteractiveList.data.choices`
- Both components read from `data.choices`; the two visual components stay distinct and WYSIWYG
- Auto-convert (quickReply → interactiveList when count > 3) changes `node.type` only, leaving `data.choices` untouched — no more `convertButtonsToOptions` helper, no more ID prefix flips
- Converter forward/reverse reads `data.choices` from either type
- Forward-only migration on load: map `data.buttons` → `data.choices` for quickReply, `data.options` → `data.choices` for interactiveList

**What this kills:**
- `buttons`-vs-`options` confusion in the AI prompt (3 lines of CRITICAL rules collapse to one)
- The `mixed_button_option_fields` validator rule
- `transformAiNodeData` options→buttons coercion branch
- The hybrid-state bug class entirely (there's only one field to get wrong)
- `convertButtonsToOptions` helper + the ID-prefix flip logic

**Touches:** `whatsapp-quick-reply-node.tsx`, `whatsapp-list-node.tsx`, `whatsapp-converter.ts` forward+reverse, `flow-plan-builder.ts` (`contentToNodeData`, nodeUpdate processing, auto-convert path), `ai-data-transform.ts` (`transformAiNodeData`), `flow-plan.ts` schema (`nodeContentSchema` — unify `buttons`/`options` into `choices`), `node-factory.ts` defaults, node templates, `node-documentation.ts`, `inferNodeType`, AI prompts (delete the CRITICAL rules), validator (drop `mixed_button_option_fields` and the `convertButtonsToOptions` call site), storage load migration, tests.

Estimated ~0.5–0.75 day. Mostly renames + a small migration pass. Removes code and prompt rules rather than adding them.

**Why before Phase D:** external MCP agents (Claude Code, Cursor) should see one clean `choices` field, not two platform-leaky fields gated by auto-convert coercion. Make the cleanup land before the external-facing schema is frozen.

### 3.8 Media Message Nodes (Image, Video, Document, Audio, Location, Sticker) [#15](https://github.com/freestandtech/magic-flow/issues/15)

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

### 3.9 Node-Level Comments with Actionable Notifications [#16](https://github.com/freestandtech/magic-flow/issues/16)

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

### 3.10 Concurrent Editing / Flow Locking

Currently no protection when two users edit the same flow simultaneously. Drafts are per-user (`ON CONFLICT (project_id, user_id)`), but publishing is last-writer-wins — second publisher silently overwrites the first.

**Current behavior:**
- Both users load the same published version
- Each gets their own draft (auto-save works independently)
- No awareness that someone else is editing
- Publish overwrites with no conflict detection

**Options (increasing complexity):**
1. **Pessimistic locking** — when user enters edit mode, lock the flow. Show "Editing by {name}" to others. Others can view but not edit. Simple, prevents conflicts entirely. ~1 day.
2. **Optimistic locking** — allow concurrent edits, detect conflicts on publish. Compare base version hash. If stale, show diff and ask user to resolve. ~3-5 days.
3. **Real-time collaboration** — CRDT/OT-based sync (like Figma). Both users see each other's cursors and changes live. Requires WebSocket + conflict resolution. ~2-4 weeks.

**Recommendation:** Start with pessimistic locking (option 1). Add a `locked_by` + `locked_at` column to `magic_flow_projects`. Lock on edit mode enter, unlock on exit/timeout. Show lock holder's name in header.

### 3.11 Shareable Flow View + Comment Mode

Share a read-only view of a flow with anyone (no login required), and a comment mode for reviewers.

**Three access levels:**
1. **Edit mode** — full editing, requires login (current behavior)
2. **Comment mode** — view flow + add comments on nodes, requires login (light auth)
3. **View mode** — read-only, no login required, shareable link

**What's needed:**
- **Share link generation** — `GET /flow/{id}/view?token={shareToken}` or slug-based URL. Token stored on project, regeneratable.
- **Public view route** — new Next.js page that loads flow data without auth, renders ReactFlow in view-only mode (no sidebar, no editing, no properties panel)
- **ReactFlow view-only** — no single `readOnly` prop, but composing ~10 props (`nodesDraggable={false}`, `nodesConnectable={false}`, `elementsSelectable={false}`, `connectOnClick={false}`, `deleteKeyCode={null}`, `edgesReconnectable={false}`, etc.) makes it fully read-only. Pan/zoom still work. Trivial to implement.
- **Comment mode** — authenticated users can click nodes to add comments (depends on 3.9 Node-Level Comments). Shows comment indicators on nodes, comment panel on the side.
- **Share button in header** — generates/copies the share link. Options: "View only" or "Can comment" (if logged in).

**Backend:**
- `share_token` column on `magic_flow_projects` (UUID, nullable)
- New public endpoint: `GET /api/magic-flow/projects/{id}/public?token={shareToken}` — returns project data without auth
- Comment mode reuses the node comments system (3.9)

**Research:** Full analysis of ReactFlow, Excalidraw, tldraw-sync, Langflow, n8n, and collaboration libraries in [`docs/research/2026-04-02-collaboration-sharing-research.md`](docs/research/2026-04-02-collaboration-sharing-research.md).

**Key findings:** ReactFlow view-only is free (just props). No OSS project has node-level threaded comments. Excalidraw's element locking (context menu, Cmd+click override) is the pattern to follow. Yjs is the proven path for ReactFlow collaboration. tldraw-sync pattern (server-authoritative, room-based) is an alternative using our Go stack.

**Depends on:** 3.9 (Node-Level Comments) for comment mode. View-only sharing can ship independently.

### 3.12 RBAC ✅

Role-based access control with flat feature names and backend as source of truth.

**Backend (fs-whatsapp):**
- `FeatureRegistry` in `rbac.go` — single source of truth for all 12 features
- `PathFeatureMap` — maps API paths to required features (longest-prefix wins). Every `/api/*` route must be mapped.
- `HasFeature()` — handler-level checks for action-level or data-scoping permissions
- `org_role_permissions` table — per-org, per-role feature config, Redis-cached (5min TTL)
- Auto-seeds defaults with `FirstOrCreate` if empty (race-safe, no manual migration needed)
- `GET /api/settings/features` — returns FeatureRegistry for frontend consumption
- `GET/PUT /api/settings/role-permissions` — CRUD for per-org role config
- 22 RBAC middleware tests

**Frontend (magic-flow):**
- `lib/permissions.ts` — `canAccess()` with prefix matching, `DEFAULT_ROLE_FEATURES` as fallback
- `AuthProvider` + `useAuth()` hook — fetches permissions from backend API, exposes `can(feature)`
- `FeatureGate` component — layout-level access control
- Sidebar filtering — nav items filtered by `can()`, `SETTINGS_CHILDREN` exported for reuse
- Roles & Permissions settings page — reads feature list from backend
- Settings redirect — first accessible page based on `can()`

**12 flat features:** `flows`, `templates`, `chat`, `campaigns`, `contacts`, `analytics`, `accounts`, `users`, `teams`, `chatbot-settings`, `api-keys`, `agent-analytics`. Prefix matching for future sub-features (e.g., `users` grants `users.invite`).

**Adding a new feature:** Add to `FeatureRegistry` + `DefaultRoleFeatures` + `PathFeatureMap` in Go → add nav item + `FeatureGate` in React. See root `CLAUDE.md` for full checklist.

> Spec: `docs/superpowers/specs/2026-04-04-rbac-design.md`

### 3.13 Chat Interface in MagicFlow (P1-P2 ✅, P3-P4 scoped)

Full chat interface ported from Vue to React.

**P1 — Shipped (PR #53):**
WebSocket, contact list, conversation view, 12 message renderers, media blob cache, real-time updates.

**P2 — Shipped (PR #56):**
Hover toolbar, reply-to, reactions, emoji picker, canned responses, retry failed messages, contact info panel, sticky date headers, notification sounds.

**P3-P4 — Scoped, not built:**
Agent transfers, custom actions, remaining chat features.

### 3.14 Undo/Redo in Flow Builder ✅

> Shipped: magic-flow #54

Canvas-level undo/redo for the flow editor. Snapshot-based `useUndoRedo` hook wraps `setNodes`/`setEdges` with `trackedSetNodes`/`trackedSetEdges` — all downstream hooks get undo support automatically.

**What shipped:**
- `useUndoRedo` hook with JSON deep clone, 50-entry max, dedup, ephemeral field stripping
- Auto-capture via `trackedSetNodes`/`trackedSetEdges` wrappers — every mutation is undoable
- Manual capture (`snapshot()` + `resumeTracking()`) for multi-step ops (delete, paste, AI)
- Inline edit grouping: `onFocus → onSnapshot`, `onBlur → onResumeTracking` on all 21+ editable nodes
- Keyboard shortcuts: Cmd+Z (undo), Cmd+Shift+Z (redo) with guard for inputs/modals/panels
- Toolbar undo/redo buttons with disabled state
- AI undo: shared stack, stagger abort on Cmd+Z mid-generation
- `clearHistory()` on reset to published, version load, mode toggle, flow import
- Change tracker integration: `restoreChanges()` keeps auto-save dirty flag correct
- 41 unit tests
- Claude Code pre-commit hook enforces `onSnapshot`/`onResumeTracking` on new node components

---

## Phase 4 — Full Platform Convergence

### 4.1 Contact Management
### 4.2 Campaigns / Broadcasting
### 4.3 Remaining Settings (keywords, AI contexts, canned responses, webhooks, SSO)

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
| Split `generate-flow.ts` monolith into focused modules ✅ | — | Done |
| Replace primitive HTML with shadcn components ✅ | [#17](https://github.com/freestandtech/magic-flow/issues/17) | Done |
| Version history modal UI redesign | [#26](https://github.com/freestandtech/magic-flow/issues/26) | High |
| API Fetch response mapping key collision | [#27](https://github.com/freestandtech/magic-flow/issues/27) | High |
| AI-generated flows have overlapping nodes | [#7](https://github.com/freestandtech/magic-flow/issues/7) | High |
| Standardize AI flow JSON naming/redirection | [#2](https://github.com/freestandtech/magic-flow/issues/2) | High |
| API Fetch node: compact UI + improved panel | [#8](https://github.com/freestandtech/magic-flow/issues/8) | Medium |
| Draft auto-save optimization ([details](#draft-auto-save-optimization)) | — | Medium |
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

### Draft Auto-Save Optimization

Current auto-save sends the full `nodes[]` + `edges[]` JSON on every change (1s debounce). `JSON.stringify` comparison detects changes. Backend does efficient partial-column upsert.

**Two problems:**
1. **False saves** — clicking canvas toggles `node.selected`, which changes the JSON snapshot, triggering a save with no real content change. Fix: strip UI-only fields (`selected`, `dragging`) from the snapshot comparison.
2. **Payload size at scale** — full JSON transfer gets slow on poor networks for large flows.

**Payload size estimates:**

| Flow Size | JSON | Gzipped | Slow 3G (100Kbps) | WiFi (5Mbps) |
|-----------|------|---------|-------------------|--------------|
| 10 nodes | ~5 KB | ~2 KB | 20ms | <1ms |
| 50 nodes | ~25 KB | ~10 KB | 100ms | 2ms |
| 100 nodes | ~51 KB | ~20 KB | 200ms | 4ms |
| 200 nodes | ~102 KB | ~41 KB | 400ms | 8ms |

**Current method is fine up to ~100 nodes.** Beyond that, network transfer becomes noticeable on slow connections. `JSON.stringify` comparison itself is negligible (1-5ms even at 200 nodes).

**Future optimizations (when needed):**
- Strip `selected`/`dragging` from snapshot comparison (fix false saves — do first)
- Send differential updates (only changed nodes) instead of full arrays
- Increase debounce to 2-3s for large flows
- Gzip middleware on fastglue backend

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

**Phase 2.7 — ✅ Complete** (April 2026)
- App shell with sidebar, profile page, 5 settings pages, embedded signup
- Design system cleanup: token architecture, color palette, sidebar, platform theming
- Flow builder header redesign: version badge, auto-save indicator, overflow fix

**Pre-Phase 3 — ✅ Complete** (April 2026)
- Template persistence migrated to React Query + draft system
- Template filtering, loading state, flattener sync-next fix
- Flow card enhancements (wa.me links, account indicator, ref link column)
- Test Flow panel on start node with End Session & Retry
- Start node draggable, apiClient error messages, header consolidation

**Phase 3.12 — RBAC ✅** (April 2026)
- Backend: 12 flat features, longest-prefix PathFeatureMap, auto-seed with FirstOrCreate, agent-analytics feature, 22 Go tests
- Frontend: AuthProvider fetches from backend API, canAccess, FeatureGate layouts, sidebar filtering, Roles settings page, smart settings redirect
- All API routes mapped in PathFeatureMap — no unprotected endpoints

**AI Self-Correction ✅** (April 2026)
- flow-validator.ts — validates AI-generated flows (orphaned nodes, undefined vars, button limits, unconnected handles, flowTemplate integrity)
- CREATE mode: self-correction loop with max 2 retries (validate → feed issues to Haiku → retry)
- EDIT mode: validate_result tool — Sonnet validates its own edits and self-corrects
- generateJSON fallback: text generation + Zod schema validation when structured output fails (Anthropic compatibility)
- Works with both Anthropic and OpenAI providers

**Save Flow as Template ✅** (April 2026)
- 3 entry points: flow editor dropdown, dashboard 3-dot menu, AI chat (save_as_template tool)
- SaveAsTemplateDialog with AI-prefilled metadata (Haiku generates name, description, whenToUse)
- Template resolution: plan builder resolves user templates by ID via templateResolver
- Full template data loaded in AI assistant for resolver pipeline

**Deferred to Phase 3:**
- API timeout config (1.4 partial)
- FLOW button in template builder (1.5)
- Variables Phase 5 — global editor, inline creation, AI awareness (1.5)
