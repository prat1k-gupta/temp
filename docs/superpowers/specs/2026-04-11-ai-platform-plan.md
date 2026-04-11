# MagicFlow AI Platform — Build Plan

Upgrading the flow assistant from a single-purpose flow generator into a multi-agent platform with 4 subagents and 6 direct tools, exposed internally through the MagicFlow UI and externally through an MCP server.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server                           │
│              (external agents access)                   │
│                                                         │
│  ┌─── Direct Tools ───┐  ┌─── Subagent Tools ────────┐ │
│  │ flow_get            │  │ flow_create               │ │
│  │ flow_list           │  │ flow_edit                 │ │
│  │ flow_validate       │  │ template_manage           │ │
│  │ flow_publish        │  │ wa_flow_manage            │ │
│  │ flow_trigger        │  │                           │ │
│  │ flow_node_types     │  │ Each spawns a Sonnet      │ │
│  │                     │  │ subagent with own tools   │ │
│  │ One call → response │  │ + progress notifications  │ │
│  └─────────────────────┘  └───────────────────────────┘ │
│                                                         │
│  Resources: config://platforms, node-types, variables   │
└─────────────────────────────────────────────────────────┘
                          │
                    wraps the same
                    code as below
                          │
┌─────────────────────────────────────────────────────────┐
│              Internal Flow Assistant                    │
│               (MagicFlow UI access)                     │
│                                                         │
│  Flow Assistant (Sonnet, tool-use loop)                 │
│  ├── get_node_details                                   │
│  ├── get_node_connections                               │
│  ├── apply_edit                                         │
│  ├── validate_result                                    │
│  ├── save_as_template                                   │
│  ├── list_variables         [NEW — Phase A]             │
│  ├── trigger_flow           [NEW — Phase A]             │
│  ├── undo_last              [NEW — Phase A]             │
│  ├── manage_template ──┐    [NEW — Phase B]             │
│  │   Template Subagent │                                │
│  │   ├── list_templates                                 │
│  │   ├── create_template                                │
│  │   ├── publish_template                               │
│  │   └── get_status                                     │
│  └── manage_whatsapp_flow ┐ [NEW — Phase B]             │
│      WA Flow Subagent     │                             │
│      ├── list_whatsapp_flows                            │
│      ├── create_whatsapp_flow                           │
│      ├── update_whatsapp_flow                           │
│      └── publish_whatsapp_flow                          │
└─────────────────────────────────────────────────────────┘
```

## Why Subagents, Not Flat Tools

External agents (Claude Code, Cursor) don't understand flow semantics. Exposing `create_node`, `create_edge` as raw MCP tools forces the external agent to understand node types, handles, positioning, platform constraints, variable scoping. That's not its job.

Instead: `flow_create("lead capture flow for WhatsApp")` → subagent handles all domain reasoning internally. One tool call from outside, expert reasoning inside.

Same for templates and WhatsApp Flows — the external agent describes what it wants in natural language, the subagent that knows Meta's constraints handles it.

## MCP Progress Notifications

MCP tool calls are blocking (request → wait → response). Subagent tools can take 10-30 seconds. To avoid dead silence, each subagent emits `notifications/progress` during execution:

```
Claude Code calls flow_create(...)
  ← [progress: "Generating flow plan..."]
  ← [progress: "Building 5 nodes..."]
  ← [progress: "Validating flow..."]
  ← [progress: "Validation passed, saving..."]
  ← Result: "Created 'Lead Capture' with 5 nodes"
```

Future: upgrade to MCP Tasks (async call-now-fetch-later) when Claude Code supports it (spec accepted, tracked in claude-code#18617).

## Phase A — Direct Tools

No brainstorming needed. Can build now.

### A1: node_docs_cache

Cache `getAllNodeDocumentation()` — currently rebuilt every prompt. Node types don't change at runtime. Build once, return cached.

Branch: `feat/node-docs-cache`

### A2: trigger_flow

Tool for the flow assistant to trigger a flow run.

- Input: `{ flow_id, phone_number, template_params? }`
- Calls: `POST /api/chatbot/sessions/test`
- Returns: session ID + delivery status
- Assistant offers: "Want me to test this?" after building/editing

Branch: `feat/trigger-flow-tool`

### A3: list_variables

Tool to list available variables for interpolation.

- Returns: current flow variables (from storeAs), global variables, system variables
- Includes usage rules: when to use `{{var}}` vs `{{global.var}}` vs `{{system.var}}`
- Mirrors what the variable picker shows in the UI

Branch: `feat/list-variables-tool`

### A4: undo_last

Tool for the assistant to revert its own last edit.

- Restrictions: only undo AI's own changes, max 1 undo per turn, requires confirmation
- Calls the existing undo system (`useUndoRedo.undo()`)

Branch: `feat/undo-ai-tool`

### A5: Switch to Sonnet everywhere

Replace Haiku with Sonnet for create mode. Dev mode — cost isn't the priority. User model selection comes later.

## Phase B — Subagents

Brainstorm per subagent before building.

### B1: Template Subagent

WhatsApp message template CRUD with AI generation.

```
manage_template tool
│
└── Template Subagent (Sonnet, own tool-use loop)
    │
    ├── System prompt: Meta template guidelines, character limits,
    │   variable syntax ({{name}} not {{1}}), category rules,
    │   approval best practices, duplicate detection
    │
    ├── list_templates
    │   Calls: GET /api/templates
    │   Returns: existing templates with names, status, category
    │
    ├── create_template
    │   Uses: generate-template.ts for content generation
    │   Calls: POST /api/templates to save
    │   Returns: template ID, preview
    │
    ├── publish_template
    │   Calls: POST /api/templates/:id/publish
    │   Returns: submission status
    │
    └── get_status
        Calls: GET /api/templates/:id
        Returns: approval status from Meta
```

**Brainstorm needed:**
- When does the flow assistant call `manage_template` vs leave a placeholder?
- Retry strategy on Meta rejection?
- How to wire created template ID back into the flow's template node?

Branch: `feat/template-subagent`

### B2: WhatsApp Flow Builder Subagent

WhatsApp Flows (Meta native forms) builder with AI generation.

```
manage_whatsapp_flow tool
│
└── WA Flow Builder Subagent (Sonnet, own tool-use loop)
    │
    ├── System prompt: Meta component types (TextInput, TextArea,
    │   Dropdown, RadioButtons, CheckboxGroup, DatePicker, etc.),
    │   screen constraints, data routing, validation rules
    │
    ├── list_whatsapp_flows
    │   Calls: GET /api/whatsapp-flows
    │   Returns: existing flows with names, status
    │
    ├── create_whatsapp_flow
    │   Generates: screens[] JSON from description
    │   Calls: POST /api/whatsapp-flows to save
    │   Returns: flow ID, screens summary
    │
    ├── update_whatsapp_flow
    │   Modifies: existing screens[] JSON
    │   Calls: PATCH /api/whatsapp-flows/:id
    │
    └── publish_whatsapp_flow
        Calls: POST /api/whatsapp-flows/:id/publish
        Returns: publish status
```

**Brainstorm needed:**
- When to use WhatsApp Flow node vs regular question nodes?
- How does the subagent get flow context to know what data to collect?
- Screen layout and navigation between screens?

Branch: `feat/whatsapp-flow-subagent`

## Phase C — Infrastructure

### C1: AI Streaming

Replace blocking `generateText()` / `generateObject()` with `streamText()` / `streamObject()`. Stream thinking/plan as text in chat panel while generating, render nodes when done.

Branch: `feat/ai-streaming`

### C2: Handle Resolution Investigation

Current heuristic: when an edge doesn't specify a handle, find the first free button. This can wire to the wrong button when buttons have semantic meaning. Investigate and fix if confirmed buggy.

### C3: Suggest Nodes Revisit

Currently disabled (fired on every node selection, slowed editor). Revisit with debounce or on-demand triggering. Future work.

## Phase D — MCP Server

Wraps everything from Phases A-C for external agents.

```
MCP Server (@freestand/mcp-server)
│
├── Transport: stdio (local dev) + Streamable HTTP (production)
├── Auth: API key → fs-whatsapp auth (handle after core is built)
│
├── Direct Tools (6)
│   ├── flow_get            → fetch + buildFlowGraphString()
│   ├── flow_list           → fs-whatsapp API
│   ├── flow_validate       → validateGeneratedFlow()
│   ├── flow_publish        → whatsapp-converter + API
│   ├── flow_trigger        → trigger API
│   └── flow_node_types     → cached docs
│
├── Subagent Tools (4) — with progress notifications
│   ├── flow_create         → Flow Create Subagent
│   ├── flow_edit           → Flow Edit Subagent
│   ├── template_manage     → Template Subagent
│   └── wa_flow_manage      → WA Flow Subagent
│
├── Resources (3)
│   ├── config://platforms
│   ├── config://node-types/{platform}
│   └── flow://{id}/variables
│
└── Location: magic-flow/mcp-server/
```

**Brainstorm needed:** Server instructions, tool descriptions, response format, error messages that steer the agent.

Branch: `feat/mcp-server`

## Build Sequence

```
Phase A — Direct Tools (build now, no brainstorming)
──────────────────────────────────────────────────────
  node_docs_cache → trigger_flow → list_variables → undo_last
  + switch to Sonnet everywhere

Phase B — Infrastructure (build next, strengthens foundation)
──────────────────────────────────────────────────────
  ai_streaming (streamText/streamObject for chat panel)
  handle resolution investigation (first free button heuristic)
  suggest nodes revisit (future, add to roadmap only)

Phase C — Subagents (brainstorm per subagent, then build)
──────────────────────────────────────────────────────
  Brainstorm template_subagent → Build → Test
  Brainstorm wa_flow_subagent  → Build → Test
  Subagents run on streaming-capable, cached, bug-fixed foundation

Phase D — MCP Server (wraps A + B + C for external agents)
──────────────────────────────────────────────────────
  Brainstorm MCP server → Build → Test
  6 direct tools + 4 subagent tools + progress notifications
```

## Branches

| Branch | Phase | Type |
|--------|-------|------|
| `feat/node-docs-cache` | A | Infra |
| `feat/trigger-flow-tool` | A | Direct tool |
| `feat/list-variables-tool` | A | Direct tool |
| `feat/undo-ai-tool` | A | Direct tool |
| `feat/ai-streaming` | B | Infra |
| `feat/template-subagent` | C | Subagent |
| `feat/whatsapp-flow-subagent` | C | Subagent |
| `feat/mcp-server` | D | Server |
