# MagicFlow AI Flow Assistant -- Tool Reference

The MagicFlow AI Flow Assistant is an LLM-powered agent embedded in the flow builder. It can create new chatbot flows from scratch, edit existing flows, run tests, look up organizational data, and manage broadcast campaigns -- all through a structured set of tools. The assistant operates in two modes:

- **Create mode** -- builds a new flow from a user's natural-language description using `build_and_validate`.
- **Edit mode** -- inspects and modifies an existing flow using a tool-use loop (`get_node_details` -> `apply_edit` -> `validate_result`).

Tools are registered via the Vercel AI SDK's `tool()` function with Zod input schemas. The assistant calls tools autonomously during its reasoning loop; the user never invokes them directly.

---

## Tool Availability Conditions

Not every tool is available in every session. Availability depends on four runtime gates:

| Gate | Source | Effect |
|---|---|---|
| `apiUrl` | `FS_WHATSAPP_API_URL` env var | All backend-calling tools (lookup, testing, campaigns) require this. If unset, only local editing tools are available. |
| `authHeader` | `toolContext.authHeader` (user's session token) | Required alongside `apiUrl` for any authenticated API call. |
| `publishedFlowId` | `toolContext.publishedFlowId` | Required for `trigger_flow`. The flow must be published to WhatsApp. |
| `platform` | `request.platform` (`"whatsapp"` / `"instagram"` / `"web"`) | `list_approved_templates` and `trigger_flow` are WhatsApp-only. |

**Summary:**

| Availability level | Requires | Tools |
|---|---|---|
| Always | Nothing | `get_node_details`, `get_node_connections`, `apply_edit`, `validate_result`, `undo_last`, `list_variables`, `save_as_template`, `build_and_validate` |
| Authenticated | `apiUrl` + `authHeader` | `list_flows`, `list_accounts`, `get_flow_variables`, `preview_audience`, `create_campaign`, `start_campaign`, `get_campaign_status`, `list_campaigns`, `pause_campaign`, `cancel_campaign` |
| WhatsApp + Authenticated | `apiUrl` + `authHeader` + `platform === "whatsapp"` | `list_approved_templates` |
| Published WhatsApp flow | `apiUrl` + `authHeader` + `publishedFlowId` + `platform === "whatsapp"` | `trigger_flow` |

---

## Tools by Category

### Flow Editing

These tools power the edit-mode agent loop. The typical sequence is: inspect (`get_node_details` / `get_node_connections`) -> modify (`apply_edit`) -> verify (`validate_result`) -> self-correct if needed.

#### `get_node_details`

Get full details of a node including choice handle IDs, storeAs, and content. Call this before editing nodes with choices to get exact handle IDs for `attachHandle` and `removeEdges`.

**Availability:** Always (edit mode)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `nodeId` | `string` | Yes | The node ID (e.g. `"plan-quickReply-2-x7f3"`) |

**Returns on success:**

```json
{
  "id": "plan-quickReply-2-x7f3",
  "type": "whatsappQuickReply",
  "label": "Ask preference",
  "question": "What do you prefer?",
  "storeAs": "preference",
  "choices": [
    { "index": 0, "text": "Option A", "id": "btn-abc", "handleId": "btn-abc" },
    { "index": 1, "text": "Option B", "id": "btn-def", "handleId": "btn-def" }
  ]
}
```

**Example use case:** Before editing a quickReply node, call this to discover the exact `handleId` values needed for `addEdges.sourceHandle` or `removeEdges.sourceHandle`.

---

#### `get_node_connections`

Get all edges connected to a node (incoming and outgoing with handle IDs). Use this to know which edges to remove when rewiring.

**Availability:** Always (edit mode)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `nodeId` | `string` | Yes | The node ID to get connections for |

**Returns on success:**

```json
{
  "nodeId": "plan-quickReply-2-x7f3",
  "outgoing": [
    { "target": "plan-question-3-y8g4", "sourceHandle": "btn-abc" },
    { "target": "plan-flowComplete-4-z9h5", "sourceHandle": "btn-def" }
  ],
  "incoming": [
    { "source": "plan-question-1-w6e2", "sourceHandle": "default" }
  ]
}
```

**Example use case:** Before removing a node, call this to understand what edges will be orphaned and need to be rewired.

---

#### `apply_edit`

Apply an edit plan to the flow. Include ALL operations (chains, nodeUpdates, addEdges, removeNodeIds, removeEdges) in a SINGLE call. Do NOT split across multiple calls or call with an empty plan.

**Availability:** Always (edit mode)

**Input schema** (`editFlowPlanSchema`):

| Parameter | Type | Required | Description |
|---|---|---|---|
| `message` | `string` | Yes | Summary of what this edit does |
| `chains` | `EditChain[]` | No (defaults to `[]`) | New node chains to attach to existing nodes |
| `nodeUpdates` | `NodeUpdate[]` | No | Partial updates to existing nodes (merge semantics) |
| `addEdges` | `NewEdge[]` | No | New edges to create between nodes |
| `removeNodeIds` | `string[]` | No | Node IDs to delete |
| `removeEdges` | `EdgeReference[]` | No | Edges to remove (by source + target + sourceHandle) |
| `description` | `string` | No | Longer description of the edit |

**Nested types:**

`EditChain`:

| Field | Type | Required | Description |
|---|---|---|---|
| `attachTo` | `string` | Yes | Node ID to attach the chain to |
| `attachHandle` | `string` | No | Specific handle on the source node (e.g. a button ID) |
| `steps` | `FlowStep[]` | Yes | Array of `NodeStep` or `BranchStep` objects |
| `connectTo` | `string` | No | Node ID to connect the end of the chain to |

`NodeUpdate`:

| Field | Type | Required | Description |
|---|---|---|---|
| `nodeId` | `string` | Yes | ID of the node to update |
| `content` | `NodeContent` | Yes | Partial data to merge into the node |
| `newType` | `string` | No | Change the node's type in place (cross-type update) |

`NewEdge`:

| Field | Type | Required | Description |
|---|---|---|---|
| `source` | `string` | Yes | Source node ID (or `localId:<name>` for newly created nodes) |
| `target` | `string` | Yes | Target node ID (or `localId:<name>`) |
| `sourceButtonIndex` | `number` | No | Button index on the source node (resolved to button handle ID) |
| `sourceHandle` | `string` | No | Direct handle ID (for non-button connections like `"sync-next"`) |

`EdgeReference`:

| Field | Type | Required | Description |
|---|---|---|---|
| `source` | `string` | Yes | Source node ID |
| `target` | `string` | Yes | Target node ID |
| `sourceHandle` | `string` | No | Handle ID on the source |

`NodeContent` (used in both `NodeUpdate.content` and `NodeStep.content`):

| Field | Type | Description |
|---|---|---|
| `label` | `string` | Node label |
| `question` | `string` | Question text (question nodes) |
| `text` | `string` | Message text |
| `choices` | `string[]` | Button/list items (quickReply, interactiveList) |
| `listTitle` | `string` | List title (interactiveList) |
| `comment` | `string` | Internal comment |
| `message` | `string` | Message text (whatsappMessage, etc.) |
| `storeAs` | `string` | Variable name to store the response |
| `templateId` | `string` | Flow template reference ID |
| `url` | `string` | API URL (apiFetch) |
| `method` | `string` | HTTP method (apiFetch) |
| `headers` | `Record<string, string>` | Request headers (apiFetch) |
| `body` | `string` | Request body (apiFetch) |
| `responseMapping` | `Record<string, string>` | Response field mapping (apiFetch) |
| `fallbackMessage` | `string` | Fallback on API error (apiFetch) |
| `variables` | `Array<{name, value}>` | Variable assignments (action node) |
| `tags` | `string[]` | Tag names (action node) |
| `tagAction` | `"add" \| "remove"` | Tag operation (action node) |
| `templateName` | `string` | Meta template name (templateMessage) |
| `displayName` | `string` | Template display name |
| `language` | `string` | Template language code |
| `category` | `string` | Template category |
| `headerType` | `string` | Template header type |
| `bodyPreview` | `string` | Template body text preview |
| `parameterMappings` | `Array<{templateVar, flowValue}>` | Template variable mappings |
| `templateButtons` | `Array<{type, text, url?, id?}>` | Template buttons |

**Returns on success:**

```json
{
  "success": true,
  "summary": {
    "newNodes": 2,
    "newEdges": 3,
    "nodeUpdates": 1,
    "removedNodes": 0,
    "removedEdges": 0
  },
  "details": {
    "kind": "edit",
    "added": [{ "type": "Quick Reply", "label": "Ask preference" }],
    "removed": [],
    "updated": [{ "type": "Question", "label": "Get name", "fields": ["question", "storeAs"] }],
    "edgesAdded": 3,
    "edgesRemoved": 0
  },
  "warnings": ["nodeUpdate auto-converted quickReply to interactiveList (4 choices)"]
}
```

**Returns on failure:** `{ success: false, error: "...", skippedOperations: [...], suggestion: "..." }`

**Example use case:** Add a new question node after an existing quickReply button, update the quickReply text, and remove an old edge -- all in one call.

---

#### `validate_result`

Validate the current state of the flow after applying edits. Call this after `apply_edit` to check for issues like orphaned nodes, missing connections, undefined variables, or button limit violations. On success, the canvas commits the validated edit.

**Availability:** Always (edit mode)

| Parameter | Type | Required | Description |
|---|---|---|---|
| *(none)* | -- | -- | Takes an empty object `{}` |

**Returns on success:**

```json
{
  "valid": true,
  "issueCount": 0,
  "issues": [],
  "suggestion": "Flow looks good -- no issues found."
}
```

**Returns with issues:**

```json
{
  "valid": false,
  "issueCount": 2,
  "issues": [
    { "type": "orphan", "nodeId": "node-abc", "nodeLabel": "Get name", "detail": "Node has no incoming edges" },
    { "type": "button_limit", "nodeId": "node-def", "nodeLabel": "Menu", "detail": "Quick reply has 5 buttons (max 3)" }
  ],
  "suggestion": "Issues found. Call apply_edit to fix them, then validate_result again."
}
```

**Example use case:** After every `apply_edit`, call `validate_result` to confirm the flow is structurally sound before the changes are committed to the canvas.

---

#### `undo_last`

Revert ALL `apply_edit` changes and return the flow to its original state (before any edits this turn). Use this if `validate_result` found issues that are too complex to fix, or if the user asks to undo.

**Availability:** Always (edit mode)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `reason` | `string` | Yes | Why the edit is being undone |

**Returns on success:**

```json
{
  "success": true,
  "message": "Edit reverted: validation issues too complex to fix inline. The flow is back to its original state before any edits this turn."
}
```

**Returns on failure (nothing to undo):**

```json
{
  "success": false,
  "error": "No edit to undo -- apply_edit has not been called yet."
}
```

**Example use case:** The assistant applied an edit that introduced 5+ validation issues. Rather than attempting a complex fix, it undoes and asks the user for clarification.

---

#### `list_variables`

List all available variables in the current flow, including any created by recent `apply_edit` calls. Returns flow variables (from `storeAs`, API response mapping, action nodes), system variables, and global variables.

**Availability:** Always (edit mode)

| Parameter | Type | Required | Description |
|---|---|---|---|
| *(none)* | -- | -- | Takes an empty object `{}` |

**Returns:**

```json
{
  "flowVariables": [
    {
      "name": "user_name",
      "reference": "{{user_name}}",
      "titleVariant": null,
      "source": "question: \"Ask name\""
    },
    {
      "name": "preference",
      "reference": "{{preference}}",
      "titleVariant": "{{preference_title}}",
      "source": "quickReply: \"Choose option\""
    }
  ],
  "systemVariables": [
    { "name": "system.contact_name", "reference": "{{system.contact_name}}", "description": "Contact display name" },
    { "name": "system.phone_number", "reference": "{{system.phone_number}}", "description": "Contact phone number" }
  ],
  "globalVariables": "(use {{global.variable_name}} syntax -- available variables depend on org settings)",
  "usage": {
    "textInput": "{{variable_name}} -- the raw response",
    "buttonSelection": "{{variable_name}} -- internal ID, {{variable_name_title}} -- display text",
    "system": "{{system.variable_name}} -- always available",
    "global": "{{global.variable_name}} -- org-wide settings",
    "crossFlow": "{{flow.slug.variable_name}} -- from another flow"
  }
}
```

**Example use case:** After adding a new question node with `storeAs: "age"`, call `list_variables` to confirm `{{age}}` is now available for use in subsequent nodes.

---

#### `save_as_template`

Save the current flow as a reusable template. Call this when the user asks to save, convert, or make the flow into a template. Generates AI metadata (name, description, when to use) and returns it for user confirmation.

**Availability:** Always (edit mode)

| Parameter | Type | Required | Description |
|---|---|---|---|
| *(none)* | -- | -- | Takes an empty object `{}` |

**Returns on success:**

```json
{
  "success": true,
  "suggestedName": "Customer Feedback Survey",
  "description": "Collects customer satisfaction ratings and open-ended feedback",
  "whenToUse": "After a support interaction or purchase to gather feedback",
  "selectionRule": "Use when the user wants to collect customer opinions or ratings"
}
```

**Example use case:** User says "save this as a template" -- the assistant calls `save_as_template`, gets the suggested metadata, and shows it to the user for confirmation before saving.

---

### Flow Creation

#### `build_and_validate`

Build and validate a flow plan. Pass your complete flow plan as the argument. Returns validation results -- if issues are found, fix the plan and call again. Used in create mode only.

**Availability:** Always (create mode)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `message` | `string` | Yes | Summary of what this flow does |
| `steps` | `FlowStep[]` | Yes | The flow steps array |

`FlowStep` is a discriminated union:

**`NodeStep`:**

| Field | Type | Required | Description |
|---|---|---|---|
| `step` | `"node"` | Yes | Discriminator |
| `nodeType` | `string` | Yes | One of the valid base node types (see below) |
| `content` | `NodeContent` | No | Node data (same schema as edit mode) |
| `localId` | `string` | No | Temporary ID for referencing this node within the same plan |

**`BranchStep`:**

| Field | Type | Required | Description |
|---|---|---|---|
| `step` | `"branch"` | Yes | Discriminator |
| `buttonIndex` | `number` | Yes | Which button/choice to branch from (0-indexed) |
| `steps` | `NodeStep[]` | Yes | Nodes in this branch (no nested branches) |

**Valid base node types:** `question`, `quickReply`, `interactiveList`, `whatsappMessage`, `instagramDM`, `instagramStory`, `name`, `email`, `dob`, `address`, `condition`, `homeDelivery`, `trackingNotification`, `event`, `retailStore`, `flowTemplate`, `apiFetch`, `action`, `templateMessage`, `flowComplete`, `shopify`, `metaAudience`, `stripe`, `zapier`, `google`, `salesforce`, `mailchimp`, `twilio`, `slack`, `airtable`.

**Returns on success:**

```json
{
  "success": true,
  "summary": { "nodes": 5, "edges": 4 },
  "details": {
    "kind": "edit",
    "added": [
      { "type": "Quick Reply", "label": "Welcome" },
      { "type": "Question", "label": "Get name" }
    ],
    "removed": [],
    "updated": [],
    "edgesAdded": 4,
    "edgesRemoved": 0
  },
  "message": "Flow built and validated successfully. No issues found."
}
```

**Returns with issues:**

```json
{
  "success": false,
  "issueCount": 1,
  "issues": "1. [orphan] (node: plan-question-2-abc): Node has no incoming edges",
  "message": "Found 1 issue(s). Fix them and call build_and_validate again with the corrected plan."
}
```

**Example use case:** User says "build me a customer onboarding flow that asks for name, email, and phone" -- the assistant constructs the plan JSON and calls `build_and_validate`.

---

### Templates

#### `list_approved_templates`

List the authenticated user's Meta-approved WhatsApp templates. Call this before placing a `templateMessage` node. Returns each template's id, name, body, extracted variables, buttons, category, and language. Never invent template names -- always call this first.

**Availability:** WhatsApp platform + Authenticated (`apiUrl` + `authHeader` + `platform === "whatsapp"`)

| Parameter | Type | Required | Description |
|---|---|---|---|
| *(none)* | -- | -- | Takes an empty object `{}` |

**Returns on success:**

```json
{
  "success": true,
  "count": 3,
  "templates": [
    {
      "id": "tmpl-abc123",
      "name": "order_confirmation",
      "displayName": "Order Confirmation",
      "language": "en",
      "category": "UTILITY",
      "headerType": "TEXT",
      "body": "Hi {{1}}, your order #{{2}} has been confirmed.",
      "variables": ["1", "2"],
      "buttons": [
        { "type": "url", "text": "Track Order", "url": "https://example.com/track/{{1}}" }
      ]
    }
  ]
}
```

**Example use case:** User says "send the order confirmation template" -- the assistant calls `list_approved_templates` to find the exact template name, body, and variable slots before creating a `templateMessage` node.

---

### Testing

#### `trigger_flow`

Trigger a test run of the published flow by sending it to a phone number via WhatsApp. Only use when the user asks to test the flow.

**Availability:** Published WhatsApp flow (`apiUrl` + `authHeader` + `publishedFlowId` + `platform === "whatsapp"`)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `phone_number` | `string` | Yes | Phone number in E.164 format (e.g. `"+919876543210"`) |
| `variables` | `Record<string, string>` | No | Template parameter values if the flow starts with a template message |

**Returns on success:**

```json
{
  "success": true,
  "message": "Flow sent to +919876543210"
}
```

**Returns on failure:**

```json
{
  "success": false,
  "error": "Cannot send: contact has an active session. The user needs to end it first or wait for it to expire."
}
```

**Example use case:** After editing a flow, user says "test it on my number" -- the assistant calls `trigger_flow` with their phone number.

---

### Lookup

#### `list_flows`

List published chatbot flows in this organization. Use this to find the flow ID when the user wants to broadcast a flow.

**Availability:** Authenticated (`apiUrl` + `authHeader`)

| Parameter | Type | Required | Description |
|---|---|---|---|
| *(none)* | -- | -- | Takes an empty object `{}` |

**Returns on success:**

```json
{
  "success": true,
  "flows": [
    { "id": "uuid-1", "name": "Welcome Flow", "status": "published", "account_name": "main-wa" },
    { "id": "uuid-2", "name": "Support Flow", "status": "published", "account_name": "main-wa" }
  ]
}
```

**Example use case:** User says "broadcast the welcome flow" -- the assistant calls `list_flows` to find the flow ID, then proceeds to campaign creation.

---

#### `list_accounts`

List WhatsApp accounts configured for this organization. Use this to find the account name when creating a campaign.

**Availability:** Authenticated (`apiUrl` + `authHeader`)

| Parameter | Type | Required | Description |
|---|---|---|---|
| *(none)* | -- | -- | Takes an empty object `{}` |

**Returns on success:**

```json
{
  "success": true,
  "accounts": [
    { "id": "acc-1", "name": "main-wa", "phone_number": "+14155551234", "status": "active" }
  ]
}
```

**Example use case:** Before creating a campaign, call this to find which WhatsApp account to send from.

---

#### `get_flow_variables`

Get the list of variables used by a published flow. Useful to understand what data a flow collects or requires before broadcasting it.

**Availability:** Authenticated (`apiUrl` + `authHeader`)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `flow_id` | `string` | Yes | UUID of the published flow |

**Returns on success:**

```json
{
  "success": true,
  "variables": ["user_name", "email", "preference"]
}
```

**Example use case:** Before broadcasting, check what variables the flow uses to determine if any template parameters need to be supplied.

---

### Broadcasting / Campaigns

All campaign tools require authentication (`apiUrl` + `authHeader`).

#### `preview_audience`

Preview how many contacts match a filter BEFORE creating a campaign. Always call this first and show the count to the user so they can verify the audience is correct before proceeding.

**Availability:** Authenticated

| Parameter | Type | Required | Description |
|---|---|---|---|
| `source` | `"contacts"` | Yes | Audience source type (currently only `"contacts"`) |
| `filter` | `object` | No | Contact filter (see filter schema below) |
| `search` | `string` | No | Free-text search |
| `channel` | `string` | No | Channel filter |

**Filter object:**

| Field | Type | Description |
|---|---|---|
| `type` | `"tag" \| "flow" \| "variable"` | Filter type for leaf conditions |
| `op` | `string` | Operator: `"is"`, `"is_not"` for tags; `"active"`, `"any"`, `"never"` for flows; `"is"`, `"is_not"`, `"contains"`, `"has_any_value"`, `"is_unknown"` for variables |
| `values` | `string[]` | Tag names for tag filters (e.g. `["delhi", "mumbai"]`) |
| `value` | `string` | Value for variable filters |
| `flow_slug` | `string` | Flow slug for flow/variable filters |
| `name` | `string` | Variable name for variable filters |
| `logic` | `"and" \| "or"` | Group logic for combining multiple filters |
| `filters` | `any[]` | Nested filter conditions when using groups |

**Returns on success:**

```json
{
  "success": true,
  "total_count": 142,
  "audience_type": "contacts"
}
```

**Example use case:** User says "send the welcome flow to all contacts tagged 'new-lead'" -- call `preview_audience` with `{ source: "contacts", filter: { type: "tag", op: "is", values: ["new-lead"] } }` to show them the count before creating the campaign.

---

#### `create_campaign`

Create a draft broadcast campaign. Does NOT start sending. Always confirm details with user first.

**Availability:** Authenticated

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Campaign name |
| `flow_id` | `string` | Yes | ID of the flow to broadcast |
| `account_name` | `string` | Yes | WhatsApp account name to send from |
| `audience_source` | `"contacts"` | Yes | Audience source type |
| `audience_config` | `object` | Yes | Audience configuration (see below) |

**`audience_config` object:**

| Field | Type | Required | Description |
|---|---|---|---|
| `filter` | `object` | No | Contact filter (same format as `preview_audience`) |
| `search` | `string` | No | Free-text search to match contacts by name or phone |
| `channel` | `string` | No | Channel filter (e.g. `"whatsapp"`) |

**Returns on success:**

```json
{
  "success": true,
  "campaign_id": "camp-uuid-123",
  "name": "Welcome Campaign",
  "status": "draft",
  "total_recipients": 142
}
```

**Example use case:** After confirming audience count with `preview_audience`, create the campaign in draft state so the user can review before starting.

---

#### `start_campaign`

Start sending a draft campaign. Only call after the user explicitly confirms.

**Availability:** Authenticated

| Parameter | Type | Required | Description |
|---|---|---|---|
| `campaign_id` | `string` | Yes | ID of the campaign to start |

**Returns on success:**

```json
{
  "success": true,
  "status": "processing",
  "message": "Campaign started"
}
```

**Example use case:** User reviews the draft campaign and says "go ahead" -- call `start_campaign` to begin sending.

---

#### `get_campaign_status`

Get current status and progress of a campaign.

**Availability:** Authenticated

| Parameter | Type | Required | Description |
|---|---|---|---|
| `campaign_id` | `string` | Yes | ID of the campaign to check |

**Returns on success:**

```json
{
  "success": true,
  "campaign_id": "camp-uuid-123",
  "name": "Welcome Campaign",
  "status": "processing",
  "total_recipients": 142,
  "recipients_completed": 87,
  "sent_count": 87,
  "delivered_count": 82,
  "read_count": 45,
  "failed_count": 5,
  "started_at": "2026-04-16T10:30:00Z",
  "completed_at": null
}
```

**Example use case:** User asks "how's the campaign going?" -- call `get_campaign_status` to show delivery progress.

---

#### `list_campaigns`

List recent broadcast campaigns. Optionally filter by status.

**Availability:** Authenticated

| Parameter | Type | Required | Description |
|---|---|---|---|
| `status` | `"draft" \| "processing" \| "completed" \| "paused" \| "cancelled"` | No | Filter by campaign status |

**Returns on success:**

```json
{
  "success": true,
  "campaigns": [
    { "id": "camp-1", "name": "Welcome Campaign", "status": "completed", "total_recipients": 142 }
  ],
  "total": 1
}
```

**Example use case:** User asks "show me my campaigns" or "any campaigns running?" -- call `list_campaigns` with or without a status filter.

---

#### `pause_campaign`

Pause a running campaign. Confirm with user first.

**Availability:** Authenticated

| Parameter | Type | Required | Description |
|---|---|---|---|
| `campaign_id` | `string` | Yes | ID of the campaign to pause |

**Returns on success:**

```json
{
  "success": true,
  "status": "paused",
  "message": "Campaign paused"
}
```

**Example use case:** User says "pause the welcome campaign" -- call `pause_campaign` after confirming.

---

#### `cancel_campaign`

Cancel a campaign permanently. Confirm with user first.

**Availability:** Authenticated

| Parameter | Type | Required | Description |
|---|---|---|---|
| `campaign_id` | `string` | Yes | ID of the campaign to cancel |

**Returns on success:**

```json
{
  "success": true,
  "status": "cancelled",
  "message": "Campaign cancelled"
}
```

**Example use case:** User says "cancel the campaign, something's wrong" -- confirm with user, then call `cancel_campaign`.

---

## Workflow Examples

### 1. Edit and test a flow

A user says: "Change the welcome message to say 'Hello!' and add a question asking for their name, then test it."

```
1. get_node_details({ nodeId: "welcome-msg-1" })
   -- Get current node data and handle IDs

2. get_node_connections({ nodeId: "welcome-msg-1" })
   -- See what's connected downstream

3. apply_edit({
     message: "Update welcome text and add name question",
     nodeUpdates: [{
       nodeId: "welcome-msg-1",
       content: { text: "Hello!" }
     }],
     chains: [{
       attachTo: "welcome-msg-1",
       steps: [{ step: "node", nodeType: "question", content: { question: "What is your name?", storeAs: "user_name" } }]
     }]
   })
   -- Apply all changes in one call

4. validate_result({})
   -- Confirm no structural issues

5. trigger_flow({ phone_number: "+919876543210" })
   -- Send test to user's phone
```

### 2. Broadcast a flow to tagged contacts

A user says: "Send the feedback survey to all contacts tagged 'recent-purchase'."

```
1. list_flows({})
   -- Find the flow ID for "feedback survey"

2. list_accounts({})
   -- Find the WhatsApp account name

3. preview_audience({
     source: "contacts",
     filter: { type: "tag", op: "is", values: ["recent-purchase"] }
   })
   -- Show user how many contacts match (e.g. 85)

4. [Wait for user confirmation: "Yes, send to 85 contacts"]

5. create_campaign({
     name: "Feedback Survey - Recent Purchases",
     flow_id: "uuid-of-feedback-flow",
     account_name: "main-wa",
     audience_source: "contacts",
     audience_config: {
       filter: { type: "tag", op: "is", values: ["recent-purchase"] }
     }
   })
   -- Creates draft campaign

6. [Wait for user confirmation: "Looks good, start it"]

7. start_campaign({ campaign_id: "camp-uuid-123" })
   -- Begin sending

8. get_campaign_status({ campaign_id: "camp-uuid-123" })
   -- Check progress when user asks
```

### 3. Create a new flow from scratch

A user says: "Build me a flow that asks for name and email, then shows a confirmation."

```
1. build_and_validate({
     message: "Collect name and email with confirmation",
     steps: [
       { step: "node", nodeType: "question", content: { question: "What is your name?", storeAs: "name" } },
       { step: "node", nodeType: "question", content: { question: "What is your email?", storeAs: "email" } },
       { step: "node", nodeType: "whatsappMessage", content: { text: "Thanks {{name}}! We'll reach you at {{email}}." } }
     ]
   })
   -- Build and validate in one shot; if issues found, fix and retry
```

### 4. Create a flow with a WhatsApp template

A user says: "Start the flow with the order_confirmation template."

```
1. list_approved_templates({})
   -- Find the template name, variables, and buttons

2. build_and_validate({
     message: "Order confirmation flow starting with template",
     steps: [
       {
         step: "node",
         nodeType: "templateMessage",
         content: {
           templateName: "order_confirmation",
           language: "en",
           category: "UTILITY",
           bodyPreview: "Hi {{1}}, your order #{{2}} has been confirmed.",
           parameterMappings: [
             { templateVar: "1", flowValue: "{{system.contact_name}}" },
             { templateVar: "2", flowValue: "{{order_id}}" }
           ]
         }
       },
       { step: "node", nodeType: "flowComplete", content: {} }
     ]
   })
```

### 5. Save current flow as a template

A user says: "Save this as a template."

```
1. save_as_template({})
   -- Generates suggested name, description, and AI metadata

2. [Show user the suggested metadata for confirmation]

3. [On confirmation, the frontend saves the template with the metadata]
```
