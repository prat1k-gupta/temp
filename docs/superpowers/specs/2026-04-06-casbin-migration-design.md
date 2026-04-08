# Casbin Migration Design — Replace Custom RBAC with Casbin

## Overview

Migrate from our custom RBAC implementation (PathFeatureMap, HasFeature, GetRoleFeatures, org_role_permissions table) to Apache Casbin with GORM adapter. The frontend stays unchanged — only the backend enforcement layer is replaced.

**Goals:**
- Standardize on an industry-standard authorization library (18k GitHub stars, Apache project, since 2017)
- Enable resource-level permissions for flow sharing (`e.Enforce(userID, orgID, flowID, "edit")`)
- Make RBAC understandable to any developer who Googles "Casbin RBAC"
- Support action-level permissions from day 1 via the model config
- Enable custom role creation from the UI

## Decisions Made

| Decision | Choice | Why |
|----------|--------|-----|
| Library | Casbin (not OpenFGA, Cerbos) | Embedded Go library, GORM adapter for PostgreSQL, RBAC with domains for multi-tenant, 18k stars |
| Enforcer type | `casbin.NewSyncedEnforcer` | Thread-safe for concurrent Enforce() + AddPolicy(). Critical under load. |
| Resource naming | Flat (`teams`, `users`, `flows`) | No `settings.` prefix — that's a UI grouping concept, not a permission concept. Group is metadata in FeatureRegistry. |
| Route gating | `withRBAC(resource, handler)` wrapper per route | No global PathResourceMap. Resource declared at the route. No prefix matching. |
| Frontend changes | None (except AuthProvider URL) | Frontend just needs a feature list |
| Casbin table | `casbin_rule` (Casbin owns the data) | One system, no sync between tables |
| Action support | Include action field from day 1 (`*` for module-level) | No model change needed for action-level |
| Policy caching | Casbin's in-memory (load all on startup) | Under 15MB even at 1000 orgs |
| Cache invalidation | `AddPolicy()`/`RemovePolicy()` updates memory + DB atomically | Single instance. Multi-instance: PostgreSQL watcher. |
| Default behavior | Default-deny | No matching policy = denied |
| Role assignments | Keep role on `users` table + JWT | Casbin `g` rules for per-user resource permissions later |
| Business logic | Stay in handlers | Data scoping and validation are not permission checks |
| Superadmin | Not implemented | No platform-level bypass. All access is tenant-scoped. |
| Migration rollback | Feature flag + dual tables for 1-2 sprints | Concrete verification checklist before dropping old table. |
| Custom roles | Supported from day 1 | Just new policy rows — no code change needed. UI addition for role creation. |

---

## Casbin Model Configuration

Saved as `config/rbac_model.conf`:

```ini
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && r.obj == p.obj && (p.act == "*" || r.act == p.act)
```

**Fields:**
- `sub` = role or user ID (e.g., `"manager"`, `"user_abc123"`, `"flow-designer"`)
- `dom` = org ID (e.g., `"org_123"`)
- `obj` = resource (e.g., `"flows"`, `"users"`, `"flow_456"`)
- `act` = action (e.g., `"*"`, `"GET"`, `"POST"`, `"DELETE"`)

**Default-deny:** `e = some(where (p.eft == allow))` means no matching policy = denied.

**Day 1 policies (module-level):**
```
p, admin, org_123, flows, *
p, admin, org_123, users, *
p, admin, org_123, teams, *
p, admin, org_123, api-keys, *
p, manager, org_123, flows, *
p, manager, org_123, teams, *
p, manager, org_123, users, GET
p, manager, org_123, chat, *
p, agent, org_123, chat, *
p, agent, org_123, contacts, *
```

Note: manager gets `users, GET` (read-only for Teams page user list) but not `users, *`.

**Action-level (change `*` to specific methods):**
```
p, manager, org_123, flows, GET
p, manager, org_123, flows, POST
# no DELETE rule = can't delete
```

**Custom roles (just new policy rows):**
```
p, flow-designer, org_123, flows, *
p, flow-designer, org_123, templates, GET
```

**Resource-level (flow sharing):**
```
p, user_bob_id, org_123, flow_456, edit
p, user_bob_id, org_123, flow_456, read
```

No model change needed for any of these — just different policy rows.

---

## Route Gating with `withRBAC` Wrapper

No global middleware map. Each route declares its own resource:

```go
func withRBAC(resource string, handler FastRequestHandler) FastRequestHandler {
    return func(r *Request) error {
        role, _ := r.RequestCtx.UserValue("role").(models.Role)
        orgID, _ := r.RequestCtx.UserValue("organization_id").(uuid.UUID)
        method := string(r.RequestCtx.Method())

        allowed, err := enforcer.Enforce(string(role), orgID.String(), resource, method)
        if err != nil || !allowed {
            return r.SendErrorEnvelope(403, "Access denied", nil, "")
        }
        return handler(r)
    }
}

// Route registration — resource is right where the route is defined
g.GET("/api/teams", withRBAC("teams", app.ListTeams))
g.POST("/api/teams", withRBAC("teams", app.CreateTeam))
g.DELETE("/api/teams/{id}", withRBAC("teams", app.DeleteTeam))

g.GET("/api/users", withRBAC("users", app.ListUsers))
g.POST("/api/users", withRBAC("users", app.CreateUser))

g.GET("/api/flows", withRBAC("flows", app.ListFlows))
g.POST("/api/flows", withRBAC("flows", app.CreateFlow))

// Ungated routes — no wrapper
g.GET("/api/me", app.GetCurrentUser)
g.GET("/api/settings/features", app.GetFeatures)
g.GET("/api/auth/permissions", app.GetUserPermissions)
```

**Developer adding a new route:** just add `withRBAC("resource", handler)`. No separate map file to update.

---

## FeatureRegistry

Single source of truth for all features. Resources use flat names, `Group` is UI-only metadata:

```go
type FeatureDefinition struct {
    Key   string `json:"key"`
    Label string `json:"label"`
    Group string `json:"group"` // "main" or "settings" — for frontend sidebar grouping
}

var FeatureRegistry = []FeatureDefinition{
    {Key: "flows", Label: "Flows", Group: "main"},
    {Key: "templates", Label: "WhatsApp Templates", Group: "main"},
    {Key: "chat", Label: "Chat", Group: "main"},
    {Key: "campaigns", Label: "Campaigns", Group: "main"},
    {Key: "contacts", Label: "Contacts", Group: "main"},
    {Key: "analytics", Label: "Analytics", Group: "main"},
    {Key: "accounts", Label: "Accounts", Group: "settings"},
    {Key: "users", Label: "User Management", Group: "settings"},
    {Key: "teams", Label: "Teams", Group: "settings"},
    {Key: "chatbot", Label: "Chatbot Settings", Group: "settings"},
    {Key: "api-keys", Label: "API Keys", Group: "settings"},
}

var DefaultRoleFeatures = map[string][]string{
    "admin":   {"flows", "templates", "chat", "campaigns", "contacts", "analytics",
                "accounts", "users", "teams", "chatbot", "api-keys"},
    "manager": {"flows", "templates", "chat", "campaigns", "contacts", "analytics",
                "accounts", "teams", "chatbot"},
    "agent":   {"chat", "contacts"},
}
```

---

## Database

**`casbin_rule` table (auto-created by GORM adapter, custom struct for audit):**

```go
type CasbinRule struct {
    ID        uint      `gorm:"primaryKey;autoIncrement"`
    Ptype     string    `gorm:"size:100"`
    V0        string    `gorm:"size:100"` // sub (role)
    V1        string    `gorm:"size:100"` // dom (orgID)
    V2        string    `gorm:"size:100"` // obj (resource)
    V3        string    `gorm:"size:100"` // act (action)
    V4        string    `gorm:"size:100"`
    V5        string    `gorm:"size:100"`
    CreatedAt time.Time `gorm:"autoCreateTime"`
}
```

**Migration from `org_role_permissions`:**

`{ org: "org_123", role: "manager", features: ["flows", "chat"] }` becomes:
```
p, manager, org_123, flows, *
p, manager, org_123, chat, *
```

Plus manager-specific read-only access:
```
p, manager, org_123, users, GET
```

---

## Migration Rollback Plan

1. **Phase 1:** Add Casbin + `casbin_rule` alongside `org_role_permissions`. Feature flag `RBAC_ENGINE=casbin|legacy`. Default: `legacy`.
2. **Phase 2:** Switch to `casbin` in dev/staging. Verification checklist:
   - All 3 roles in all test orgs return identical feature lists from both systems
   - Admin toggles on Roles page reflect in both endpoints
   - Middleware allows/denies same requests under both engines
3. **Phase 3:** `RBAC_ENGINE=casbin` in production. Monitor 1-2 sprints.
4. **Phase 4:** Drop `org_role_permissions`, remove legacy code, remove flag.

Rollback: flip flag to `legacy` — instant, no deploy needed.

---

## API Changes

**New endpoint:**

| Method | Endpoint | What it does |
|--------|----------|-------------|
| `GET` | `/api/auth/permissions` | Returns current user's features using `GetFilteredPolicy` (single in-memory lookup) |

```go
func (a *App) GetUserPermissions(r *Request) error {
    role := r.RequestCtx.UserValue("role").(models.Role)
    orgID := r.RequestCtx.UserValue("organization_id").(uuid.UUID)
    permissions := rbac.GetUserPermissions(a.Enforcer, string(role), orgID.String())
    return r.SendEnvelope(permissions)
}
```

**Modified endpoints (same URL, same response):**

| Endpoint | Change |
|----------|--------|
| `GET /api/settings/role-permissions` | Query `casbin_rule` via `GetFilteredPolicy`, group by role |
| `PUT /api/settings/role-permissions/{role}` | `RemoveFilteredPolicy()` + `AddPolicies()` |
| `GET /api/settings/features` | Returns `FeatureRegistry` (now with `Group` field) |

**Policy seeding (atomic):**
```go
enforcer.AddPolicies(policies) // batch insert, single transaction
```

---

## Frontend Changes

**AuthProvider — one URL change:**
```typescript
// Before
const { data: rolePermissions } = useQuery({
    queryKey: rolePermissionKeys.list(),
    queryFn: () => apiClient.get("/api/settings/role-permissions"),
})
const permissions = rolePermissions?.find(r => r.role === user?.role)?.features ?? []

// After
const { data: permissions = [] } = useQuery({
    queryKey: ["auth", "permissions"],
    queryFn: () => apiClient.get<string[]>("/api/auth/permissions"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
})
```

**Sidebar — use `group` from features API for section grouping:**
```typescript
// Features API now returns: { key: "teams", label: "Teams", group: "settings" }
// Sidebar uses group to decide if feature goes under Settings collapsible or main nav
```

**Roles page — use features API for the table (already does this).**

**Everything else stays identical:** `canAccess()`, `useAuth()`, `can()`, FeatureGate layouts.

---

## Custom Role Creation (UI)

The backend already supports custom roles — they're just policy rows. The UI needs:

1. **"Create Role" button** on Roles & Permissions page
2. **Dialog:** role name input + feature checkboxes (reuse existing table UI)
3. **Save:** calls `AddPolicies()` with the custom role name
4. **Table:** new column appears for the custom role
5. **Users page:** role dropdown shows custom roles from `GET /api/settings/role-permissions`
6. **Delete role:** `RemoveFilteredPolicy(0, roleName, orgID)` removes all policies for that role

No backend code changes needed for custom role support — just frontend UI.

---

## Multi-Instance Considerations

**Current:** Single instance. `AddPolicy()` updates memory + DB atomically. No issue.

**Future:** Use Casbin's [PostgreSQL watcher](https://github.com/IguteChung/casbin-psql-watcher) with `LISTEN/NOTIFY`:
```go
w, _ := psqlwatcher.NewWatcher("postgres://...", psqlwatcher.Option{})
enforcer.SetWatcher(w)
w.SetUpdateCallback(func(string) { enforcer.LoadPolicy() })
```

---

## What Gets Deleted / Created / Modified

**Deleted:**
- `internal/middleware/rbac.go` — all custom RBAC code
- `internal/models/org_role_permission.go` — custom model
- `org_role_permissions` table — after migration Phase 4

**Created:**
- `internal/rbac/rbac.go` — enforcer init, `withRBAC` wrapper, FeatureRegistry, DefaultRoleFeatures, GetUserPermissions
- `config/rbac_model.conf` — Casbin PERM model
- Migration script

**Modified:**
- `cmd/fs-chat/main.go` — init SyncedEnforcer, wrap routes with `withRBAC`
- `internal/handlers/role_permissions.go` — use AddPolicies/RemoveFilteredPolicy
- `internal/handlers/auth.go` — seed via AddPolicies (batch, atomic)
- `internal/database/postgres.go` — remove OrgRolePermission from migrations
- `magic-flow/contexts/auth-context.tsx` — fetch `/api/auth/permissions`
- `magic-flow/components/app-sidebar.tsx` — use `group` field for section grouping
- `magic-flow/lib/permissions.ts` — update feature names (remove `settings.` prefix)

**Untouched:**
- FeatureGate layouts (update `feature` prop to flat names)
- `canAccess()` function
- `useAuth()` hook
- All business logic in handlers
- Redis (non-RBAC usage)

---

## Business Logic — Stays in Handlers

| Check | File | Why |
|-------|------|-----|
| Agent sees only assigned contacts | `contacts.go` | Data scoping |
| Agent sees only own analytics | `agent_analytics.go` | Data scoping |
| Agent sees own transfers, manager sees team | `agent_transfers.go` | Data scoping |
| Can't demote yourself | `users.go` | Validation |
| Can't delete last admin | `users.go` | Validation |
| Validate role values | `users.go` | Input validation |

---

## Future: Flow Sharing

Same model, same `Enforce()`:

```go
// Share
enforcer.AddPolicy(userID, orgID, "flow_"+flowID, "edit")

// Check
enforcer.Enforce(userID, orgID, "flow_"+flowID, "edit")  // true/false
```

---

## Developer Guide — Adding a New Feature

1. Add to `FeatureRegistry` in `internal/rbac/rbac.go` (key + label + group)
2. Add `withRBAC("feature", handler)` to route registration
3. Add to `DefaultRoleFeatures` for roles that should have it
4. Seed existing orgs: `enforcer.AddPolicies(...)` for each org
5. Frontend: add FeatureGate layout
6. Frontend: add to sidebar with feature field

**Action-level:** No code change. Change policy from `feature, *` to `feature, GET` / `feature, POST`.

**Custom roles:** No code change. Add policies with the custom role name.

**Resource-level:** Use `CanAccessResource` helper in the handler:

```go
// internal/rbac/rbac.go
func (a *App) CanAccessResource(r *Request, resourceType, resourceID, action string) bool {
    userID := r.RequestCtx.UserValue("user_id").(string)
    orgID := r.RequestCtx.UserValue("organization_id").(uuid.UUID)
    orgIDStr := orgID.String()

    // Check resource-level first (flow_123, edit)
    allowed, _ := a.Enforcer.Enforce(userID, orgIDStr, resourceType+"_"+resourceID, action)
    if allowed {
        return true
    }

    // Fallback to module-level (flows, *)
    role := r.RequestCtx.UserValue("role").(models.Role)
    allowed, _ = a.Enforcer.Enforce(string(role), orgIDStr, resourceType+"s", action)
    return allowed
}

// Handler usage
func (a *App) UpdateFlow(r *Request) error {
    flowID := r.RequestCtx.UserValue("id").(string)

    if !a.CanAccessResource(r, "flow", flowID, "edit") {
        return r.SendErrorEnvelope(403, "No access to this flow", nil, "")
    }
    // ...
}
```

Two-level check: resource-specific policy (`flow_456, edit`) wins first, then falls back to module-level (`flows, *`). Users with module access can edit any flow. Users with only a shared flow policy can edit just that flow.
