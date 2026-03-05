# Magic Flow — Roadmap & Ideas Tracker

## Overview

Magic Flow is a visual chatbot flow builder that publishes to fs-whatsapp (WhatsApp execution engine). This doc tracks all ideas discussed, what's been built, and what's pending.

---

## Completed Work

### Phase 1 — storeAs + Converter + Publish (`d5dd086`)
- `storeAs` session variables on Question, Quick Reply, List, and Super nodes
- Bidirectional converter: magicflow nodes → `FsWhatsAppFlowStep[]`
- Publish endpoint to fs-whatsapp API
- WhatsApp input types (text, number, email, phone, date) inferred from node type
- Validation presets infrastructure (regex per input type)
- `StoreAsPill` UI component
- Trigger keywords on Start node

### Phase 2 — Converter Fixes + Action Nodes (`0c05e33`)
- Completed `FsWhatsAppFlowStep` interface to match Go model
- Fixed condition node serialization (operator mapping, per-rule routes)
- **API Fetch node** — call external APIs mid-flow, response mapping to variables
- **Transfer node** — hand off conversation to human agent/team
- Condition AND chains support
- Button ID keys in `conditional_next`
- `__complete__` termination marker

### Phase 3 — Single Source of Truth for AI (`be186b0`)
- Centralized `NODE_TEMPLATES` with `ai` metadata (descriptions, examples, dependencies)
- `getSimplifiedNodeDocumentation()`, `getNodeSelectionRules()`, `getNodeDependencies()`
- All AI tools read from one source — no drift between flow gen, suggestions, and docs
- Node limits consolidated into templates

### Multi-Model AI + Variable Interpolation (`94f001e`)
- Model registry: Claude Sonnet (flow gen), Claude Haiku (suggestions/improve/buttons), Gemini Flash Lite (shorten)
- `{{storeAs}}` for text inputs, `{{storeAs_title}}` for button/list display text
- AI generates `storeAs` variable names on nodes
- Super node fixed vars: `{{user_name}}`, `{{user_email}}`, `{{user_dob}}`, `{{user_address}}`
- Node suggestor updated with same variable system
- `collectFlowVariables()` passed to AI for edit context

### Button Auto-Conversion (unphased)
- Shared `shouldConvertToList()` + `convertButtonsToOptions()` in `utils/node-operations.ts`
- Used by: flow-plan-builder, use-node-operations hook, use-flow-ai hook, WhatsApp node, Instagram node
- Automatic quickReply → interactiveList when buttons exceed platform limit

### Template System — Builder + Node + Backend (`6c2a4bc`, `effd83b`)
**magic-flow:**
- **Template Builder page** (`/templates`) — list page with status/category filtering, sync from Meta, submit to Meta
- **Template Builder form** — full editor with live WhatsApp preview (header types, body with variables, footer, buttons)
- **AI template generation** — Claude Haiku generates template copy from description
- **Template API proxy routes** — list, create, get, update, delete, publish, sync (via shared `fs-whatsapp-proxy.ts`)
- **Template Message node** — select approved template, map flow variables to template params, quick reply button handles
- **Converter** — `templateMessage` → `message_type: "template"` with `input_config`; reverse converter for import
- `input_type` defaults to `"button"` — always wait for user reply (WhatsApp 24h window rule)
- Templates nav link in flows page header

**fs-whatsapp:**
- **Template step processing** — `case models.FlowStepTypeTemplate` in chatbot processor, variable substitution in params
- **Rich template rendering** in flow preview (header: text/image/video/document, body, footer, quick reply + URL buttons)
- **Template rendering in ChatView** — WhatsApp-style template bubbles with header media, body, footer, buttons
- **Template selector UI** in ChatbotFlowBuilderView — pick approved templates, configure params
- **Send Flow API** — `POST /api/chatbot/flows/{id}/send` with phone number + variables to trigger flows externally
- Flow simulation handles template steps (auto-advance with reply buttons, proper input detection)

### Other Shipped Features
- AI flow generation from text prompts (plan-based architecture)
- AI flow editing (scoped edits, tree graph context)
- AI node suggestions with flow graph context
- AI copy improvement per node
- AI button text generation
- AI text shortening
- Plan-based flow builder (`FlowPlan` → nodes + edges)
- Connection menu with AI suggestions
- Resizable properties panel
- API test section in properties panel
- Flow re-publish (update existing instead of duplicate)
- Docker dev/production setup with Redis

---

## Pending — Next Phases

### Phase 4 — Subflow Expansion (Super Nodes)

**Status**: Discussed extensively, not started

Super nodes (name, email, dob, address) currently appear as single nodes. They should expand into multi-step internal flows that the converter flattens into fs-whatsapp steps.

**What this means:**
- **Name node** → expands to: ask first name → validate → ask last name → validate → combine
- **Email node** → expands to: ask email → format validation → (optional: send OTP → verify)
- **DOB node** → expands to: ask date → validate format → check age range → error/retry
- **Address node** → expands to: ~15 steps including format prompt → collect input → validate pincode via API → check conditions → error messages → retry loop → success

**Architecture decisions made:**
- Subflow = a complete mini flow graph (real nodes + edges) stored in the super node's data
- Double-click a super node → opens a subflow editor modal showing the internal flow
- Converter flattens the subflow into sequential `FsWhatsAppFlowStep[]` when publishing
- Pre-built templates for the 4 super nodes — not user-editable in Phase 4

**What needs to be built:**
1. `subflowSteps` or `internalGraph` data model in `SuperNodeData`
2. Subflow editor component (modal with mini ReactFlow canvas)
3. Pre-built subflow templates for name, email, dob, address
4. Converter expansion logic — flatten subflow graph into linear steps
5. Variable scoping — subflow internal vars vs parent flow vars
6. Visual indicator that a super node is expandable

**Open questions:**
- Should subflow nodes use the same node types as the parent flow, or simplified types?
- How deep can nesting go? (likely: 1 level only for now)

---

### Phase 5 — Custom Super Nodes (User-Created Subflows)

**Status**: Discussed, deferred

Marketers can create their own reusable subflows:
- Group any set of nodes into a "custom super node"
- Save as template, reuse across flows
- Each instance is a copy (not a reference)

---

### Call Flow Node (Reference-Based Subflows)

**Status**: Discussed, deferred to after subflow expansion

Unlike super nodes (copy-based), a Call Flow node references an existing flow by ID:
- Maps to fs-whatsapp's `call_flow` step type
- Changes to the referenced flow propagate to all callers
- Needs variable passing/returning design (which vars to share, scoping)
- fs-whatsapp backend already has `call_flow` support

**Decision**: Deferred because proper variable sharing/scoping between flows needs design work. Super node subflows (copy-based) are simpler to ship first.

---

### Missing Node Types (from Gap Analysis)

| Node | fs-whatsapp type | Status | Priority |
|------|-----------------|--------|----------|
| API Fetch | `api_fetch` | Done (Phase 2) | - |
| Transfer / Handoff | `transfer` | Done (Phase 2) | - |
| Template Message | `template` | **Done** | - |
| WhatsApp Native Flow | `whatsapp_flow` | Not started | Medium |
| Conditional Routing (silent) | `conditional_routing` | Partially (condition node exists) | Low |

**Template Message**: Done — node in magic-flow, converter, processor in fs-whatsapp, rich rendering in flow preview + chat view, Send Flow API for external triggers.

**WhatsApp Native Flow**: Trigger a Meta WhatsApp Flow (multi-screen form). Needs flow ID picker and data mapping.

---

### AI Improvements (from AI_FEATURES_GUIDE.md)

| Feature | Status |
|---------|--------|
| Per-node copy improver | Done |
| Smart node recommender | Done (connection menu suggestions) |
| AI flow builder (text → flow) | Done |
| AI flow editor (text → edits) | Done |
| AI streaming responses | Not started (infrastructure exists: `generateStream` in ai-client.ts) |
| AI template library | Not started |
| Learn from user patterns | Not started |
| Bulk copy improvement | Not started |
| Multi-language support | Not started |

---

### Super Node Configuration Modal

**Status**: Placeholder implemented (toast: "Configuration modal coming soon...")

Double-clicking a super node should open a configuration modal showing:
- Validation rules editor (toggle required, set limits, etc.)
- Internal flow visualization (Phase 4 dependency)
- Test validation with example inputs

---

### Future Super Node Types (from SUPER_NODES_GUIDE.md)

| Type | Description | Priority |
|------|-------------|----------|
| Phone Number | International format validation | Medium |
| File Upload | Type and size validation | Low |
| Payment | Integration with Stripe/PayPal | Low |
| Credit Card | PCI-compliant capture | Low |
| Multi-step Form | Complex form with progress | Low |

---

### Integration Nodes

10 integration node types exist visually (Shopify, Meta, Stripe, Zapier, Google Sheets, Salesforce, Mailchimp, Twilio, Slack, Airtable) but have **no actual integration logic**. These are UI placeholders.

---

### Other Ideas & Polish

- **Sidebar search**: Filter nodes in the sidebar
- **Undo/redo**: Flow editing history
- **Node favorites**: Quick access to frequently used nodes
- **Flow templates**: Pre-built flow templates for common use cases
- **A/B testing**: Test different flow variations
- **Analytics**: Node usage statistics
- **Soft vs hard limits**: Warning vs blocking on limits
- **Custom validation rules per node**: Beyond presets

---

## Architecture Notes

### Current Super Node Data (flat — no subflow)
```typescript
{
  type: "address"
  label: "Address"
  question: "Please enter your address"
  storeAs: "user_address"
  validationRules: { required: true, validatePostalCode: true, ... }
  addressComponents: ["House Number", "Society/Block", "Area", "City"]
}
```

### Planned Super Node Data (with subflow — Phase 4)
```typescript
{
  type: "address"
  label: "Address"
  storeAs: "user_address"
  subflow: {
    nodes: Node[]    // internal ReactFlow nodes
    edges: Edge[]    // internal ReactFlow edges
  }
}
```

### Variable Convention (fs-whatsapp)
- `sessionData[store_as]` = raw value (button ID for buttons, text for inputs)
- `sessionData[store_as + "_title"]` = display text (button label)
- AI uses `{{var}}` for text, `{{var_title}}` for button/list display text
- Super nodes: `{{user_name}}`, `{{user_email}}`, `{{user_dob}}`, `{{user_address}}`

### Key Files
- Node templates: `constants/node-categories.ts`
- Super node components: `components/nodes/super/`
- AI tools: `lib/ai/tools/`
- Converter: `utils/whatsapp-converter.ts`
- Flow plan builder: `utils/flow-plan-builder.ts`
- Validation presets: `utils/validation-presets.ts`

---

## Suggested Next Phase Priority

1. **Phase 4: Subflow Expansion** — unlocks the real value of super nodes
2. **Super Node Configuration Modal** — quick win, improves UX
3. **WhatsApp Native Flow node** — trigger Meta WhatsApp Flows from chatbot flows
4. **Call Flow node** — enables flow composition
5. **Custom Super Nodes** — power-user feature
