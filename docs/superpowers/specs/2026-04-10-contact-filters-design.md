# Contact Filter Design Spec

**Date:** 2026-04-10
**Branch:** `feat/contact-filters`

## Goal

Add a cascader-based filter system to the chat contact list. Filter contacts by tags, flow membership, and flow variable values. The backend API is designed for reuse in contact management and broadcast targeting.

## Scope

- Cascader filter UI in chat sidebar
- Backend `POST /api/contacts/filter` endpoint
- Backend `GET /api/contacts/tags` endpoint
- Backend `GET /api/contacts/variables` endpoint
- New indexes for filter performance
- Frontend query hooks + filter state management

## Filter Types

### 1. Tag Filter

Filter contacts by tag presence.

**Cascader path:** `Tag ▸ is/isn't ▸ [select tag(s)]`

**Operators:**
- `is` — contact has this tag
- `isnt` — contact doesn't have this tag

**Multi-select:** user can pick multiple tags in one filter step. The API supports this via `values: string[]` on the filter object. Multiple tags in a single filter = OR (has any of these). Separate tag filter chips = AND.

**SQL:**
```sql
-- is (any of these tags)
tags @> ANY(ARRAY['["sampled"]', '["vip"]']::jsonb[])

-- isnt (none of these tags)
NOT (tags @> ANY(ARRAY['["sampled"]', '["vip"]']::jsonb[]))
```

**Required index:** GIN index on `contacts.tags` — without it, `@>` does a full table scan.
```sql
CREATE INDEX IF NOT EXISTS idx_contacts_tags_gin ON contacts USING GIN (tags)
```

**Tag list:** fetched from `GET /api/contacts/tags` (all unique tags in the org).

### 2. Flow Filter

Filter contacts by flow session membership.

**Cascader path:** `Flow ▸ is in/was in/isn't in ▸ [select flow]`

**Operators:**
- `is_in` — contact has an **active** chatbot session for this flow
- `was_in` — contact has **any** session (active or completed) for this flow (`current_flow_id` is preserved after session ends)
- `isnt_in` — contact has **no** session for this flow

**Flow list:** fetched from existing `GET /api/chatbot/flows` (returns name + slug). Cascader shows flow name as label, slug as description. The API accepts `flow_slug` — the handler resolves it to `chatbot_flows.id` for the session query.

**Important:** `chatbot_sessions` has `current_flow_id` (UUID FK to `chatbot_flows`), NOT `flow_slug`. All flow filter queries must JOIN through `chatbot_flows` to match by slug.

**SQL:**
```sql
-- is_in (active session)
EXISTS (
  SELECT 1 FROM chatbot_sessions cs
  JOIN chatbot_flows cf ON cs.current_flow_id = cf.id
  WHERE cs.contact_id = contacts.id
    AND cf.flow_slug = ?
    AND cs.status = 'active'
    AND cs.organization_id = contacts.organization_id
)

-- was_in (any session, active or completed)
EXISTS (
  SELECT 1 FROM chatbot_sessions cs
  JOIN chatbot_flows cf ON cs.current_flow_id = cf.id
  WHERE cs.contact_id = contacts.id
    AND cf.flow_slug = ?
    AND cs.organization_id = contacts.organization_id
)

-- isnt_in (no session for this flow)
NOT EXISTS (
  SELECT 1 FROM chatbot_sessions cs
  JOIN chatbot_flows cf ON cs.current_flow_id = cf.id
  WHERE cs.contact_id = contacts.id
    AND cf.flow_slug = ?
    AND cs.organization_id = contacts.organization_id
)
```

**Required index:**
```sql
CREATE INDEX IF NOT EXISTS idx_sessions_contact_flow ON chatbot_sessions(contact_id, current_flow_id, status)
```

### 3. Variable Filter

Filter contacts by persisted flow variable values from `contact_variables` table.

**Cascader path:** `Variable ▸ [flow] ▸ [variable name] ▸ [operator] ▸ [value]`

**Operators:**
- `is` — exact match
- `isnt` — not equal (includes contacts with no row for this variable)
- `has_any_value` — variable exists and is not empty
- `contains` — substring match (case-insensitive)
- `is_unknown` — variable not set or empty

**SQL:** Uses `EXISTS`/`NOT EXISTS` instead of `IN`/`NOT IN` for better performance and NULL safety:
```sql
-- is
EXISTS (
  SELECT 1 FROM contact_variables cv
  WHERE cv.contact_id = contacts.id AND cv.flow_slug = ? AND cv.variable_name = ? AND cv.value = ?
)

-- isnt (different value OR no row at all)
NOT EXISTS (
  SELECT 1 FROM contact_variables cv
  WHERE cv.contact_id = contacts.id AND cv.flow_slug = ? AND cv.variable_name = ? AND cv.value = ?
)

-- has_any_value
EXISTS (
  SELECT 1 FROM contact_variables cv
  WHERE cv.contact_id = contacts.id AND cv.flow_slug = ? AND cv.variable_name = ? AND cv.value != ''
)

-- contains (case-insensitive)
EXISTS (
  SELECT 1 FROM contact_variables cv
  WHERE cv.contact_id = contacts.id AND cv.flow_slug = ? AND cv.variable_name = ? AND cv.value ILIKE ?
)

-- is_unknown (no row or empty value)
NOT EXISTS (
  SELECT 1 FROM contact_variables cv
  WHERE cv.contact_id = contacts.id AND cv.flow_slug = ? AND cv.variable_name = ? AND cv.value != ''
)
```

**Existing index:** `idx_cv_lookup` on `(contact_id, flow_slug, variable_name)` covers all variable filter queries.

**Value input:** free text input. Shown for `is`, `isnt`, `contains`. Hidden for `has_any_value`, `is_unknown`.

## API Design

### POST /api/contacts/filter

Reusable across chat, contact management, and broadcasts. POST is used because filter payloads can be complex and exceed URL length limits. Trade-off: HTTP caching is not possible — acceptable for real-time chat, noted for future contact management where URL-serialized filters may be preferred.

**Request:**
```json
{
  "search": "pratik",
  "channel": "whatsapp",
  "filters": [
    {
      "type": "tag",
      "op": "is",
      "values": ["sampled", "vip"]
    },
    {
      "type": "tag",
      "op": "isnt",
      "values": ["blacklisted"]
    },
    {
      "type": "flow",
      "op": "is_in",
      "flow_slug": "registration-flow"
    },
    {
      "type": "variable",
      "flow_slug": "registration-flow",
      "name": "city",
      "op": "is",
      "value": "Mumbai"
    }
  ],
  "page": 1,
  "limit": 20,
  "sort": "last_message_at"
}
```

**Filter schema:**
```go
type ContactFilter struct {
    Type     string   `json:"type"`                // "tag", "flow", "variable"
    Op       string   `json:"op"`                  // operator
    Value    string   `json:"value,omitempty"`      // variable value
    Values   []string `json:"values,omitempty"`     // tag names (multi-select)
    FlowSlug string   `json:"flow_slug,omitempty"`  // for flow and variable filters
    Name     string   `json:"name,omitempty"`       // variable name
}
```

**Validation rules (return 400 if violated):**
- `type` must be `tag`, `flow`, or `variable`
- `tag` filter: `op` must be `is` or `isnt`, `values` must be non-empty
- `flow` filter: `op` must be `is_in`, `was_in`, or `isnt_in`, `flow_slug` must be non-empty
- `variable` filter: `op` must be `is`, `isnt`, `has_any_value`, `contains`, or `is_unknown`, `flow_slug` and `name` must be non-empty, `value` required for `is`/`isnt`/`contains`

**Sort whitelist:** `last_message_at` (default), `created_at`, `profile_name`. All DESC with NULLS LAST. Any other value → 400 error. Prevents SQL injection via column names.

**Empty filters:** `"filters": []` or omitted `filters` field behaves identically to existing `GET /api/contacts` — returns all contacts with search/channel/pagination applied.

**Filter combination:** All filters are AND — contact must match every filter.

**Access control:** Same as existing `GET /api/contacts` — agents see only assigned contacts, admins and managers see all. No team-scoping for managers (matches existing behavior).

**Phone masking:** Response respects org-level `ShouldMaskPhoneNumbers` setting, same as existing endpoint.

**Response:** Same shape as existing `GET /api/contacts`:
```json
{
  "status": "success",
  "data": {
    "contacts": [...],
    "total": 3,
    "page": 1,
    "limit": 20
  }
}
```

**Known limitations:**
- Offset-based pagination can skip/duplicate contacts when list changes between pages. Cursor-based pagination is a future improvement.
- Unread count is computed per-contact (N+1 queries). An `unread_count` column on contacts is a future optimization.

### GET /api/contacts/tags

Returns all unique tags across contacts in the org.

**Response:**
```json
{
  "status": "success",
  "data": {
    "tags": ["sampled", "region_north", "vip", "new_lead"]
  }
}
```

**SQL:**
```sql
SELECT DISTINCT jsonb_array_elements_text(tags) AS tag
FROM contacts
WHERE organization_id = ?
  AND tags IS NOT NULL
  AND tags != '[]'::jsonb
  AND jsonb_typeof(tags) = 'array'
ORDER BY tag
```

The `jsonb_typeof` guard prevents crashes on malformed JSONB values (non-array).

### GET /api/contacts/variables?flow_slug=registration-flow

Returns all unique variable names for a flow.

**Response:**
```json
{
  "status": "success",
  "data": {
    "variables": ["city", "name", "phone", "eligible"]
  }
}
```

**SQL:**
```sql
SELECT DISTINCT cv.variable_name
FROM contact_variables cv
JOIN contacts c ON cv.contact_id = c.id
WHERE c.organization_id = ? AND cv.flow_slug = ?
ORDER BY cv.variable_name
```

The JOIN to `contacts` is required for org-scoping since `contact_variables` has no `organization_id` column.

## Required Indexes

Add to `CreateIndexes()` in `internal/database/postgres.go`:

```sql
-- Tag filter performance (GIN for @> containment operator)
CREATE INDEX IF NOT EXISTS idx_contacts_tags_gin ON contacts USING GIN (tags)

-- Flow filter performance (session → flow lookup by contact)
CREATE INDEX IF NOT EXISTS idx_sessions_contact_flow ON chatbot_sessions(contact_id, current_flow_id, status)
```

Existing indexes that already cover our queries:
- `idx_cv_lookup` on `contact_variables(contact_id, flow_slug, variable_name)` — covers all variable filters
- `idx_contacts_org_phone` on `contacts(organization_id, phone_number)` — covers org-scoped queries

## UI Design

### Contact List Sidebar Layout

```
┌─────────────────────────────────────┐
│  🔍 Search contacts...              │
├─────────────────────────────────────┤
│  All  │  WhatsApp  │  Instagram     │
├─────────────────────────────────────┤
│  [⊕ Filter]                         │
│  ┌─────────────────────────────┐    │
│  │ Tag: is "sampled"        ✕  │    │  ← filter chips
│  │ Flow: is in "Registr.." ✕  │    │
│  │ Var: city is "Mumbai"    ✕  │    │
│  └─────────────────────────────┘    │
│  3 contacts matched                 │
├─────────────────────────────────────┤
│  Contact list...                    │
└─────────────────────────────────────┘
```

### Cascader Steps

**Step 1 — Pick filter type:**
```
┌──────────────┐
│  Tag         │ ▸
│  Flow        │ ▸
│  Variable    │ ▸
└──────────────┘
```

**Tag path:**
```
Tag ▸ is/isn't ▸ [searchable multi-select tag list from server]
```

**Flow path:**
```
Flow ▸ is in / was in / isn't in ▸ [searchable flow list — name as label, slug as description]
```

**Variable path:**
```
Variable ▸ [flow picker — name + slug] ▸ [variable name picker] ▸ [operator] ▸ [value input]
```

Value input step skipped for `has any value` and `is unknown` operators.

### Filter Chips

Each applied filter shows as a removable chip below the filter button:

- Tag: `Tag: is "sampled", "vip" ✕` (multi-select shown as comma-separated)
- Flow: `Flow: is in "Registration" ✕`
- Variable: `city is "Mumbai" ✕` (tooltip shows full: "registration-flow / city is Mumbai")

Clicking ✕ removes the filter and refetches contacts.

### State Management

Filter state lives in the contact list component (local state — filters are ephemeral like search). For future reuse in contact management and broadcasts, URL serialization should be added.

```ts
interface ContactFilter {
  type: "tag" | "flow" | "variable"
  op: string
  value?: string        // variable value
  values?: string[]     // tag names (multi-select)
  flowSlug?: string
  flowName?: string     // display only
  name?: string         // variable name
}

const [filters, setFilters] = useState<ContactFilter[]>([])
```

When `filters.length > 0`, the contact list switches from `GET /api/contacts` to `POST /api/contacts/filter`.

**Debouncing:** filter changes debounced at 300ms before firing the API call, same as search.

**Filter count badge:** the ⊕ Filter button shows a count badge when filters are active (e.g., `[⊕ Filter (3)]`).

## Files Changed

### Backend (fs-whatsapp):
- **Create:** `internal/handlers/contact_filters.go` — `FilterContacts`, `ListContactTags`, `ListContactVariables` handlers
- **Modify:** `cmd/fs-chat/main.go` — register 3 new routes
- **Modify:** `internal/database/postgres.go` — add GIN index on tags, composite index on sessions

### Frontend (magic-flow):
- **Create:** `components/chat/contact-list/contact-filter.tsx` — filter button + cascader + chips
- **Create:** `hooks/queries/use-contact-filters.ts` — `useContactTags`, `useContactVariables`, `useFilteredContacts` hooks
- **Modify:** `hooks/queries/query-keys.ts` — add filter query keys
- **Modify:** `components/chat/contact-list/contact-list.tsx` — integrate filter component, switch to POST when filters active
- **Modify:** `types/chat.ts` — add ContactFilter type

## Backend Routes Summary

| Method | Path | RBAC | Purpose |
|--------|------|------|---------|
| POST | `/api/contacts/filter` | contacts (prefix match) | Filter contacts with complex conditions |
| GET | `/api/contacts/tags` | contacts (prefix match) | List all unique tags in org |
| GET | `/api/contacts/variables?flow_slug=X` | contacts (prefix match) | List variable names for a flow |

All three paths are covered by the existing `/api/contacts` prefix in PathFeatureMap. No new RBAC entries needed.
