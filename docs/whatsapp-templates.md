# WhatsApp Templates — How They Work in Magic-Flow + fs-chat

## Overview

WhatsApp templates are pre-approved message formats required by Meta for sending messages outside the 24-hour customer service window. They support dynamic variables that get filled with real data at send time.

## Template Lifecycle

```
Template Builder (magic-flow)
  ↓ Create template with {{named_variables}}
  ↓ Provide sample values for Meta review
fs-chat API
  ↓ Submits to Meta with parameter_format: "NAMED"
Meta Review
  ↓ Approves/rejects template
Flow Builder (magic-flow)
  ↓ User drags template message node into flow
  ↓ Selects approved template
  ↓ Parameter mappings auto-populated
Publish (magic-flow → fs-chat)
  ↓ Converter emits body_parameters with {{variable}} refs
Runtime (fs-chat)
  ↓ Resolves variables from session data
  ↓ Sends to Meta WhatsApp API
User's WhatsApp
  ↓ Receives the message with filled values
```

## Variable Types in Templates

| Syntax | Type | Example | Color in editor |
|--------|------|---------|----------------|
| `{{user_name}}` | Session variable | Stored via `storeAs` or passed via API | Indigo |
| `{{global.company}}` | Global variable | Set in Chatbot Settings | Green |
| `{{flow.onboarding.name}}` | Cross-flow variable | From another flow's session | Purple |

## Component Variable Support (Meta Rules)

| Component | Variables? | Limit | Example |
|-----------|-----------|-------|---------|
| **Header (TEXT)** | Yes | 1 variable max | `Order update for {{customer_name}}` |
| **Body** | Yes | Unlimited | `Hi {{first_name}}, your order {{order_id}} is ready` |
| **Footer** | No | — | Static text only |
| **URL Button** | Yes (suffix) | 1 variable | `https://example.com/track/{{order_id}}` (submitted as `{{1}}` to Meta, named internally) |
| **Quick Reply** | No | — | Static button text |
| **Phone Button** | No | — | Static phone number |

## Named vs Positional Parameters

### Named (recommended)
```
Body: "Hi {{first_name}} {{last_name}}"
```
- `parameter_format: "NAMED"` sent to Meta during template creation
- At send time, each param includes `parameter_name` — order doesn't matter
- Variable name = session data key — auto-resolves without manual mapping
- fs-chat detects named params automatically via `hasNamedParams()`

### Positional (legacy)
```
Body: "Hi {{1}} {{2}}"
```
- No `parameter_format` field — Meta matches by array position
- Requires explicit `body_parameters` in flow step — no auto-resolve
- Fragile: adding a param shifts all positions

## Data Flow — Template Creation

### 1. User creates template in magic-flow Template Builder

The `VariablePickerTextarea` provides pill-style editing. Variables render as colored pills.

### 2. magic-flow sends to fs-chat

```
POST /api/templates
{
  "name": "order_confirmation",
  "body_content": "Hi {{customer_name}}, order {{order_id}} is confirmed",
  "sample_values": [
    { "component": "body", "param_name": "customer_name", "value": "John" },
    { "component": "body", "param_name": "order_id", "value": "ORD-123" }
  ]
}
```

For positional templates, `param_name` is replaced with `index`:
```json
{ "component": "body", "index": 1, "value": "John" }
```

### 3. fs-chat submits to Meta

```
POST https://graph.facebook.com/v21.0/{waba_id}/message_templates
{
  "name": "order_confirmation",
  "language": "en",
  "category": "MARKETING",
  "parameter_format": "NAMED",
  "components": [
    {
      "type": "BODY",
      "text": "Hi {{customer_name}}, order {{order_id}} is confirmed",
      "example": {
        "body_text_named_params": [
          { "param_name": "customer_name", "example": "John" },
          { "param_name": "order_id", "example": "ORD-123" }
        ]
      }
    }
  ]
}
```

## Data Flow — Template Sending (Runtime)

### 1. Flow triggers via keyword or API

```
POST /api/chatbot/flows/{id}/send
{
  "phone_number": "919773722464",
  "variables": {
    "customer_name": "Pratik",
    "order_id": "ORD-456"
  }
}
```

### 2. fs-chat resolves parameters

The processor:
1. Looks up the template from DB for body content
2. Extracts param names: `["customer_name", "order_id"]`
3. Checks `body_parameters` from flow step — if present, resolves via `processTemplate()`
4. If `body_parameters` empty and template uses named params, resolves directly from session data by name
5. For header variables and URL button suffixes, resolves the same way

### 3. fs-chat sends to Meta WhatsApp API

```json
{
  "messaging_product": "whatsapp",
  "to": "919773722464",
  "type": "template",
  "template": {
    "name": "order_confirmation",
    "language": { "code": "en" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Pratik", "parameter_name": "customer_name" },
          { "type": "text", "text": "ORD-456", "parameter_name": "order_id" }
        ]
      }
    ]
  }
}
```

### 4. Chat display

The stored message shows the resolved text:
```
Hi Pratik, order ORD-456 is confirmed
```

If variables resolve to empty, the error message includes which ones:
```
failed to send: API error (...) (empty variables: customer_name, order_id)
```

If the template send fails entirely (e.g. missing URL button param), the chat shows a dedicated error bubble with the template name and full Meta API error — agents can debug without checking server logs.

### URL Button Dynamic Suffix

Meta always uses positional `{{1}}` for URL button suffixes, even when the template body uses named params. The flow is:

- **Template builder**: user types `https://example.com/{{order_id}}`
- **Submission to Meta**: fs-chat converts to `https://example.com/{{1}}` with example value
- **At send time**: fs-chat resolves `{{order_id}}` from session data and sends as the URL button parameter
- **User sees**: clickable button linking to `https://example.com/ORD-456`

## Flow Builder — Parameter Mappings

When a template is used in a flow via the template message node:

```
Parameter Mappings:
  customer_name  =  [empty]       → auto-resolves from session as {{customer_name}}
  order_id       =  {{api_order}} → maps template var to a different session var
```

- **Empty mapping**: defaults to `{{template_var_name}}` — works when session variable name matches
- **Explicit mapping**: maps to a different session variable (e.g. template uses `customer_name` but flow stores as `name`)

## Publish Validation

Template message nodes are **exempt** from the unknown variable validation. Their variables come from session data (API-passed or upstream nodes), not necessarily from `storeAs` in the current flow.

## Key Files

| File | Purpose |
|------|---------|
| `magic-flow/components/template-builder.tsx` | Template creation UI with pill editor |
| `magic-flow/components/template-preview.tsx` | WhatsApp phone mockup preview |
| `magic-flow/components/nodes/action/template-message-node.tsx` | Template node on flow canvas |
| `magic-flow/utils/whatsapp-converter.ts` | Forward/reverse conversion for template nodes |
| `magic-flow/app/templates/page.tsx` | Template list page, save/submit logic |
| `fs-chat/pkg/whatsapp/template.go` | Meta API submission (template creation) |
| `fs-chat/pkg/whatsapp/message.go` | Meta API sending (template messages) |
| `fs-chat/internal/handlers/chatbot_processor.go` | Runtime: param resolution, send, chat storage |
| `fs-chat/internal/handlers/messages.go` | `extractParamNamesFromContent`, `resolveParams`, `isAllNumeric` |
