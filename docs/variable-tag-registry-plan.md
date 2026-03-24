# Variable & Tag Registry — Implementation Plan

## Status: DRAFT (2026-03-24)

---

## Problem

1. **Free text inputs** for variable names (storeAs, response mapping, action node) allow typos and accidental renames
2. **Renaming a variable** at the originator node silently breaks all references (same flow + cross-flow)
3. **Old contact data** becomes orphaned — `contact_variables` rows keep the old name
4. **No originator tracking** — can't tell which node created a variable
5. **Tags** are raw JSONB strings on contacts — no registry, no campaign filtering
6. **Future APIs** (setContactVariable, getTag, campaign filters) need a registry

## Core Insight

Variables have two roles:
- **Originators** (write): storeAs, response mapping, action node — these CREATE variables
- **Consumers** (read): message body, API body, conditions, button text — these REFERENCE variables

The picker at originator nodes allows "Create new" + select existing. The picker at consumer nodes only allows selecting existing — no creation. This prevents orphan references.

---

## Schema

### `flow_variables`

```sql
CREATE TABLE flow_variables (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id         UUID NOT NULL REFERENCES chatbot_flows(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    source_node     VARCHAR(100),     -- node ID that created it
    source_type     VARCHAR(20),      -- "store_as" | "response_mapping" | "action"
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_flow_variables_flow_name UNIQUE (flow_id, name)
);

CREATE INDEX idx_flow_variables_flow ON flow_variables(flow_id);
```

- Scoped to **flow**, not org — Flow A and Flow B can both have `name`
- `source_node` tracks the originator node ID
- `source_type` tracks how the variable is created
- Cross-flow access uses existing `contact_variables` table (keyed by `flow_slug + variable_name`)

### `tags` (org-wide)

```sql
CREATE TABLE tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    color           VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_tags_org_name UNIQUE (organization_id, name)
);
```

### `contact_tags` (junction)

```sql
CREATE TABLE contact_tags (
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tag_id     UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (contact_id, tag_id)
);
```

### Existing tables — NO changes

- `contact_variables` — keeps `(contact_id, flow_slug, variable_name)` composite key
- `chatbot_flow_steps.store_as` — still stores the variable name string
- `chatbot_sessions.session_data` — still uses variable name as flat map keys
- `contacts.tags` — kept during dual-write transition period

---

## Smart Rename Dialog

When a user changes a variable name at an originator node (storeAs, response mapping, action node), the system checks the impact and shows the appropriate dialog:

### Case A — No data, no cross-flow references

```
Renaming "name" → "user_name"
Updated 3 references in this flow. ✓
```

Just a toast. Auto-rename within the flow. Zero risk.

### Case B — No data, has cross-flow references

```
Renaming "name" → "user_name"

Used in other flows: Flow B, Flow C

  [Rename Everywhere]  — Updates all flow references.
  [Only This Flow]     — Other flows keep using "name".
  [Cancel]
```

No data warning needed. Safe either way.

### Case C — Has data, no cross-flow references

```
Renaming "name" → "user_name"

⚠ 500 contacts have saved data under "name"
  which will no longer be accessible.

  [Rename]   [Cancel]
```

### Case D — Has data AND cross-flow references

```
Renaming "name" → "user_name"

Used in other flows: Flow B, Flow C
⚠ 500 contacts have saved data under "name"
  which will no longer be accessible.

  [Rename Everywhere]  [Only This Flow]  [Cancel]
```

### What each action does

**Rename Everywhere:**
1. Calls `PUT /api/flow-variables/{id}/rename` with `{new_name: "user_name"}`
2. Backend runs in a **single database transaction**:
   - Updates `flow_variables` row: `name = "user_name"`
   - Scans all `chatbot_flow_steps` in all flows that reference `{{name}}` or `{{flow.slug.name}}` in message, body, api_config, input_config fields — replaces with new name
   - If ANY step update fails → entire transaction rolls back → nothing changes
3. Frontend receives success → updates local node data
4. Does NOT migrate `contact_variables` — old data stays as `name`, user is warned

**Critical: all-or-nothing transaction.** Either every reference across every flow is updated, or none are. No partial renames. The backend does the heavy lifting — frontend just calls one API and gets success or failure.

**Only This Flow:**
1. Changes storeAs to `user_name` (new flow_variables row)
2. Updates `{{name}}` → `{{user_name}}` within this flow only (frontend-only, no backend call needed)
3. Other flows keep `{{flow.flow_a_slug.name}}` — still works for old contacts

**Cancel:** No changes.

---

## Variable Picker Behavior

### Originator nodes (write mode)

Used at: storeAs, action node variable name, response mapping variable name

- Shows existing flow variables from `flow_variables` table
- Fuzzy search
- **"Create new"** option at bottom → creates `flow_variables` row
- Stores `variable name` string in node data (same format as today)
- **No free text** — must pick or create

### Consumer nodes (read mode)

Used at: message body, API body, conditions, template params

- `{{` trigger opens existing variable picker (unchanged)
- Shows: Flow variables, Global, Cross-flow, System tabs
- Flow tab merges `flow_variables` registry + node-scanned variables
- **No "Create new"** — can only reference existing variables
- Existing Lexical pill system unchanged

---

## Impact Check API

```
GET /api/flow-variables/{id}/usage
```

Response:
```json
{
  "variable": {"id": "uuid", "name": "name", "flow_id": "uuid"},
  "same_flow_references": 3,
  "cross_flow_references": [
    {"flow_id": "uuid", "flow_name": "Follow-up", "reference_count": 2}
  ],
  "contact_data_count": 500
}
```

This is what powers the smart rename dialog — one API call to determine which case (A/B/C/D) to show.

---

## Go Backend

### New endpoints

```
GET    /api/flow-variables?flow_id=     → List variables for a flow
POST   /api/flow-variables              → Create {flow_id, name, source_node, source_type}
PUT    /api/flow-variables/{id}         → Rename {name} (triggers impact check)
DELETE /api/flow-variables/{id}         → Delete (with usage warning)
GET    /api/flow-variables/{id}/usage   → Impact check for rename dialog

GET    /api/tags                        → List org tags
POST   /api/tags                        → Create {name, color}
PUT    /api/tags/{id}                   → Update {name, color}
DELETE /api/tags/{id}                   → Delete (cascades contact_tags)

GET    /api/contacts/{id}/tags          → List contact's tags
POST   /api/contacts/{id}/tags          → Add tag
DELETE /api/contacts/{id}/tags/{tag_id} → Remove tag
```

### Runtime — NO changes

- `processTemplate()` — resolves by string path, no registry knowledge
- `saveContactVariable()` — upserts by `(contact_id, flow_slug, variable_name)`, variable_name is the name string
- `injectCrossFlowVariables()` — loads by flow_slug + variable_name pairs
- `template_engine.go` — zero changes

### Tag dual-write

During transition, action node tag handler:
1. Continues updating `contacts.tags` JSONBArray (current)
2. Also upserts into `tags` + `contact_tags` tables

---

## Frontend Changes

### New components

- `VariableSelect` — combobox for originator nodes (fetches from `/api/flow-variables?flow_id=`, fuzzy search, create new)
- `TagSelect` — combobox for tags (fetches from `/api/tags`, create new)
- `VariableImpactDialog` — impact dialog shown when variable name changes at originator

### Properties panel changes

| Location | Before | After |
|---|---|---|
| storeAs (question, quickReply, list) | `<Input>` free text | `<VariableSelect>` |
| Action node variable names | `<Input>` free text | `<VariableSelect>` |
| Response mapping variable names | `<Input>` free text | `<VariableSelect>` |
| Action node tags | `<Input>` free text | `<TagSelect>` |

### Files that DON'T change

- `template_engine.go` — runtime resolves by name string
- `whatsapp-converter.ts` — copies storeAs name to store_as
- `variable-mention-node.tsx` — stores variableRef as name string
- `variable-pill.tsx` — renders display name
- `variable-resolver.ts` — pattern matching unchanged

---

## Migration

### Seed flow_variables from existing flows

```sql
INSERT INTO flow_variables (flow_id, name, source_type)
SELECT DISTINCT f.id, s.store_as, 'store_as'
FROM chatbot_flow_steps s
JOIN chatbot_flows f ON s.flow_id = f.id
WHERE s.store_as IS NOT NULL AND s.store_as != ''
ON CONFLICT (flow_id, name) DO NOTHING;
```

Also scan `api_config.response_mapping` keys and `input_config.variables[].name` in Go.

### Seed tags from contacts.tags

Scan all contacts, extract unique tag strings, create `tags` rows + `contact_tags` junction rows.

### Backward compatibility

- Unregistered variables (from old flows) still work — runtime doesn't check registry
- VariableSelect shows unregistered values with amber indicator + "Register" action
- No existing flow breaks — registry is additive

---

## Phasing

| Phase | What | Depends on | Effort |
|---|---|---|---|
| **0** | Backend tables + CRUD + seed migration | Phase 2 (database) | 1-2 days |
| **1** | VariableSelect + TagSelect in properties panel | Phase 0 | 2-3 days |
| **2** | VariableImpactDialog + impact check API | Phase 1 | 2-3 days |
| **3** | Consumer picker enhancement (registry-backed Flow tab) | Phase 1 | 1-2 days |
| **4** | Tag migration (contact_tags junction, contact panel, filters) | Phase 0 | 2-3 days |
| **5** | Campaign filter APIs | Phase 4 | 3-5 days |
