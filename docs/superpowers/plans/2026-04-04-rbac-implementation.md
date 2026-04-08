# RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add role-based access control to MagicFlow — Phase A (frontend-only with hardcoded permission map) then Phase B (org-level configurable permissions with backend support).

**Architecture:** AuthProvider wraps the dashboard, fetches fresh user data via `/me` on load. `canAccess()` pure function in `lib/permissions.ts` does prefix-matching permission checks. Next.js middleware verifies JWT signature and redirects unauthorized routes. Sidebar and UI buttons use `can()` from `useAuth()` context. Phase B adds a `org_role_permissions` DB table, CRUD endpoints, Redis-cached dynamic middleware, and a settings UI.

**Tech Stack:** React, Next.js middleware, jose (JWT verification), TanStack React Query, shadcn, vitest. Backend: Go (fastglue), PostgreSQL, Redis.

**Spec:** `docs/superpowers/specs/2026-04-04-rbac-design.md`

---

## File Structure

### Phase A — New Files
| File | Responsibility |
|------|---------------|
| `lib/permissions.ts` | Feature list, default role→features map, `canAccess()` pure function |
| `lib/permissions.test.ts` | Tests for `canAccess()` and `DEFAULT_ROLE_FEATURES` |
| `contexts/auth-context.tsx` | `AuthProvider` + `useAuth()` hook (wraps permissions with user context) |
| `contexts/__tests__/auth-context.test.tsx` | Tests for AuthProvider and useAuth |

### Phase A — Modified Files
| File | Change |
|------|--------|
| `middleware.ts` | Add JWT signature verification via jose, role-based route redirects |
| `components/app-shell.tsx` | Wrap children with `AuthProvider` |
| `components/app-sidebar.tsx` | Add `feature` field to nav items, filter with `can()` |
| `app/(dashboard)/settings/users/page.tsx` | Disable admin-only actions with `can()` |
| `.env.local` | Add `JWT_SECRET` env var |

### Phase B — New Files (backend)
| File | Responsibility |
|------|---------------|
| `internal/models/org_role_permission.go` | GORM model for `org_role_permissions` table |
| `internal/handlers/role_permissions.go` | CRUD handlers for role permissions |
| `internal/handlers/role_permissions_test.go` | Handler tests |

### Phase B — New Files (frontend)
| File | Responsibility |
|------|---------------|
| `hooks/queries/use-role-permissions.ts` | React Query hooks for role permissions API |
| `app/(dashboard)/settings/roles/page.tsx` | Roles & Permissions settings UI |

### Phase B — Modified Files
| File | Change |
|------|--------|
| `cmd/fs-chat/main.go` | Register new routes, update RBAC middleware to be dynamic |
| `internal/middleware/middleware.go` | Add `CheckFeatureAccess()` that reads from Redis/DB |
| `contexts/auth-context.tsx` | Swap hardcoded map for API-fetched permissions |
| `hooks/queries/query-keys.ts` | Add `rolePermissionKeys` |
| `components/app-sidebar.tsx` | Add "Roles & Permissions" to SETTINGS_CHILDREN |

---

## Phase A — Frontend RBAC

### Task 1: Permission System (`lib/permissions.ts`)

**Files:**
- Create: `lib/permissions.ts`
- Create: `lib/__tests__/permissions.test.ts`

- [ ] **Step 1: Write failing tests for `canAccess()`**

Create `lib/__tests__/permissions.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { canAccess, DEFAULT_ROLE_FEATURES, FEATURES, type Role } from "../permissions"

describe("canAccess", () => {
  it("returns true for exact match", () => {
    expect(canAccess(["flows", "chat"], "flows")).toBe(true)
  })

  it("returns false when feature not in permissions", () => {
    expect(canAccess(["chat"], "flows")).toBe(false)
  })

  it("returns true for sub-feature when parent module is granted", () => {
    // 'flows' grants 'flows.publish', 'flows.delete', etc.
    expect(canAccess(["flows"], "flows.publish")).toBe(true)
    expect(canAccess(["flows"], "flows.delete")).toBe(true)
  })

  it("returns false for sub-feature when only sibling is granted", () => {
    // Having 'flows.view' does NOT grant 'flows.publish'
    expect(canAccess(["flows.view"], "flows.publish")).toBe(false)
  })

  it("returns false for parent when only sub-feature is granted", () => {
    // Having 'flows.view' does NOT grant 'flows' (module-level)
    expect(canAccess(["flows.view"], "flows")).toBe(false)
  })

  it("returns false for empty permissions", () => {
    expect(canAccess([], "flows")).toBe(false)
  })

  it("handles flat feature names correctly", () => {
    expect(canAccess(["users"], "users")).toBe(true)
    expect(canAccess(["users"], "api-keys")).toBe(false)
  })
})

describe("DEFAULT_ROLE_FEATURES", () => {
  it("admin has all features", () => {
    for (const feature of FEATURES) {
      expect(canAccess(DEFAULT_ROLE_FEATURES.admin, feature)).toBe(true)
    }
  })

  it("agent only has chat and contacts", () => {
    expect(canAccess(DEFAULT_ROLE_FEATURES.agent, "chat")).toBe(true)
    expect(canAccess(DEFAULT_ROLE_FEATURES.agent, "contacts")).toBe(true)
    expect(canAccess(DEFAULT_ROLE_FEATURES.agent, "flows")).toBe(false)
    expect(canAccess(DEFAULT_ROLE_FEATURES.agent, "templates")).toBe(false)
    expect(canAccess(DEFAULT_ROLE_FEATURES.agent, "users")).toBe(false)
  })

  it("manager has flows but not users", () => {
    expect(canAccess(DEFAULT_ROLE_FEATURES.manager, "flows")).toBe(true)
    expect(canAccess(DEFAULT_ROLE_FEATURES.manager, "chat")).toBe(true)
    expect(canAccess(DEFAULT_ROLE_FEATURES.manager, "users")).toBe(false)
    expect(canAccess(DEFAULT_ROLE_FEATURES.manager, "api-keys")).toBe(false)
  })

  it("unknown role falls back to empty array", () => {
    const permissions = DEFAULT_ROLE_FEATURES["flow-designer" as Role] ?? []
    expect(permissions).toEqual([])
    expect(canAccess(permissions, "flows")).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/permissions.test.ts`
Expected: FAIL — module `../permissions` not found

- [ ] **Step 3: Implement `lib/permissions.ts`**

Create `lib/permissions.ts`:

```typescript
export type Role = "admin" | "manager" | "agent"

export const FEATURES = [
  "flows",
  "templates",
  "chat",
  "campaigns",
  "contacts",
  "analytics",
  "accounts",
  "users",
  "teams",
  "chatbot-settings",
  "api-keys",
] as const

export type Feature = (typeof FEATURES)[number]

/**
 * Default feature sets per role. Mirrors fs-whatsapp backend middleware.
 * Phase B replaces this with org-level config from the API.
 */
export const DEFAULT_ROLE_FEATURES: Record<Role, Feature[]> = {
  admin: [
    "flows", "templates", "chat", "campaigns", "contacts", "analytics",
    "accounts", "users", "teams",
    "chatbot-settings", "api-keys",
  ],
  manager: [
    "flows", "templates", "chat", "campaigns", "contacts", "analytics",
    "accounts", "teams", "chatbot-settings",
  ],
  agent: [
    "chat", "contacts",
  ],
}

/**
 * Check if a feature is granted by the given permissions.
 * Supports prefix matching: having 'flows' grants 'flows.publish'.
 * Pure function — use directly in tests/middleware, or via useAuth().can() in components.
 */
export function canAccess(permissions: string[], feature: string): boolean {
  if (permissions.includes(feature)) return true

  // Prefix match: 'flows' grants 'flows.publish', 'flows.delete', etc.
  // Split on '.' and check if the first segment is a module-level permission
  const parts = feature.split(".")
  if (parts.length > 1) {
    return permissions.includes(parts[0])
  }

  return false
}

/**
 * Validate that a features array only contains leaf-level features from FEATURES.
 * Blocks parent prefixes like 'settings' that would grant all settings sub-features.
 * Used in Phase B settings UI and PUT endpoint validation.
 */
export function validateFeatures(features: string[]): { valid: boolean; invalid: string[] } {
  const featureSet = new Set<string>(FEATURES)
  const invalid = features.filter((f) => !featureSet.has(f))
  return { valid: invalid.length === 0, invalid }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/permissions.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/permissions.ts lib/__tests__/permissions.test.ts
git commit -m "feat(rbac): add permission system with canAccess and role feature maps"
```

---

### Task 2: AuthProvider + useAuth Hook

**Files:**
- Create: `contexts/auth-context.tsx`
- Modify: `lib/auth.ts` (add `fetchCurrentUser()`)
- Modify: `components/app-shell.tsx:6-16` (wrap with AuthProvider)

- [ ] **Step 1: Add `fetchCurrentUser()` to `lib/auth.ts`**

Add this function after the existing `refreshAccessToken()` function (after line 89 in `lib/auth.ts`):

```typescript
/**
 * Fetch fresh user data from the backend.
 * Called on app load to ensure role and user data are current.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = getAccessToken()
  if (!token) return null

  const fsWhatsappUrl = process.env.NEXT_PUBLIC_FS_WHATSAPP_URL
  const baseUrl = fsWhatsappUrl || ""

  try {
    const response = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return null
    const json = await response.json()
    // Unwrap fs-whatsapp envelope
    const user = json?.data ?? json
    setUser(user)
    return user as AuthUser
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Create `contexts/auth-context.tsx`**

```typescript
"use client"

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  type AuthUser,
  getAccessToken,
  fetchCurrentUser,
  clearAuth,
} from "@/lib/auth"
import { canAccess, DEFAULT_ROLE_FEATURES, type Role } from "@/lib/permissions"

interface AuthContextValue {
  user: AuthUser | null
  role: Role
  permissions: string[]
  can: (feature: string) => boolean
  isLoading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      setIsLoading(false)
      return
    }

    fetchCurrentUser()
      .then((freshUser) => {
        if (freshUser) {
          setUser(freshUser)
        } else {
          // Token invalid or expired — clear and redirect
          clearAuth()
          router.push("/login")
        }
      })
      .finally(() => setIsLoading(false))
  }, [router])

  const role: Role = (user?.role as Role) || "agent"

  // Deny-all for unknown roles (e.g., custom roles in Phase B when API fails)
  const permissions = useMemo(
    () => DEFAULT_ROLE_FEATURES[role] ?? [],
    [role]
  )

  const can = useCallback(
    (feature: string) => canAccess(permissions, feature),
    [permissions]
  )

  const handleLogout = useCallback(() => {
    clearAuth()
    window.location.href = "/login"
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, role, permissions, can, isLoading, logout: handleLogout }),
    [user, role, permissions, can, isLoading, handleLogout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
```

- [ ] **Step 3: Wrap AppShell with AuthProvider**

Modify `components/app-shell.tsx` — replace the entire file:

```typescript
"use client"

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { AuthProvider } from "@/contexts/auth-context"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AuthProvider>
  )
}
```

- [ ] **Step 4: Verify app still loads**

Run: `docker compose up` (or however the dev server starts)
Open the app in browser, verify it loads without errors. Check browser console for any React context errors.

- [ ] **Step 5: Commit**

```bash
git add contexts/auth-context.tsx lib/auth.ts components/app-shell.tsx
git commit -m "feat(rbac): add AuthProvider with useAuth hook and /me fetch on load"
```

---

### Task 3: Middleware Route Protection

**Files:**
- Modify: `middleware.ts` (full rewrite)
- Modify: `.env.local` (add JWT_SECRET)

- [ ] **Step 1: Install jose for JWT verification**

```bash
npm install jose
```

- [ ] **Step 2: Add JWT_SECRET to environment**

Add to `.env.local`:
```
JWT_SECRET=<same secret as fs-whatsapp's app.Config.JWT.Secret>
```

Check the fs-whatsapp config to find the value. It's used in `cmd/fs-chat/main.go:469` as `app.Config.JWT.Secret`.

- [ ] **Step 3: Rewrite `middleware.ts`**

Replace the entire contents of `middleware.ts`:

```typescript
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/register", "/api/auth"]
const STATIC_PREFIXES = ["/_next", "/app/_next", "/favicon.ico"]

// Route → minimum role mapping
// Routes not listed here are accessible to all authenticated users
const ROUTE_ROLES: { prefix: string; roles: string[] }[] = [
  { prefix: "/settings/users", roles: ["admin"] },
  { prefix: "/settings/api-keys", roles: ["admin"] },
  { prefix: "/settings", roles: ["admin", "manager"] },
  { prefix: "/flows", roles: ["admin", "manager"] },
  { prefix: "/flow-templates", roles: ["admin", "manager"] },
  { prefix: "/templates", roles: ["admin", "manager"] },
  { prefix: "/campaigns", roles: ["admin", "manager"] },
]

function decodeRole(payload: Record<string, unknown>): string {
  return (payload.role as string) || "agent"
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes and static assets
  if (
    PUBLIC_ROUTES.some((route) => pathname.startsWith(route)) ||
    STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next()
  }

  // Check auth cookie
  const token = request.cookies.get("mf_access_token")?.value
  if (!token) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Verify JWT signature and extract role
  const secret = process.env.JWT_SECRET
  if (!secret) {
    // No secret configured — allow through (backend still enforces)
    // Log this in production monitoring
    return NextResponse.next()
  }

  let role = "agent"
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { issuer: "fschat" }
    )
    role = decodeRole(payload as Record<string, unknown>)
  } catch {
    // Invalid/expired JWT — clear cookie and redirect to login
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete("mf_access_token")
    return response
  }

  // Check role-based route access
  // ROUTE_ROLES is ordered specific→general, first match wins
  for (const route of ROUTE_ROLES) {
    if (pathname.startsWith(route.prefix)) {
      if (!route.roles.includes(role)) {
        // Redirect to safe page — /profile is accessible to all roles
        const redirectUrl = new URL("/profile", request.url)
        return NextResponse.redirect(redirectUrl)
      }
      break // First match wins
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|app/_next|favicon.ico).*)"],
}
```

- [ ] **Step 4: Test middleware manually**

1. Login as admin → navigate to `/settings/users` → should load
2. Login as agent → navigate to `/settings/users` → should redirect to `/profile`
3. Login as agent → navigate to `/flows` → should redirect to `/profile`
4. Login as manager → navigate to `/flows` → should load
5. Clear cookies → navigate to `/flows` → should redirect to `/login`

- [ ] **Step 5: Commit**

```bash
git add middleware.ts package.json package-lock.json
git commit -m "feat(rbac): add JWT verification and role-based route protection in middleware"
```

---

### Task 4: Sidebar Filtering

**Files:**
- Modify: `components/app-sidebar.tsx`

- [ ] **Step 1: Add feature field to nav items and filter with `can()`**

Modify `components/app-sidebar.tsx`. Changes needed:

**a)** Add `useAuth` import (add after line 51):
```typescript
import { useAuth } from "@/contexts/auth-context"
```

**b)** Add `feature` field to NAV_ITEMS (replace lines 58-62):
```typescript
const NAV_ITEMS = [
  { label: "Flows", icon: Workflow, path: "/flows", feature: "flows" },
  { label: "Flow Templates", icon: Layers, path: "/flow-templates", feature: "flows" },
  { label: "WhatsApp Templates", icon: FileText, path: "/templates", feature: "templates" },
]
```

**c)** Add `feature` field to SETTINGS_CHILDREN (replace lines 64-70):
```typescript
const SETTINGS_CHILDREN = [
  { label: "Accounts", icon: Phone, path: "/settings/accounts", feature: "accounts" },
  { label: "Users", icon: Users, path: "/settings/users", feature: "users" },
  { label: "Teams", icon: Users, path: "/settings/teams", feature: "teams" },
  { label: "Chatbot", icon: Bot, path: "/settings/chatbot", feature: "chatbot-settings" },
  { label: "API Keys", icon: Key, path: "/settings/api-keys", feature: "api-keys" },
]
```

**d)** Replace `getUser` state with `useAuth` (replace lines 85-86):
```typescript
  const { user, can } = useAuth()
```

Remove the `useState` and `useEffect` for user that were on lines 85-86. The `user` now comes from `useAuth()`.

**e)** Filter nav items. Add these lines after the `isSettingsActive` check (after line 88):
```typescript
  const visibleNav = NAV_ITEMS.filter((item) => can(item.feature))
  const visibleSettings = SETTINGS_CHILDREN.filter((item) => can(item.feature))
  const hasAnySettings = visibleSettings.length > 0
```

**f)** Update NAV_ITEMS rendering (line 106) — change `NAV_ITEMS.map` to `visibleNav.map`:
```typescript
              {visibleNav.map((item) => (
```

**g)** Conditionally render Settings collapsible. Wrap the entire `<Collapsible>` block (lines 124-155) with:
```typescript
              {hasAnySettings && (
                <Collapsible defaultOpen={isSettingsActive} className="group/collapsible">
                  {/* ... existing content ... */}
                </Collapsible>
              )}
```

**h)** Update SETTINGS_CHILDREN rendering (line 139) — change `SETTINGS_CHILDREN.map` to `visibleSettings.map`:
```typescript
                      {visibleSettings.map((child) => (
```

- [ ] **Step 2: Verify sidebar filtering works**

1. Login as admin → sidebar shows: Flows, Flow Templates, WhatsApp Templates, Settings (all 5 children)
2. Login as manager → sidebar shows: Flows, Flow Templates, WhatsApp Templates, Settings (Accounts, Teams, Chatbot only — no Users, no API Keys)
3. Login as agent → sidebar shows: no nav items except Profile in footer dropdown (no Flows, no Templates, no Settings)

- [ ] **Step 3: Commit**

```bash
git add components/app-sidebar.tsx
git commit -m "feat(rbac): filter sidebar nav items by role permissions"
```

---

### Task 5: Disable Admin-Only Actions on Settings Pages

**Files:**
- Modify: `app/(dashboard)/settings/users/page.tsx`

- [ ] **Step 1: Add `useAuth` import and get `can` function**

Add import at top of `app/(dashboard)/settings/users/page.tsx`:
```typescript
import { useAuth } from "@/contexts/auth-context"
```

Inside the `UsersPage` component, add after the existing hooks:
```typescript
  const { can } = useAuth()
  const canManageUsers = can("users")
```

- [ ] **Step 2: Disable the "Add User" button when user lacks permission**

Find the "Add User" or "Invite User" button in the component. Wrap it or add disabled prop:

```tsx
<Button
  onClick={() => setDialogOpen(true)}
  disabled={!canManageUsers}
>
  <UserPlus className="mr-2 h-4 w-4" />
  Add User
</Button>
```

If there's no tooltip wrapper yet, add one:
```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <span>
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={!canManageUsers}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </span>
    </TooltipTrigger>
    {!canManageUsers && (
      <TooltipContent>Admin access required</TooltipContent>
    )}
  </Tooltip>
</TooltipProvider>
```

- [ ] **Step 3: Disable edit/delete actions per user row**

Find the user row actions (edit button, delete button, role dropdown). For each:

```tsx
// Edit button
<Button
  variant="ghost"
  size="icon"
  onClick={() => handleEdit(user)}
  disabled={!canManageUsers}
>
  <Pencil className="h-4 w-4" />
</Button>

// Delete button
<Button
  variant="ghost"
  size="icon"
  onClick={() => setUserToDelete(user)}
  disabled={!canManageUsers}
>
  <Trash2 className="h-4 w-4" />
</Button>
```

- [ ] **Step 4: Test**

1. Login as admin → Users page: all buttons clickable
2. Login as manager → Users page: shouldn't be accessible (middleware redirects), but if somehow reached, all buttons disabled

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/settings/users/page.tsx
git commit -m "feat(rbac): disable admin-only user management actions for non-admin roles"
```

---

### Task 6: Phase A Integration Test

**Files:**
- No new files — manual verification

- [ ] **Step 1: Test as admin**

Login as admin user. Verify:
- Sidebar: all nav items visible (Flows, Flow Templates, WhatsApp Templates)
- Settings: all 5 children visible (Accounts, Users, Teams, Chatbot, API Keys)
- `/settings/users`: all actions enabled (Add, Edit, Delete)
- Direct URL `/flows`: loads correctly
- Direct URL `/settings/api-keys`: loads correctly

- [ ] **Step 2: Test as manager**

Login as manager user. Verify:
- Sidebar: Flows, Flow Templates, WhatsApp Templates visible
- Settings: 3 children visible (Accounts, Teams, Chatbot). Users and API Keys hidden.
- Direct URL `/settings/users`: redirects to `/profile`
- Direct URL `/settings/api-keys`: redirects to `/profile`
- Direct URL `/flows`: loads correctly

- [ ] **Step 3: Test as agent**

Login as agent user. Verify:
- Sidebar: no main nav items (Flows, Templates, etc. all hidden). Settings hidden.
- Profile link in footer dropdown still works
- Direct URL `/flows`: redirects to `/profile`
- Direct URL `/settings/users`: redirects to `/profile`
- Direct URL `/profile`: loads correctly

- [ ] **Step 4: Test edge cases**

- Clear cookies manually, visit `/flows` → redirects to `/login`
- Tamper with JWT cookie (change a character) → redirects to `/login`
- Refresh the page after login → no flash of unauthorized content

- [ ] **Step 5: Run lints and tests**

```bash
npx tsc --noEmit && npx vitest run
```

All must pass. Fix any issues before proceeding.

- [ ] **Step 6: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix(rbac): fixes from Phase A integration testing"
```

---

## Phase B — Backend + Org-Level Permissions

### Task 7: Database Model + Migration

**Files:**
- Create: `internal/models/org_role_permission.go` (in fs-whatsapp)

- [ ] **Step 1: Create the GORM model**

Create `internal/models/org_role_permission.go` in the **fs-whatsapp** repo:

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

// OrgRolePermission stores per-org, per-role feature access configuration.
// Built-in roles (admin/manager/agent) are seeded on org creation.
// Custom roles (future) have IsCustom=true and a DisplayName.
type OrgRolePermission struct {
	ID             uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	OrganizationID uuid.UUID  `gorm:"type:uuid;not null;index" json:"organization_id"`
	Role           string     `gorm:"size:50;not null" json:"role"`
	Features       JSONBArray `gorm:"type:jsonb;not null" json:"features"`
	IsCustom       bool       `gorm:"default:false" json:"is_custom"`
	DisplayName    *string    `gorm:"size:100" json:"display_name"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

func (OrgRolePermission) TableName() string {
	return "org_role_permissions"
}
```

- [ ] **Step 2: Add auto-migration**

In `cmd/fs-chat/main.go`, find where `AutoMigrate` is called and add `OrgRolePermission`:

```go
db.AutoMigrate(
	// ... existing models ...
	&models.OrgRolePermission{},
)
```

- [ ] **Step 3: Add unique constraint**

Add a unique index in the model:

```go
type OrgRolePermission struct {
	// ... fields above ...
}

func (OrgRolePermission) TableName() string {
	return "org_role_permissions"
}

// Add this to the migration or as a GORM hook:
// CREATE UNIQUE INDEX idx_org_role_permissions_org_role ON org_role_permissions(organization_id, role);
```

Or use GORM's `uniqueIndex` tag:
```go
OrganizationID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_org_role" json:"organization_id"`
Role           string    `gorm:"size:50;not null;uniqueIndex:idx_org_role" json:"role"`
```

- [ ] **Step 4: Verify migration runs**

Restart the fs-whatsapp Docker container. Check the database:

```bash
docker compose up -d
docker exec -it <postgres-container> psql -U <user> -d <db> -c "\d org_role_permissions"
```

Expected: table exists with all columns and unique index.

- [ ] **Step 5: Commit**

```bash
git add internal/models/org_role_permission.go cmd/fs-chat/main.go
git commit -m "feat(rbac): add org_role_permissions model and migration"
```

---

### Task 8: Seed Default Permissions on Org Creation

**Files:**
- Modify: `internal/handlers/auth.go` (in fs-whatsapp) — where organizations are created during registration

- [ ] **Step 1: Find where organizations are created**

In `internal/handlers/auth.go`, find the `Register` handler. After the organization is created and committed to DB, seed the 3 default role permission rows.

- [ ] **Step 2: Add seeding logic**

After the org is created in the register handler, add:

```go
// Seed default role permissions for the new organization
defaultPermissions := []models.OrgRolePermission{
	{
		OrganizationID: org.ID,
		Role:           string(models.RoleAdmin),
		Features:       models.JSONBArray{"flows", "templates", "chat", "campaigns", "contacts", "analytics", "settings.accounts", "settings.users", "settings.teams", "settings.chatbot", "settings.api-keys"},
	},
	{
		OrganizationID: org.ID,
		Role:           string(models.RoleManager),
		Features:       models.JSONBArray{"flows", "templates", "chat", "campaigns", "contacts", "analytics", "settings.accounts", "settings.teams", "settings.chatbot"},
	},
	{
		OrganizationID: org.ID,
		Role:           string(models.RoleAgent),
		Features:       models.JSONBArray{"chat", "contacts"},
	},
}
for _, perm := range defaultPermissions {
	if err := tx.Create(&perm).Error; err != nil {
		// Log but don't fail registration — permissions can be seeded later
		log.Printf("Warning: failed to seed role permissions for org %s: %v", org.ID, err)
	}
}
```

- [ ] **Step 3: Seed existing orgs (one-time migration)**

Create a helper function or SQL script to seed permissions for existing organizations that don't have them yet:

```sql
-- Run once for existing orgs that predate this feature
INSERT INTO org_role_permissions (organization_id, role, features, is_custom)
SELECT o.id, 'admin', '["flows","templates","chat","campaigns","contacts","analytics","settings.accounts","settings.users","settings.teams","settings.chatbot","settings.api-keys"]'::jsonb, false
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM org_role_permissions p WHERE p.organization_id = o.id AND p.role = 'admin');

INSERT INTO org_role_permissions (organization_id, role, features, is_custom)
SELECT o.id, 'manager', '["flows","templates","chat","campaigns","contacts","analytics","settings.accounts","settings.teams","settings.chatbot"]'::jsonb, false
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM org_role_permissions p WHERE p.organization_id = o.id AND p.role = 'manager');

INSERT INTO org_role_permissions (organization_id, role, features, is_custom)
SELECT o.id, 'agent', '["chat","contacts"]'::jsonb, false
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM org_role_permissions p WHERE p.organization_id = o.id AND p.role = 'agent');
```

- [ ] **Step 4: Verify seeding**

Register a new org and check the database:
```sql
SELECT * FROM org_role_permissions WHERE organization_id = '<new-org-id>';
```
Expected: 3 rows (admin, manager, agent) with correct features.

- [ ] **Step 5: Commit**

```bash
git add internal/handlers/auth.go
git commit -m "feat(rbac): seed default role permissions on org creation"
```

---

### Task 9: Role Permissions CRUD Handlers

**Files:**
- Create: `internal/handlers/role_permissions.go` (in fs-whatsapp)

- [ ] **Step 1: Create the handlers file**

Create `internal/handlers/role_permissions.go`:

```go
package handlers

import (
	"encoding/json"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"

	"github.com/freestandtech/fs-whatsapp/internal/models"
)

// Allowed features — only leaf-level features can be assigned.
// Parent prefixes like "settings" are blocked.
var allowedFeatures = map[string]bool{
	"flows": true, "templates": true, "chat": true,
	"campaigns": true, "contacts": true, "analytics": true,
	"settings.accounts": true, "settings.users": true,
	"settings.teams": true, "settings.chatbot": true,
	"settings.api-keys": true,
}

type rolePermissionRequest struct {
	Features []string `json:"features"`
}

// GetRolePermissions returns all role permission configs for the org.
func (a *App) GetRolePermissions(r *fastglue.Request) error {
	orgID, err := getOrganizationID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	var permissions []models.OrgRolePermission
	if err := a.DB.Where("organization_id = ?", orgID).
		Order("CASE role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'agent' THEN 3 ELSE 4 END").
		Find(&permissions).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to fetch permissions", nil, "")
	}

	return r.SendEnvelope(permissions)
}

// UpdateRolePermissions updates the features for a specific role in the org.
func (a *App) UpdateRolePermissions(r *fastglue.Request) error {
	orgID, err := getOrganizationID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	// Only admin can update
	role, _ := r.RequestCtx.UserValue("role").(models.Role)
	if role != models.RoleAdmin {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Admin access required", nil, "")
	}

	targetRole := r.RequestCtx.UserValue("role_name").(string)

	var req rolePermissionRequest
	if err := json.Unmarshal(r.RequestCtx.PostBody(), &req); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid request body", nil, "")
	}

	// Validate features — only allow leaf-level features
	for _, f := range req.Features {
		if !allowedFeatures[f] {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid feature: "+f, nil, "")
		}
	}

	// Upsert
	var perm models.OrgRolePermission
	result := a.DB.Where("organization_id = ? AND role = ?", orgID, targetRole).First(&perm)
	if result.Error != nil {
		// Create new
		perm = models.OrgRolePermission{
			OrganizationID: orgID,
			Role:           targetRole,
			Features:       models.JSONBArray(req.Features),
		}
		if err := a.DB.Create(&perm).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create permissions", nil, "")
		}
	} else {
		// Update existing
		perm.Features = models.JSONBArray(req.Features)
		if err := a.DB.Save(&perm).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update permissions", nil, "")
		}
	}

	// Invalidate Redis cache
	cacheKey := "role_permissions:" + orgID.String()
	a.Redis.Del(r.RequestCtx, cacheKey)

	return r.SendEnvelope(perm)
}
```

- [ ] **Step 2: Register routes in `cmd/fs-chat/main.go`**

Find the settings routes section and add:

```go
// Role permissions (admin only — handler checks role internally)
g.GET("/api/settings/role-permissions", app.GetRolePermissions)
g.PUT("/api/settings/role-permissions/{role_name}", app.UpdateRolePermissions)
```

Note: Use `role_name` as the URL parameter name to avoid conflicts with the context `role` key.

- [ ] **Step 3: Test endpoints**

```bash
# As admin — get permissions
curl -H "Authorization: Bearer <admin-token>" http://localhost:9000/api/settings/role-permissions

# As admin — update manager permissions (remove templates)
curl -X PUT \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"features":["flows","chat","campaigns","contacts","analytics","settings.accounts","settings.teams","settings.chatbot"]}' \
  http://localhost:9000/api/settings/role-permissions/manager

# As manager — should get 403
curl -X PUT \
  -H "Authorization: Bearer <manager-token>" \
  -H "Content-Type: application/json" \
  -d '{"features":["flows"]}' \
  http://localhost:9000/api/settings/role-permissions/agent

# Invalid feature — should get 400
curl -X PUT \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"features":["settings"]}' \
  http://localhost:9000/api/settings/role-permissions/manager
```

- [ ] **Step 4: Commit**

```bash
git add internal/handlers/role_permissions.go cmd/fs-chat/main.go
git commit -m "feat(rbac): add GET/PUT endpoints for org role permissions"
```

---

### Task 10: Dynamic Backend Middleware

**Files:**
- Modify: `internal/middleware/middleware.go` (in fs-whatsapp)
- Modify: `cmd/fs-chat/main.go` — update RBAC middleware to use dynamic check

- [ ] **Step 1: Add `CheckFeatureAccess` to middleware**

Add to `internal/middleware/middleware.go`:

```go
// pathFeatureMap maps API path prefixes to feature names.
// This is infrastructure config, not user-configurable.
var pathFeatureMap = map[string]string{
	"/api/users":      "settings.users",
	"/api/api-keys":   "settings.api-keys",
	"/api/flow-api-keys": "settings.api-keys",
	"/api/settings/sso": "settings.users",
	"/api/accounts":   "settings.accounts",
	"/api/instagram/accounts": "settings.accounts",
	"/api/templates":  "templates",
	"/api/flows":      "flows",
	"/api/campaigns":  "campaigns",
	"/api/chatbot":    "settings.chatbot",
	"/api/contacts":   "contacts",
	"/api/analytics":  "analytics",
	"/api/magic-flow": "flows",
}

// HasFeature checks if a feature is in the permissions list using prefix matching.
// "flows" grants "flows.publish". "settings.users" grants "settings.users.delete".
func HasFeature(features []string, feature string) bool {
	for _, f := range features {
		if f == feature {
			return true
		}
	}
	// Prefix match: check if the feature's first segment matches
	parts := strings.SplitN(feature, ".", 2)
	if len(parts) > 1 {
		for _, f := range features {
			if f == parts[0] {
				return true
			}
		}
	}
	return false
}
```

- [ ] **Step 2: Update RBAC middleware in `cmd/fs-chat/main.go`**

Replace the hardcoded RBAC middleware (lines 474-554) with dynamic version that reads from Redis/DB:

```go
// RBAC middleware — dynamic, reads from org_role_permissions
g.Use(func(r *fastglue.Request) *fastglue.Request {
	path := string(r.RequestCtx.Path())

	// Skip RBAC for non-API, auth, webhook, ws routes
	if !strings.HasPrefix(path, "/api/") ||
		strings.HasPrefix(path, "/api/auth/") ||
		strings.HasPrefix(path, "/api/webhook") ||
		strings.HasPrefix(path, "/api/ext/") ||
		path == "/ws" {
		return r
	}

	role, ok := r.RequestCtx.UserValue("role").(models.Role)
	if !ok {
		return r
	}

	orgID, ok := r.RequestCtx.UserValue("organization_id").(uuid.UUID)
	if !ok {
		return r
	}

	// Find which feature this path requires
	requiredFeature := ""
	for prefix, feature := range middleware.PathFeatureMap {
		if strings.HasPrefix(path, prefix) {
			requiredFeature = feature
			break
		}
	}

	if requiredFeature == "" {
		return r // Path not gated
	}

	// Get org's role permissions (Redis cached, 5min TTL)
	features := getRoleFeatures(r.RequestCtx, app, orgID, string(role))

	if !middleware.HasFeature(features, requiredFeature) {
		r.SendErrorEnvelope(fasthttp.StatusForbidden, "Access denied", nil, "")
		return nil
	}

	return r
})
```

Add the `getRoleFeatures` helper:

```go
func getRoleFeatures(ctx context.Context, app *App, orgID uuid.UUID, role string) []string {
	cacheKey := fmt.Sprintf("role_permissions:%s", orgID.String())

	// Try Redis first
	cached, err := app.Redis.HGet(ctx, cacheKey, role).Result()
	if err == nil {
		var features []string
		if json.Unmarshal([]byte(cached), &features) == nil {
			return features
		}
	}

	// Cache miss — query DB
	var perm models.OrgRolePermission
	if err := app.DB.Where("organization_id = ? AND role = ?", orgID, role).
		First(&perm).Error; err != nil {
		return nil // No permissions found — deny all
	}

	// Cache in Redis (5min TTL)
	featuresJSON, _ := json.Marshal(perm.Features)
	app.Redis.HSet(ctx, cacheKey, role, string(featuresJSON))
	app.Redis.Expire(ctx, cacheKey, 5*time.Minute)

	return perm.Features
}
```

- [ ] **Step 3: Test dynamic middleware**

1. With default permissions: admin can access `/api/users`, manager cannot
2. Update manager permissions via API to include `settings.users`
3. Manager can now access `/api/users` (after Redis cache expires or is invalidated)
4. Revert manager permissions, verify 403 again

- [ ] **Step 4: Commit**

```bash
git add internal/middleware/middleware.go cmd/fs-chat/main.go
git commit -m "feat(rbac): dynamic RBAC middleware with Redis-cached org permissions"
```

---

### Task 11: Frontend — Fetch Permissions from API

**Files:**
- Create: `hooks/queries/use-role-permissions.ts` (in magic-flow)
- Modify: `hooks/queries/query-keys.ts`
- Modify: `contexts/auth-context.tsx`

- [ ] **Step 1: Add query keys**

Add to `hooks/queries/query-keys.ts` (after the existing key factories):

```typescript
export const rolePermissionKeys = {
  all: ["rolePermissions"] as const,
  list: () => [...rolePermissionKeys.all, "list"] as const,
} as const
```

- [ ] **Step 2: Create `hooks/queries/use-role-permissions.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { rolePermissionKeys } from "./query-keys"

interface RolePermission {
  id: string
  organization_id: string
  role: string
  features: string[]
  is_custom: boolean
  display_name: string | null
}

export function useRolePermissions() {
  return useQuery({
    queryKey: rolePermissionKeys.list(),
    queryFn: () => apiClient.get<RolePermission[]>("/api/settings/role-permissions"),
  })
}

export function useUpdateRolePermissions(role: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (features: string[]) =>
      apiClient.put<RolePermission>(`/api/settings/role-permissions/${role}`, { features }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all })
    },
  })
}
```

- [ ] **Step 3: Update AuthProvider to fetch permissions from API**

Modify `contexts/auth-context.tsx`. Replace the hardcoded permissions with API-fetched ones:

```typescript
"use client"

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  type AuthUser,
  getAccessToken,
  fetchCurrentUser,
  clearAuth,
} from "@/lib/auth"
import { canAccess, DEFAULT_ROLE_FEATURES, type Role } from "@/lib/permissions"
import { apiClient } from "@/lib/api-client"
import { rolePermissionKeys } from "@/hooks/queries/query-keys"

interface RolePermission {
  role: string
  features: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  role: Role
  permissions: string[]
  can: (feature: string) => boolean
  isLoading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      setIsLoading(false)
      return
    }

    fetchCurrentUser()
      .then((freshUser) => {
        if (freshUser) {
          setUser(freshUser)
        } else {
          clearAuth()
          router.push("/login")
        }
      })
      .finally(() => setIsLoading(false))
  }, [router])

  const role: Role = (user?.role as Role) || "agent"

  // Fetch org-level permissions (Phase B)
  const { data: rolePermissions } = useQuery({
    queryKey: rolePermissionKeys.list(),
    queryFn: () => apiClient.get<RolePermission[]>("/api/settings/role-permissions"),
    enabled: !!user, // Only fetch when user is loaded
    staleTime: 5 * 60 * 1000, // 5 minutes — match Redis TTL
  })

  // Use API permissions if available, fall back to hardcoded defaults
  // Deny-all (empty array) for unknown roles when API is unavailable
  const permissions = useMemo(() => {
    const apiPerms = rolePermissions?.find((r) => r.role === user?.role)?.features
    return apiPerms ?? DEFAULT_ROLE_FEATURES[role] ?? []
  }, [rolePermissions, role, user?.role])

  const can = useCallback(
    (feature: string) => canAccess(permissions, feature),
    [permissions]
  )

  const handleLogout = useCallback(() => {
    clearAuth()
    window.location.href = "/login"
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, role, permissions, can, isLoading, logout: handleLogout }),
    [user, role, permissions, can, isLoading, handleLogout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
```

- [ ] **Step 4: Verify**

1. App loads, AuthProvider fetches `/api/settings/role-permissions`
2. Network tab shows the API call
3. Permissions work the same as Phase A (since defaults match)

- [ ] **Step 5: Commit**

```bash
git add hooks/queries/use-role-permissions.ts hooks/queries/query-keys.ts contexts/auth-context.tsx
git commit -m "feat(rbac): fetch org role permissions from API in AuthProvider"
```

---

### Task 12: Roles & Permissions Settings Page

**Files:**
- Create: `app/(dashboard)/settings/roles/page.tsx` (in magic-flow)
- Modify: `components/app-sidebar.tsx` — add nav item

- [ ] **Step 1: Add "Roles" to SETTINGS_CHILDREN in sidebar**

In `components/app-sidebar.tsx`, add to SETTINGS_CHILDREN array (import `Shield` icon from lucide-react):

```typescript
{ label: "Roles", icon: Shield, path: "/settings/roles", feature: "settings.users" },
```

This uses `settings.users` feature since only admins who can manage users should configure roles.

- [ ] **Step 2: Create the settings page**

Create `app/(dashboard)/settings/roles/page.tsx`:

```tsx
"use client"

import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { useAuth } from "@/contexts/auth-context"
import { useRolePermissions, useUpdateRolePermissions } from "@/hooks/queries/use-role-permissions"
import { FEATURES, type Feature } from "@/lib/permissions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"

const FEATURE_LABELS: Record<string, string> = {
  flows: "Flows",
  templates: "Templates",
  chat: "Chat",
  campaigns: "Campaigns",
  contacts: "Contacts",
  analytics: "Analytics",
  "settings.accounts": "Accounts",
  "settings.users": "User Management",
  "settings.teams": "Teams",
  "settings.chatbot": "Chatbot Settings",
  "settings.api-keys": "API Keys",
}

const BUILT_IN_ROLES = ["admin", "manager", "agent"] as const

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  agent: "Agent",
}

export default function RolesPage() {
  const { can } = useAuth()
  const { data: rolePermissions, isLoading } = useRolePermissions()
  const [editedFeatures, setEditedFeatures] = useState<Record<string, string[]>>({})
  const [savingRole, setSavingRole] = useState<string | null>(null)

  const updateAdmin = useUpdateRolePermissions("admin")
  const updateManager = useUpdateRolePermissions("manager")
  const updateAgent = useUpdateRolePermissions("agent")

  const mutationMap: Record<string, typeof updateAdmin> = {
    admin: updateAdmin,
    manager: updateManager,
    agent: updateAgent,
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const getFeaturesForRole = (role: string): string[] => {
    if (editedFeatures[role]) return editedFeatures[role]
    const serverFeatures = rolePermissions?.find((r) => r.role === role)?.features
    return serverFeatures ?? []
  }

  const toggleFeature = (role: string, feature: string) => {
    const current = getFeaturesForRole(role)
    const updated = current.includes(feature)
      ? current.filter((f) => f !== feature)
      : [...current, feature]
    setEditedFeatures((prev) => ({ ...prev, [role]: updated }))
  }

  const hasChanges = (role: string): boolean => {
    if (!editedFeatures[role]) return false
    const serverFeatures = rolePermissions?.find((r) => r.role === role)?.features ?? []
    const edited = editedFeatures[role]
    return JSON.stringify([...serverFeatures].sort()) !== JSON.stringify([...edited].sort())
  }

  const handleSave = async (role: string) => {
    const features = getFeaturesForRole(role)
    const mutation = mutationMap[role]
    if (!mutation) return

    setSavingRole(role)
    try {
      await mutation.mutateAsync(features)
      setEditedFeatures((prev) => {
        const next = { ...prev }
        delete next[role]
        return next
      })
      toast.success(`${ROLE_LABELS[role]} permissions updated`)
    } catch (err) {
      toast.error(`Failed to update ${ROLE_LABELS[role]} permissions`)
    } finally {
      setSavingRole(null)
    }
  }

  const canEdit = can("settings.users")

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader title="Roles & Permissions" />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Feature Access by Role</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 pr-4 font-medium">Feature</th>
                  {BUILT_IN_ROLES.map((role) => (
                    <th key={role} className="text-center py-3 px-4 font-medium">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((feature) => (
                  <tr key={feature} className="border-b last:border-0">
                    <td className="py-3 pr-4">{FEATURE_LABELS[feature] || feature}</td>
                    {BUILT_IN_ROLES.map((role) => {
                      const features = getFeaturesForRole(role)
                      const checked = features.includes(feature)
                      return (
                        <td key={role} className="text-center py-3 px-4">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleFeature(role, feature)}
                            disabled={!canEdit}
                            className="cursor-pointer"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-6 justify-end">
            {BUILT_IN_ROLES.map((role) => (
              hasChanges(role) && (
                <Button
                  key={role}
                  onClick={() => handleSave(role)}
                  disabled={savingRole === role || !canEdit}
                  size="sm"
                >
                  {savingRole === role ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save {ROLE_LABELS[role]}
                </Button>
              )
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Verify**

1. Login as admin → navigate to Settings > Roles
2. Table shows all features x all roles with checkboxes
3. Toggle a checkbox → "Save Manager" button appears
4. Click save → toast "Manager permissions updated"
5. Refresh page → change persists

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/settings/roles/page.tsx components/app-sidebar.tsx
git commit -m "feat(rbac): add Roles & Permissions settings page"
```

---

### Task 13: Phase B Integration Test

**Files:**
- No new files — end-to-end verification

- [ ] **Step 1: Test org-level permission customization**

1. Login as admin
2. Go to Settings > Roles
3. Remove "Templates" from Manager role
4. Save
5. Login as manager in another browser/incognito
6. Verify: "WhatsApp Templates" is gone from sidebar
7. Verify: direct URL `/templates` redirects to `/profile` (middleware still uses JWT role, but `can()` denies the page content)
8. Verify: API call to `/api/templates` returns 403

- [ ] **Step 2: Test adding features to Agent**

1. Admin goes to Settings > Roles
2. Add "Flows" to Agent role
3. Save
4. Login as agent
5. Verify: "Flows" now appears in sidebar
6. Verify: `/flows` loads correctly
7. Verify: API calls to `/api/magic-flow/*` work

- [ ] **Step 3: Test invalid feature validation**

Via curl or API client, try assigning invalid feature:
```bash
curl -X PUT \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"features":["settings"]}' \
  http://localhost:9000/api/settings/role-permissions/manager
```
Expected: 400 "Invalid feature: settings"

- [ ] **Step 4: Test Redis cache invalidation**

1. Update manager permissions via API
2. Immediately (within 5min cache TTL), verify manager sees updated permissions
3. The PUT handler invalidates cache, so changes should be immediate

- [ ] **Step 5: Run all lints and tests**

```bash
# Go (fs-whatsapp)
cd /path/to/fs-whatsapp && golangci-lint run ./... && go test ./...

# React (magic-flow)
cd /path/to/magic-flow && npx tsc --noEmit && npx vitest run
```

All must pass.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(rbac): fixes from Phase B integration testing"
```

---

### Task 14: Update Documentation

**Files:**
- Modify: `magic-flow/ROADMAP.md` — mark 3.10 as shipped
- Check: `fs-whatsapp/docs/src/content/docs/` — update API reference if needed

- [ ] **Step 1: Update ROADMAP.md**

In `magic-flow/ROADMAP.md`, update section 3.10:

```markdown
### 3.10 RBAC ✅

MagicFlow RBAC shipped in two phases:
- **Phase A:** AuthProvider, useAuth() hook, canAccess() permission system, middleware JWT verification + route gating, sidebar filtering, disabled buttons with tooltips
- **Phase B:** org_role_permissions table, GET/PUT endpoints, Redis-cached dynamic backend middleware, Roles & Permissions settings page

> Shipped: magic-flow #XX, fs-whatsapp #XX
```

- [ ] **Step 2: Check if fs-whatsapp docs need updating**

Check `fs-whatsapp/docs/src/content/docs/` for API reference. If role permissions endpoints should be documented, add them.

- [ ] **Step 3: Commit**

```bash
git add magic-flow/ROADMAP.md
git commit -m "docs: mark RBAC as shipped in roadmap"
```
