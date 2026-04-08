# RBAC Design — MagicFlow

## Overview

Add role-based access control to MagicFlow. The fs-whatsapp backend already has full RBAC (3 roles, middleware gating, JWT role claims). MagicFlow currently has zero enforcement — all pages and actions are accessible to everyone.

Built in two phases:
- **Phase A (frontend only):** AuthProvider, permission hooks, middleware route gating, sidebar filtering, button disabling. Hardcoded permission map mirroring backend rules.
- **Phase B (frontend + backend):** Org-level configurable permissions. New DB table, API endpoints, dynamic backend middleware, settings UI. Enables per-org customization of what each role can access, and future custom roles.

## Decisions Made

| Decision | Choice | Why |
|----------|--------|-----|
| Agents access flows? | No — chat + contacts only | Matches fs-whatsapp Vue frontend |
| User management | Admin-only | Matches backend, no backend changes needed |
| Permission model | Feature set per role, not hierarchy levels | Supports per-org overrides and future custom roles |
| Permission granularity | Module-level day 1, action-level ready | Module = all-or-nothing CRUD. Prefix matching (`can('flows')` grants `can('flows.publish')`) means action-level is additive, no rewrite |
| Auth data source | `GET /api/auth/me` on app load | Fresh role on every session, not stale localStorage. Industry standard (Auth0, NextAuth pattern). fs-whatsapp Vue app uses localStorage-only — we're improving on that. |
| Disabled vs hidden | Hide nav items, disable actions | Users see what exists but can't use it without the right role. Disabled buttons get tooltip explaining why. |
| Agent landing page | Redirect to `/profile` (safe for all roles) | `/flows` would cause infinite redirect since agents can't access it. `/chat` doesn't exist yet. `/profile` is accessible to all roles. Switch to `/chat` when chat ships. |
| Backend changes in Phase A | None | Backend already enforces RBAC. Phase A is purely frontend UX. |
| Extensibility model | Yellow.ai pattern — per-org feature toggles per role | More powerful than ManyChat/Gupshup/Freshchat (fixed roles only), simpler than Zendesk/Intercom (full custom roles). Custom roles are a future UI addition, not a system rewrite. |

## Competitor Research

| Platform | Roles | Custom Roles | Granular Permissions | Multi-Role |
|----------|-------|-------------|---------------------|------------|
| ManyChat | 4 fixed: Owner, Admin, Editor, Inbox Agent | No | No (only billing toggle) | No |
| Yellow.ai | ~6 fixed + per-module toggles | No | Yes — per-module | No |
| Gupshup | 3 fixed: Org Owner, Org Admin, Executive | No | No | No |
| Freshchat | 3 fixed: Admin, Manager, Agent | No | No | No |
| Intercom | 3 base + custom roles (enterprise) | Yes | Yes — per-feature | No |
| Zendesk | Base + fully custom roles (enterprise) | Yes | Very granular | Separate Chat vs Support roles |

**Our position:** Start where 80% of the market is (fixed hierarchical roles), ship with Yellow.ai-level extensibility (per-org feature toggles), leave the door open for Intercom-level custom roles.

---

## Phase A — Frontend RBAC (no backend changes)

### Permission System

```typescript
// lib/permissions.ts

type Role = 'admin' | 'manager' | 'agent'

const FEATURES = [
  'flows',
  'templates',
  'chat',
  'campaigns',
  'contacts',
  'analytics',
  'accounts',
  'users',
  'teams',
  'chatbot-settings',
  'api-keys',
] as const

type Feature = typeof FEATURES[number]

const DEFAULT_ROLE_FEATURES: Record<Role, Feature[]> = {
  admin: [
    'flows', 'templates', 'chat', 'campaigns', 'contacts', 'analytics',
    'accounts', 'users', 'teams',
    'chatbot-settings', 'api-keys',
  ],
  manager: [
    'flows', 'templates', 'chat', 'campaigns', 'contacts', 'analytics',
    'accounts', 'teams', 'chatbot-settings',
  ],
  agent: [
    'chat', 'contacts',
  ],
}
```

**`can()` function — pure function in `lib/permissions.ts`:**

```typescript
// lib/permissions.ts — pure function, importable for tests and non-React code
function canAccess(permissions: string[], feature: string): boolean {
  // Exact match: canAccess(perms, 'flows') checks for 'flows'
  if (permissions.includes(feature)) return true
  // Prefix match: canAccess(perms, 'flows.publish') passes if user has 'flows' (module-level grants all)
  const modulePrefix = feature.split('.')[0]
  return permissions.includes(modulePrefix)
}

// contexts/auth-context.tsx — useAuth() wraps it with user's permissions
const { can } = useAuth()  // can(feature) calls canAccess(userPermissions, feature)
```

`canAccess()` is the pure function in `lib/permissions.ts` (takes permissions array as first arg). `useAuth().can()` is the convenience wrapper that injects the user's permissions from context. Use `canAccess` in tests, middleware utilities, and non-React code. Use `can()` from `useAuth()` in components.

**Prefix matching rules:**
- `can('flows')` — checks module access
- `can('flows.publish')` — passes if user has `'flows'` (module-level) OR `'flows.publish'` (action-level)
- Adding action-level later: change role's features from `'flows'` to `['flows.view', 'flows.manage']` — the check function handles both without changes

**Prefix safety rule:** Only leaf-level features from the `FEATURES` list can be assigned to roles. The `FEATURES` array is the allowlist — anything not in it is rejected by validation in the Phase B settings UI and `PUT` endpoint.

### AuthProvider + useAuth Hook

```typescript
// contexts/auth-context.tsx

interface AuthContextValue {
  user: AuthUser | null
  role: Role
  permissions: string[]
  can: (feature: string) => boolean
  isLoading: boolean
  logout: () => void
}
```

**Data flow on app load:**

```
App mounts → AuthProvider checks localStorage for JWT token
  → token exists → calls GET /api/auth/me (fresh user data + role)
    → success → extracts role → sets permissions from DEFAULT_ROLE_FEATURES[role]
    → 401 → clears token, redirects to /login
  → no token → redirects to /login
```

Components never read localStorage directly. Everything goes through `useAuth()`.

**Unknown role fallback (deny-all):** If `user.role` is not in `DEFAULT_ROLE_FEATURES` (e.g., a custom role in Phase B when the API fetch fails), permissions default to an empty array `[]`. This is deny-all — the user sees nothing until the API responds with their actual permissions. Never `undefined`, never a crash.

```typescript
const permissions = DEFAULT_ROLE_FEATURES[user.role as Role] ?? []
```

**Phase B change:** The only thing that changes is where permissions come from. Instead of `DEFAULT_ROLE_FEATURES[role]`, AuthProvider fetches `GET /api/settings/role-permissions` and uses the org's configured features. The `useAuth()` signature, `can()` function, and all component code stays identical.

**Mid-session role changes (known limitation):** If an admin demotes a user while they're logged in, the old JWT stays valid until it expires (15-60min, configured in fs-whatsapp `JWT.AccessExpiryMins`). Mitigations:
- `/me` call on app load catches role changes on next page load or browser refresh
- Short access token expiry (15min recommended) limits the stale window
- Backend still enforces the real role on every API call — the stale JWT only affects frontend UI visibility
- Future improvement: poll `/me` every N minutes, or push role changes via WebSocket (when chat WebSocket exists)

### Middleware Route Protection

```
// middleware.ts

Request comes in
  → Public route? (/login, /register, /api/auth/*) → pass through
  → No token cookie? → redirect to /login
  → Verify JWT signature from cookie using jose library (MUST verify, not just base64-decode — otherwise anyone can forge a role)
  → Extract role from verified claims
  → Check route against role:
      /settings/users    → admin only
      /settings/api-keys → admin only
      /flows/*           → manager+
      /templates/*       → manager+
      /campaigns/*       → manager+
      /settings/*        → manager+
      /chat/*            → all roles
      /profile           → all roles
      /                  → all roles
  → Unauthorized? → redirect to /profile (safe for all roles; switch to /chat when chat ships)
```

Why JWT decode in middleware instead of `can()`? Middleware runs on the edge before React loads. No access to React context or the permissions API. JWT has the role — a quick decode (no DB call) is enough for route-level gating. Detailed `can()` checks happen in components.

Phase B doesn't change middleware. It does coarse route-level gating using JWT role. Fine-grained org-level permissions are checked by `can()` in components.

### Sidebar Filtering

```typescript
// components/app-sidebar.tsx

// Each nav item gets a 'feature' field
const NAV_ITEMS = [
  { name: 'Flows', path: '/flows', feature: 'flows' },
  { name: 'Templates', path: '/templates', feature: 'templates' },
  { name: 'Chat', path: '/chat', feature: 'chat' },
  { name: 'Contacts', path: '/contacts', feature: 'contacts' },
  { name: 'Campaigns', path: '/campaigns', feature: 'campaigns' },
]

const SETTINGS_CHILDREN = [
  { name: 'Accounts', path: '/settings/accounts', feature: 'accounts' },
  { name: 'Users', path: '/settings/users', feature: 'users' },
  { name: 'Teams', path: '/settings/teams', feature: 'teams' },
  { name: 'Chatbot', path: '/settings/chatbot', feature: 'chatbot-settings' },
  { name: 'API Keys', path: '/settings/api-keys', feature: 'api-keys' },
]

// Filter
const { can } = useAuth()
const visibleNav = NAV_ITEMS.filter(item => can(item.feature))
const visibleSettings = SETTINGS_CHILDREN.filter(item => can(item.feature))
```

**Visibility by role:**

| Nav Item | Admin | Manager | Agent |
|----------|-------|---------|-------|
| Flows | Yes | Yes | No |
| Templates | Yes | Yes | No |
| Chat | Yes | Yes | Yes |
| Contacts | Yes | Yes | Yes |
| Campaigns | Yes | Yes | No |
| Settings | Yes | Yes (subset) | No |
| → Accounts | Yes | Yes | No |
| → Users | Yes | No | No |
| → Teams | Yes | Yes | No |
| → Chatbot | Yes | Yes | No |
| → API Keys | Yes | No | No |
| Profile | Yes | Yes | Yes |

### UI Gating Convention

- **Nav items / full pages with no access:** Hide entirely (filter from sidebar)
- **Actions on accessible pages:** Disable button + tooltip with reason

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <span>
        <Button disabled={!can('contacts.delete')} onClick={handleDelete}>
          Delete
        </Button>
      </span>
    </TooltipTrigger>
    {!can('contacts.delete') && (
      <TooltipContent>Admin access required</TooltipContent>
    )}
  </Tooltip>
</TooltipProvider>
```

---

## Phase B — Backend + Org-Level Permissions

### Database

New table:

```sql
CREATE TABLE org_role_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  role            VARCHAR(50) NOT NULL,
  features        JSONB NOT NULL,
  is_custom       BOOLEAN DEFAULT FALSE,
  display_name    VARCHAR(100),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, role)
);
```

**Fields:**
- `role` — `'admin'`, `'manager'`, `'agent'`, or a custom role name
- `features` — JSON array: `["flows", "chat", "templates"]`
- `is_custom` — `false` for built-in roles, `true` for user-created roles (future)
- `display_name` — `NULL` for built-in, `"Flow Designer"` for custom (future)

**Seeding:** On org creation, insert 3 rows with `DEFAULT_ROLE_FEATURES` for admin/manager/agent.

### API Endpoints

All admin-only:

| Method | Endpoint | What it does |
|--------|----------|-------------|
| `GET` | `/api/settings/role-permissions` | Returns all roles + features for this org |
| `PUT` | `/api/settings/role-permissions/:role` | Update features for a built-in role |
| `POST` | `/api/settings/role-permissions` | Create custom role (future) |
| `DELETE` | `/api/settings/role-permissions/:role` | Delete custom role, only `is_custom=true` (future) |

`GET` response shape:

```json
{
  "data": [
    { "role": "admin", "features": ["flows", "chat", ...], "is_custom": false, "display_name": null },
    { "role": "manager", "features": ["flows", "chat", ...], "is_custom": false, "display_name": null },
    { "role": "agent", "features": ["chat", "contacts"], "is_custom": false, "display_name": null }
  ]
}
```

### Backend Middleware Update

Currently hardcoded path→role checks. Updated to dynamic:

```go
// Path → feature mapping (stays hardcoded — this is infra, not config)
var pathFeatureMap = map[string]string{
    "/api/users":      "users",
    "/api/api-keys":   "api-keys",
    "/api/accounts":   "accounts",
    "/api/templates":  "templates",
    "/api/flows":      "flows",
    "/api/campaigns":  "campaigns",
    "/api/chatbot":    "chatbot-settings",
    "/api/contacts":   "contacts",
    "/api/analytics":  "analytics",
    "/api/magic-flow": "flows",
}

// Check: does user's role have this feature in their org's config?
// 1. Get role from JWT context
// 2. Fetch org's role_permissions (cached in Redis, 5min TTL)
// 3. Check if feature is in role's features list
// 4. Prefix match: "users" passes if role has "users". "users.export" passes if role has "users".
```

**Action-level enforcement (future):** When a handler needs fine-grained checks, it calls the same `can(role, feature)` utility:

```go
func DeleteContact(r *fastglue.Request) error {
    if !can(r, "contacts.delete") { return 403 }
    // ... actual logic
}
```

Middleware still does the module-level first pass (rejects users with no `contacts` access). Handler does action-level check only when needed. This is additive — no existing handler changes required.

### Redis Caching

- Key: `role_permissions:{org_id}`
- TTL: 5 minutes
- Invalidated on: `PUT /api/settings/role-permissions/:role`
- Fallback: if Redis miss, query DB, cache result

### Frontend Settings UI

New "Roles & Permissions" page under Settings (admin-only):

```
┌─────────────────────────────────────────────┐
│ Roles & Permissions                         │
├──────────┬──────┬─────────┬────────┐        │
│ Feature  │Admin │ Manager │ Agent  │        │
├──────���───┼──────┼─────────┼���───────┤        │
│ Flows    │  ✓   │   ✓     │   ○    │        │
│ Templates│  ✓   │   ✓     │   ○    │        │
│ Chat     │  ✓   │   ✓     │   ✓    │        │
│ Campaigns│  ✓   │   ✓     │   ○    │        │
│ Contacts │  ✓   │   ✓     │   ○    │        │
│ Users    │  ✓   │   ○     │   ○    │        │
�� API Keys │  ✓   │   ○     │   ○    │        │
│ Teams    │  ✓   │   ✓     │   ○    │        │
│ Chatbot  │  ✓   │   ✓     │   ○    │        ���
│ Analytics│  ✓   │   ✓     │   ○    ���        │
└──────────���──────┴─────────┴───��────┘        │
│ ✓ = enabled  ○ = disabled                   │
│ [Save Changes]                              │
└─────────────────────────────���───────────────┘
```

Admin toggles checkboxes → `PUT` with updated features → backend updates DB + clears Redis → next request from affected role picks up new permissions.

### Frontend AuthProvider Change (Phase A → B)

```typescript
// Phase A: hardcoded
const permissions = DEFAULT_ROLE_FEATURES[user.role]

// Phase B: from API (React Query)
const { data: rolePermissions } = useQuery({
  queryKey: ['role-permissions'],
  queryFn: () => apiClient.get('/api/settings/role-permissions'),
})
const permissions = rolePermissions?.find(r => r.role === user.role)?.features
  ?? DEFAULT_ROLE_FEATURES[user.role as Role]
  ?? []  // deny-all if unknown role and API unavailable
```

The `can()` function, `useAuth()` hook signature, and all component code stays identical.

---

## Future: Custom Roles

Same `org_role_permissions` table. A custom role is just:

```sql
INSERT INTO org_role_permissions (organization_id, role, features, is_custom, display_name)
VALUES ('org-123', 'flow-designer', '["flows", "templates"]', true, 'Flow Designer');
```

Frontend: "Create Role" button on the Roles & Permissions page. Name input + feature checkboxes. Same settings UI, just a new column.

Backend: user's JWT still carries the role string. Custom role names work the same as built-in ones — the middleware looks up features by `(org_id, role)` regardless.

No schema change, no permission logic change, no component changes. Just a UI addition.

---

## Migration Path

| Aspect | Phase A | Phase B |
|--------|---------|---------|
| Permission source | Hardcoded `DEFAULT_ROLE_FEATURES` | `GET /api/settings/role-permissions` with fallback to defaults |
| Backend enforcement | Existing hardcoded middleware (unchanged) | Dynamic middleware reading from DB (Redis cached) |
| Settings UI | No permissions page | Roles & Permissions settings page |
| Custom roles | Not supported | Supported via same table (`is_custom=true`) |

**What doesn't change between phases:**
- `useAuth()` hook signature
- `can()` function and prefix-matching logic
- Middleware JWT decode + route redirect
- Sidebar filtering code
- Every `can()` call in every component

---

## Testing Strategy

### Phase A
- Unit test `can()` with prefix matching: `can('flows')`, `can('flows.publish')`, `can('nonexistent')`
- Unit test `DEFAULT_ROLE_FEATURES` — admin has everything, agent only has chat + contacts
- Test middleware redirects: agent visiting `/flows` → redirected, manager visiting `/flows` → passes
- Manual test: login as each role, verify sidebar shows correct items, disabled buttons work

### Phase B
- Backend: test CRUD endpoints for role-permissions
- Backend: test middleware with custom permissions (remove `templates` from manager, verify 403)
- Backend: test Redis cache invalidation on permission update
- Frontend: test that `can()` respects API-fetched permissions over defaults
- Integration: admin changes manager permissions → manager's next page load reflects change

---

## Files to Create/Modify

### Phase A (frontend only)

**New files:**
- `lib/permissions.ts` — `FEATURES`, `DEFAULT_ROLE_FEATURES`, `can()` logic
- `contexts/auth-context.tsx` — `AuthProvider`, `useAuth()` hook

**Modified files:**
- `middleware.ts` — add role-based route gating
- `components/app-sidebar.tsx` — filter nav items with `can()`
- `app/(dashboard)/layout.tsx` — wrap with `AuthProvider`
- `app/(dashboard)/settings/users/page.tsx` — disable actions with `can()`
- Any settings page with admin-only actions

### Phase B (frontend + backend)

**New files (backend):**
- `internal/models/` — `OrgRolePermission` model
- `internal/handlers/role_permissions.go` — CRUD handlers
- Migration file for `org_role_permissions` table

**New files (frontend):**
- `hooks/queries/use-role-permissions.ts` — React Query hooks
- `app/(dashboard)/settings/roles/page.tsx` — Roles & Permissions UI

**Modified files:**
- `cmd/fs-chat/main.go` — register new routes, update middleware
- `internal/middleware/middleware.go` — dynamic permission check with Redis cache
- `contexts/auth-context.tsx` — swap hardcoded map for API fetch
